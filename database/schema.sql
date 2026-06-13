-- ============================================================================
-- CONSTISTANT — Construction Readiness Platform
-- Comprehensive PostgreSQL / Supabase schema
--
-- Engines covered: Drawing Intelligence, QuantiTake (BOQ+BBS),
--                   Construction Planner, Resource Hub, Readiness Check
--
-- Conventions:
--   - All lengths in mm, all money in THB, all areas in sqm.
--   - "design_standard" is text + CHECK (not a real ENUM) so new standards
--     can be added with an ALTER TABLE ... DROP/ADD CONSTRAINT instead of
--     ALTER TYPE (which requires care inside transactions on Postgres).
--   - JSONB is used ONLY for genuinely variable sub-structures:
--       * section_dimensions (varies by element_type)
--       * bend_dimensions (varies by BS8666/EIT shape code)
--       * type_specific (building_type-dependent extra fields)
--       * raw_gemini_response / processing_log / confidence_flags-ish data
--       * section_properties for steel sections
--   - Every project-scoped table carries project_id for RLS + isolation,
--     even when it could technically be derived via a join, to keep RLS
--     policies a single flat predicate (project_id in user's projects).
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- SECTION 0: REFERENCE / LOOKUP TABLES (no project dependency)
-- These are seeded once and shared across all projects. Project-specific
-- overrides live in productivity_rates / rate_library (Section 4/2) which
-- DO carry project_id and take precedence when present.
-- ============================================================================

-- diameter_mm -> kg/m, per วสท. / TIS 24-2548
create table rebar_unit_weights (
  diameter_mm     numeric primary key,
  kg_per_meter    numeric not null,
  bar_type        text not null default 'DB' check (bar_type in ('DB','RB')),
  standard        text default 'TIS24-2548'
);

-- Concrete grade naming bridge: Thai EIT (M-series, ksc) <-> ACI/WSD (fc', MPa)
create table concrete_grades (
  grade_label       text primary key,        -- "M250" (EIT/WSD naming used in drawings)
  fc_prime_mpa      numeric not null,         -- ACI 318 equivalent f'c
  fck_ksc           numeric,                  -- EIT ksc cube strength
  design_standard   text not null default 'EIT' check (design_standard in ('ACI318','EIT','WSD')),
  notes             text
);

-- Steel section profile library (for steel-frame / hybrid buildings)
create table steel_sections (
  profile             text primary key,         -- "H-200x200x8x12", "I-300x150x6.5x9"
  profile_type        text check (profile_type in ('h_beam','i_beam','angle','channel','plate','tube')),
  weight_per_meter_kg numeric not null,
  -- JSONB: section properties vary by profile_type (Ix, Iy, Zx, A, etc.) — no
  -- fixed column set covers H/I/angle/channel uniformly without huge sparse tables.
  section_properties  jsonb default '{}'::jsonb,
  steel_grade_default text  -- 'SS400' | 'SM490'
);

-- BS 8666 / EIT bar bending shape codes
create table shape_codes (
  shape_code            text primary key,   -- "00","11","21","38" ...
  description           text,
  standard              text default 'BS8666',
  -- JSONB: each shape code defines a different SET of bend dimensions
  -- (A,B,C,D / radius / hook angle) — schema genuinely varies per code.
  bend_dimension_schema jsonb default '{}'::jsonb
);

-- Standard WBS activity catalog (phase, default productivity)
create table wbs_activity_library (
  id                  uuid primary key default gen_random_uuid(),
  wbs_code            text not null unique,   -- "2.1.1"
  activity_name       text not null,
  phase               text not null check (phase in ('preliminary','structure','architectural','mep','external')),
  work_type           text,                    -- "column_concrete", "masonry", ... matches productivity_rates.work_type
  default_unit        text,
  -- JSONB: default_productivity carries {output_per_day, unit, crew_size}
  -- which differs per work_type and is purely advisory/seed data.
  default_productivity jsonb default '{}'::jsonb,
  cure_lag_days       int default 0,
  created_at          timestamptz not null default now()
);
create index idx_wbs_library_phase on wbs_activity_library(phase);

-- province x month -> rain days / schedule buffer factor (Open-Meteo derived)
create table weather_buffer_table (
  province        text not null,
  month           int not null check (month between 1 and 12),
  avg_rain_days   numeric not null,
  buffer_factor   numeric not null check (buffer_factor between 0 and 1),
  data_source     text default 'open-meteo',
  updated_at      timestamptz not null default now(),
  primary key (province, month)
);

-- ============================================================================
-- SECTION 1: PROJECT & SITE CONTEXT (Tier 0)
-- ============================================================================

create table projects (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  name                    text not null,
  client_name             text,
  -- JSONB: free-form contact channels (phone/line/email) — no reporting
  -- ever filters on these individually, normalizing buys nothing.
  client_contact          jsonb default '{}'::jsonb,
  location_lat            double precision,
  location_lng            double precision,
  location_label          text,
  province                text,                 -- drives weather_buffer_table lookups
  start_date              date,
  target_completion_date  date,
  design_standard         text not null default 'EIT' check (design_standard in ('ACI318','EIT','WSD')),
  status                  text not null default 'draft' check (status in ('draft','active','completed','on_hold')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index idx_projects_user on projects(user_id);

-- A project may be delivered in phases, each with its own BOQ/schedule slice.
create table project_phases (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  phase_name      text not null,           -- "Phase 1 - Building A & B"
  phase_order     int not null default 1,
  planned_start   date,
  planned_finish  date,
  status          text not null default 'planned' check (status in ('planned','active','completed')),
  created_at      timestamptz not null default now()
);
create index idx_phases_project on project_phases(project_id);

-- A project site may contain multiple buildings with different structural
-- systems (e.g. a hybrid project: low-rise RC podium + steel-frame tower).
create table buildings (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  phase_id            uuid references project_phases(id) on delete set null,
  name                text not null default 'Building A',
  building_type       text not null default 'residential_rc'
                        check (building_type in ('residential_rc','commercial_rc','industrial_steel','mixed_use','hybrid')),
  -- free text summary; per-floor structural system mix (for hybrid RC/steel)
  -- is captured at element_types level via element_type + steel_section_profile.
  structural_system   text,
  floors_above_ground int default 1,
  floors_below_ground int default 0,
  typical_floor_height_mm int,
  total_gfa_sqm       numeric,
  footprint_sqm       numeric,
  -- JSONB: building_type-specific extras, e.g. industrial_steel:
  -- {"typical_span_m":12,"crane_capacity_ton":5}; residential_rc:
  -- {"units_per_floor":4}. Avoids dozens of nullable top-level columns.
  type_specific       jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_buildings_project on buildings(project_id);
create index idx_buildings_phase on buildings(phase_id);

-- Site conditions can apply to the whole site (building_id null) or be
-- overridden per-building (e.g. different soil report for a tower pad).
create table site_conditions (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  building_id             uuid references buildings(id) on delete cascade,
  soil_class              text,           -- e.g. "Bangkok Soft Clay (0-15m)"
  soil_bearing_capacity_ksc numeric,
  seismic_zone            text,           -- EIT 1301/1302 zone designation
  seismic_design_standard text default 'EIT' check (seismic_design_standard in ('ACI318','EIT','WSD')),
  flood_zone              text check (flood_zone in ('high','medium','low','none')),
  flood_design_level_m    numeric,
  wind_speed_ms           numeric,
  site_orientation_deg    numeric check (site_orientation_deg >= 0 and site_orientation_deg < 360),
  groundwater_level_m     numeric,
  extra_data              jsonb default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index idx_site_conditions_project on site_conditions(project_id);
create index idx_site_conditions_building on site_conditions(building_id);

-- ============================================================================
-- SECTION 2: DRAWING REGISTRY (Tier 1)
-- ============================================================================

-- One row per uploaded drawing FILE. Revisions are separate rows linked via
-- superseded_by so a new upload never destroys history; only one revision
-- per drawing_number is is_active=true and feeds extraction/BOQ.
create table drawing_files (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  building_id     uuid references buildings(id) on delete set null,
  file_name       text not null,
  file_url        text not null,
  drawing_number  text,                 -- "S-101"
  revision        text default 'A',
  sheet_type      text check (sheet_type in ('plan','section','detail','schedule','elevation','combined')),
  discipline      text check (discipline in ('architectural','structural','mep','civil')),
  floor_level     text,
  page_count      int,
  is_active       boolean not null default true,
  superseded_by   uuid references drawing_files(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index idx_drawing_files_project on drawing_files(project_id);
create index idx_drawing_files_building on drawing_files(building_id);
create index idx_drawing_files_active on drawing_files(project_id, is_active);
create unique index uq_drawing_active_per_number
  on drawing_files(project_id, drawing_number)
  where is_active;

-- Each Gemini extraction run on a drawing file. Re-running extraction (e.g.
-- after a revision upload) creates a NEW row — never overwrites a prior
-- result — so element_types/instances can reference the job that produced
-- them and old BOQ/BBS data stays valid until a new extraction is "promoted".
create table drawing_extraction_jobs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  drawing_file_id     uuid not null references drawing_files(id) on delete cascade,
  pass_number         int not null default 1,  -- 1=section/detail sheet, 2=floor plan counts
  status              text not null default 'pending' check (status in ('pending','processing','done','failed')),
  confidence_score    numeric check (confidence_score between 0 and 1),
  -- JSONB: full Gemini response kept for audit/debug/reprocessing without
  -- re-calling the API; shape is whatever the prompt-of-the-day returns.
  raw_gemini_response jsonb,
  -- JSONB: ordered list of {ts, level, message} processing log entries.
  processing_log      jsonb default '[]'::jsonb,
  error_message       text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);
create index idx_extraction_jobs_drawing on drawing_extraction_jobs(drawing_file_id);
create index idx_extraction_jobs_project_status on drawing_extraction_jobs(project_id, status);

-- ============================================================================
-- SECTION 3: STRUCTURAL ELEMENT LIBRARY (Drawing Intelligence output, Tier 1)
-- ============================================================================

-- One row per DESIGNED element type/mark (e.g. "C1", "B2", "SB1") — its
-- cross-section, grade, rebar pattern template. Counted instances per floor
-- live in structural_element_instances below.
create table element_types (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  building_id         uuid references buildings(id) on delete cascade,
  extraction_job_id   uuid references drawing_extraction_jobs(id) on delete set null,
  element_type        text not null check (element_type in
                        ('column','beam','girder','slab','footing','staircase','wall','steel_beam','steel_column','bracing')),
  mark                text not null,            -- "C1","B2","SB1"
  design_standard     text not null default 'EIT' check (design_standard in ('ACI318','EIT','WSD')),
  -- JSONB: cross-section dims differ per element_type (column: width/depth;
  -- slab: thickness; staircase: tread/riser/flight count) — one flexible
  -- bag avoids ~15 nullable columns where only 2-3 apply to any given row.
  section_dimensions  jsonb default '{}'::jsonb,
  concrete_grade      text references concrete_grades(grade_label),
  steel_grade         text,                     -- rebar grade: 'SR24'|'SD30'|'SD40'
  steel_section_profile text references steel_sections(profile),  -- for steel_* element_type
  connection_type     text,                     -- steel only: 'bolted'|'welded'|'pinned'|'moment'
  confidence_score    numeric check (confidence_score between 0 and 1),
  confidence_flags    text[] default '{}',
  is_manual_override  boolean not null default false,
  raw_source          jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (project_id, building_id, mark)
);
create index idx_element_types_project on element_types(project_id);
create index idx_element_types_building on element_types(building_id);

-- One row per (element_type, floor) placement — the COUNT of that element
-- on that floor, read off the floor-plan pass. Nullable building_id/floor
-- support partial drawing sets (only some floors drawn so far).
create table structural_element_instances (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  building_id         uuid references buildings(id) on delete cascade,
  element_type_id     uuid not null references element_types(id) on delete cascade,
  drawing_file_id     uuid references drawing_files(id) on delete set null,
  floor_level         text,                     -- 'F1','F2','RF','B1'
  grid_refs           text[] default '{}',      -- ["A-1","A-2"]
  count               int not null default 0,
  span_length_m       numeric,                  -- beams/girders
  floor_area_sqm      numeric,                  -- slabs
  confidence_score    numeric check (confidence_score between 0 and 1),
  confidence_flags    text[] default '{}',
  is_manual_override  boolean not null default false,
  manual_override_note text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_element_instances_project_floor on structural_element_instances(project_id, floor_level);
create index idx_element_instances_type on structural_element_instances(element_type_id);
create index idx_element_instances_building on structural_element_instances(building_id);

-- Rebar schedule per element_type (one element_type -> many bar marks).
create table rebar_schedule_items (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  element_type_id     uuid not null references element_types(id) on delete cascade,
  bar_mark            text not null,            -- "T1","T2"
  bar_role            text not null check (bar_role in ('main','stirrup','top','bottom','extra','distribution')),
  diameter_mm         numeric not null references rebar_unit_weights(diameter_mm),
  bar_type            text not null default 'DB' check (bar_type in ('DB','RB')),
  spacing_mm          numeric,
  length_mm           numeric,
  quantity            int not null default 1,
  shape_code          text references shape_codes(shape_code) default '00',
  -- JSONB: bend dimensions A/B/C/D/radius/hook — set of fields is dictated
  -- by shape_code (see shape_codes.bend_dimension_schema), genuinely variable.
  bend_dimensions     jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index idx_rebar_schedule_element on rebar_schedule_items(element_type_id);
create index idx_rebar_schedule_project on rebar_schedule_items(project_id);

-- Design loads per floor/zone — feeds structural summary & readiness checks.
create table load_data (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  building_id     uuid references buildings(id) on delete cascade,
  floor_level     text,
  zone            text,                     -- "Zone A", "Roof", null = whole floor
  load_type       text not null check (load_type in ('dead','live','wind','seismic')),
  value_kpa       numeric not null,         -- kN/m2 (wind/seismic stored as base shear coeff in extra_data if needed)
  design_standard text not null default 'EIT' check (design_standard in ('ACI318','EIT','WSD')),
  extra_data      jsonb default '{}'::jsonb,
  notes           text,
  created_at      timestamptz not null default now()
);
create index idx_load_data_project_floor on load_data(project_id, floor_level);

-- ============================================================================
-- SECTION 4: BOQ — Bill of Quantities (Tier 2)
-- ============================================================================

-- A new "version" is created whenever the BOQ is recomputed (e.g. drawing
-- revision promoted). Only one is_active=true revision per (project, phase,
-- building) feeds the Construction Planner.
create table boq_revisions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  building_id   uuid references buildings(id) on delete cascade,
  phase_id      uuid references project_phases(id) on delete set null,
  version_number int not null,
  -- JSONB: free-form list of {field, old_value, new_value, reason} diffs —
  -- shape varies per change type (re-extraction vs manual edit).
  change_log    jsonb default '[]'::jsonb,
  is_active     boolean not null default true,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index idx_boq_revisions_project on boq_revisions(project_id);
create unique index uq_boq_active_revision
  on boq_revisions(project_id, building_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'))
  where is_active;

-- Project- or global-rate library. Project-scoped rows (project_id not null)
-- override global rows (project_id null) for the same work_section/item_name.
create table rate_library (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,  -- null = global
  work_section  text not null check (work_section in ('earthwork','concrete','rebar','formwork','masonry','mep','finishing','steel')),
  item_name     text not null,             -- "คอนกรีต M250 (เทปั๊ม)"
  unit          text not null,
  price_thb     numeric not null,
  region        text not null default 'bangkok' check (region in ('bangkok','central','north','northeast','south')),
  source        text not null default 'manual' check (source in ('eit_standard','market','manual')),
  effective_date date not null default current_date,
  created_at    timestamptz not null default now()
);
create index idx_rate_library_lookup on rate_library(work_section, item_name, region, effective_date desc);
create index idx_rate_library_project on rate_library(project_id);

create table boq_items (
  id                              uuid primary key default gen_random_uuid(),
  project_id                      uuid not null references projects(id) on delete cascade,
  building_id                     uuid references buildings(id) on delete cascade,
  phase_id                        uuid references project_phases(id) on delete set null,
  boq_revision_id                 uuid not null references boq_revisions(id) on delete cascade,
  structural_element_instance_id  uuid references structural_element_instances(id) on delete set null,
  rate_library_id                 uuid references rate_library(id) on delete set null,
  item_code      text not null,            -- "STR-B1-F1"
  description    text not null,
  work_section   text not null check (work_section in ('earthwork','concrete','rebar','formwork','masonry','mep','finishing','steel')),
  floor_level    text,
  unit           text not null,
  quantity       numeric not null default 0,
  unit_rate_thb  numeric not null default 0,
  amount_thb     numeric generated always as (quantity * unit_rate_thb) stored,
  is_manual      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_boq_items_revision on boq_items(boq_revision_id);
create index idx_boq_items_project_floor on boq_items(project_id, floor_level);
create index idx_boq_items_element on boq_items(structural_element_instance_id);

-- ============================================================================
-- SECTION 5: BBS — Bar Bending Schedule (Tier 2)
-- ============================================================================

-- Suppliers is defined here (ahead of Section 8) because bbs_bundles
-- references it for steel ordering. project_id null = shared/global catalog.
create table suppliers (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,
  name            text not null,
  material_types  text[] default '{}',     -- ['rebar','cement','aggregate']
  region          text check (region in ('bangkok','central','north','northeast','south')),
  contact_phone   text,
  contact_line    text,
  credit_days     int,
  min_order_ton   numeric,
  created_at      timestamptz not null default now()
);
create index idx_suppliers_project on suppliers(project_id);
create index idx_suppliers_region on suppliers(region);

-- Steel ordering bundles: groups bbs_items by diameter for cutting/order
-- optimization (mill lengths are typically 10/12m).
create table bbs_bundles (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  bundle_code         text not null,           -- "DB20-BUNDLE-01"
  diameter_mm         numeric not null references rebar_unit_weights(diameter_mm),
  standard_length_mm  numeric not null default 12000,
  total_weight_kg     numeric not null default 0,
  supplier_id         uuid references suppliers(id) on delete set null,
  order_status        text not null default 'planned' check (order_status in ('planned','ordered','delivered')),
  created_at          timestamptz not null default now()
);
create index idx_bbs_bundles_project on bbs_bundles(project_id);

create table bbs_items (
  id                              uuid primary key default gen_random_uuid(),
  project_id                      uuid not null references projects(id) on delete cascade,
  boq_item_id                     uuid references boq_items(id) on delete set null,
  structural_element_instance_id  uuid references structural_element_instances(id) on delete set null,
  bundle_id                       uuid references bbs_bundles(id) on delete set null,
  member_id           text,                    -- "2B1" — physical member position
  bar_mark            text not null,           -- "T1"
  bar_type            text not null default 'DB' check (bar_type in ('DB','RB')),
  steel_grade         text,
  diameter_mm         numeric not null references rebar_unit_weights(diameter_mm),
  shape_code          text references shape_codes(shape_code) default '00',
  bend_dimensions     jsonb default '{}'::jsonb,  -- see rebar_schedule_items rationale
  cut_length_mm       numeric not null,
  total_bars          int not null,
  unit_weight_kg_per_m numeric not null,        -- snapshot from rebar_unit_weights at compute time
  total_weight_kg     numeric generated always as
                        (total_bars * cut_length_mm / 1000.0 * unit_weight_kg_per_m) stored,
  created_at          timestamptz not null default now()
);
create index idx_bbs_items_project on bbs_items(project_id);
create index idx_bbs_items_boq on bbs_items(boq_item_id);
create index idx_bbs_items_bundle on bbs_items(bundle_id);

-- ============================================================================
-- SECTION 6: CONSTRUCTION SCHEDULE (Tier 3)
-- ============================================================================

create table schedule_activities (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  building_id             uuid references buildings(id) on delete cascade,
  phase_id                uuid references project_phases(id) on delete set null,
  wbs_activity_library_id uuid references wbs_activity_library(id) on delete set null,
  boq_item_id             uuid references boq_items(id) on delete set null,
  wbs_code        text not null,             -- "2.1.1"
  activity_name   text not null,
  activity_phase  text not null check (activity_phase in ('preliminary','structure','architectural','mep','external')),
  work_type       text,                      -- matches productivity_rates.work_type
  floor_level     text,
  planned_start   date,
  planned_finish  date,
  actual_start    date,
  actual_finish   date,
  duration_days   numeric,
  float_days      numeric,
  is_critical     boolean not null default false,
  crew_size       int,
  productivity_rate numeric,                 -- snapshot output_per_day used at compute time
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_schedule_activities_project on schedule_activities(project_id);
create index idx_schedule_activities_project_floor on schedule_activities(project_id, floor_level);
create index idx_schedule_activities_critical on schedule_activities(project_id, is_critical);

create table activity_dependencies (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  activity_id     uuid not null references schedule_activities(id) on delete cascade,
  predecessor_id  uuid not null references schedule_activities(id) on delete cascade,
  dependency_type text not null default 'FS' check (dependency_type in ('FS','SS','FF','SF')),
  lag_days        int not null default 0,
  created_at      timestamptz not null default now(),
  unique (activity_id, predecessor_id)
);
create index idx_activity_deps_activity on activity_dependencies(activity_id);
create index idx_activity_deps_predecessor on activity_dependencies(predecessor_id);

-- Per-project snapshot of weather buffers actually applied (derived from
-- weather_buffer_table at the time the schedule was computed, so historical
-- schedules remain reproducible even if the lookup table is later updated).
create table project_weather_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  schedule_activity_id uuid references schedule_activities(id) on delete cascade,
  month_of_work       int not null check (month_of_work between 1 and 12),
  avg_rain_days       numeric,
  buffer_factor       numeric,
  data_source         text default 'open-meteo',
  created_at          timestamptz not null default now()
);
create index idx_weather_snapshots_activity on project_weather_snapshots(schedule_activity_id);

create table milestones (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  building_id         uuid references buildings(id) on delete cascade,
  milestone_name      text not null,        -- "Foundation Complete", "Structure Topped Out"
  target_date         date,
  actual_date         date,
  status              text not null default 'pending' check (status in ('pending','on_track','at_risk','done')),
  linked_activity_id  uuid references schedule_activities(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index idx_milestones_project on milestones(project_id);

-- ============================================================================
-- SECTION 7: MATERIAL DELIVERY SCHEDULE (Tier 3)
-- ============================================================================

create table material_deliveries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  boq_item_id     uuid not null references boq_items(id) on delete cascade,
  schedule_activity_id uuid references schedule_activities(id) on delete set null,
  material_type   text not null,           -- "rebar DB20", "ready-mix M250"
  quantity_needed numeric not null,
  unit            text not null,
  supplier_id     uuid references suppliers(id) on delete set null,
  order_date      date,
  lead_time_days  int,
  delivery_date   date,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','ordered','in_transit','delivered','delayed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_material_deliveries_project on material_deliveries(project_id);
create index idx_material_deliveries_boq on material_deliveries(boq_item_id);
create index idx_material_deliveries_status on material_deliveries(project_id, delivery_status);

-- ============================================================================
-- SECTION 8: RESOURCE HUB (Tier 4)
-- ============================================================================

-- Workers: project_id null = shared labor pool entry available across projects.
create table workers (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,
  name            text not null,
  trade           text not null,           -- 'carpenter'|'steel_fixer'|'mason'|'electrician'|...
  daily_rate_thb  numeric,
  phone           text,
  created_at      timestamptz not null default now()
);
create index idx_workers_project on workers(project_id);
create index idx_workers_trade on workers(trade);

create table crew_assignments (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  activity_id     uuid not null references schedule_activities(id) on delete cascade,
  trade           text not null,
  crew_size       int not null default 1,
  start_date      date not null,
  end_date        date,
  created_at      timestamptz not null default now()
);
create index idx_crew_assignments_activity on crew_assignments(activity_id);
create index idx_crew_assignments_project on crew_assignments(project_id);

-- A worker's assignment window to a project (for shared-pool workers).
create table worker_assignments (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  worker_id       uuid not null references workers(id) on delete cascade,
  crew_assignment_id uuid references crew_assignments(id) on delete set null,
  start_date      date not null,
  end_date        date,
  created_at      timestamptz not null default now()
);
create index idx_worker_assignments_project on worker_assignments(project_id);
create index idx_worker_assignments_worker on worker_assignments(worker_id);

-- Productivity benchmark: trade x work_type x region -> output/day. Rows
-- with project_id set are user overrides and take precedence (is_override=true).
create table productivity_rates (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,  -- null = global default
  trade           text not null,
  work_type       text not null,
  region          text not null default 'bangkok' check (region in ('bangkok','central','north','northeast','south')),
  unit            text not null,           -- 'm3'|'kg'|'m2'
  output_per_day  numeric not null,
  source          text not null default 'standard' check (source in ('standard','regional','project_override')),
  is_override     boolean not null default false,
  created_at      timestamptz not null default now()
);
create unique index uq_productivity_lookup
  on productivity_rates(coalesce(project_id, '00000000-0000-0000-0000-000000000000'), trade, work_type, region);

create table payroll_records (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  worker_id           uuid not null references workers(id) on delete cascade,
  period_start        date not null,
  period_end          date not null,
  days_worked         numeric not null default 0,
  ot_hours            numeric not null default 0,
  ot_multiplier       numeric not null default 1.5,
  daily_rate_thb      numeric not null,
  amount_paid_thb     numeric generated always as (days_worked * daily_rate_thb) stored,
  sso_deduction_thb   numeric not null default 0,
  net_pay_thb         numeric generated always as (days_worked * daily_rate_thb - sso_deduction_thb) stored,
  created_at          timestamptz not null default now()
);
create index idx_payroll_project_period on payroll_records(project_id, period_start);
create index idx_payroll_worker on payroll_records(worker_id);

-- ============================================================================
-- SECTION 9: READINESS CHECK (Tier 5)
-- ============================================================================

-- Snapshot taken whenever readiness is (re)computed; check_items optionally
-- link back to a version to preserve point-in-time RAG history.
create table readiness_check_versions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  snapshot_date   date not null default current_date,
  overall_status  text not null check (overall_status in ('red','amber','green')),
  created_at      timestamptz not null default now()
);
create index idx_readiness_versions_project on readiness_check_versions(project_id, snapshot_date desc);

create table readiness_check_items (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  version_id      uuid references readiness_check_versions(id) on delete cascade,
  category        text not null check (category in ('legal','financial','technical','site','safety')),
  item_description text not null,
  required_document text,
  status          text not null check (status in ('red','amber','green')),
  notes           text,
  recommendation  text,
  linked_entity_type text,    -- 'schedule_activity'|'boq_item'|'drawing_file'
  linked_entity_id   uuid,
  auto_generated  boolean not null default true,
  checked_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_readiness_items_project on readiness_check_items(project_id);
create index idx_readiness_items_version on readiness_check_items(version_id);
create index idx_readiness_items_status on readiness_check_items(project_id, status);

create table readiness_documents (
  id              uuid primary key default gen_random_uuid(),
  check_item_id   uuid not null references readiness_check_items(id) on delete cascade,
  file_name       text not null,
  file_url        text not null,
  uploaded_at     timestamptz not null default now()
);
create index idx_readiness_documents_item on readiness_documents(check_item_id);

-- ============================================================================
-- SECTION 10: ROW LEVEL SECURITY (pattern)
-- Apply this same pattern to every project-scoped table: a row is visible
-- if its project_id (or its parent's project_id, for child tables) belongs
-- to a project owned by auth.uid(). Shown here for `projects` and one
-- representative child table; replicate for the rest during migration.
-- ============================================================================

alter table projects enable row level security;
create policy projects_owner on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table boq_items enable row level security;
create policy boq_items_owner on boq_items
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  ) with check (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Repeat the boq_items_owner pattern (substitute the table name) for:
-- project_phases, buildings, site_conditions, drawing_files,
-- drawing_extraction_jobs, element_types, structural_element_instances,
-- rebar_schedule_items, load_data, boq_revisions, bbs_bundles, bbs_items,
-- schedule_activities, activity_dependencies, project_weather_snapshots,
-- milestones, material_deliveries, worker_assignments, crew_assignments,
-- payroll_records, readiness_check_versions, readiness_check_items.
-- For nullable-project_id tables (suppliers, workers, productivity_rates,
-- rate_library), allow `project_id is null OR project_id in (...)` so
-- global/shared rows stay visible to everyone.
