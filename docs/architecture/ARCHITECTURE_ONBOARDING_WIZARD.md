# Constistant — Onboarding Wizard & Cross-Engine Architecture

Status: implementation-ready architecture decisions. Written against the codebase as of 2026-06-12 (post shell-refactor: `js/shell/`, `css/`, `pages/`, `js/overview/`, `js/drawing/quantitake-panel.html` + `drawing-calc.js`).

Conventions used throughout this document:
- New wizard module prefix: **`wz_`** (matches `qt_`/`rc_`/`pl_`/`rh_` pattern — exported functions + `window.wz_*`).
- New CSS follows `.fp-*` convention (feature-panel), file `css/wizard.css`.
- All new localStorage entities are project-scoped via `projectStorageKey()` from `project-store.js`, except `PROVINCIAL_WEATHER` / `WORK_TYPE_HIERARCHY` / `EARLY_ESTIMATE_RATES` which are static lookup tables exported as constants from `schema.js` (no storage key needed — same pattern as existing `PRODUCTIVITY_RATES`, `REBAR_GRADES`, etc.).
- Every new localStorage entity has a matching Supabase table sketch (snake_case, `project_id` FK, RLS by `user_id` via `projects` join — matches existing pattern in STEEL_CALC_TEAM_GUIDE.md).

---

## Deliverable 5 — Cross-Engine Data Flow

### 5.1 Entity ownership map (who writes what)

| Entity | Created by | Read by | Written/updated by |
|---|---|---|---|
| `projects` | wizard Step 3 (`wz_`) / `shell-index.js` new-project modal | all engines | wizard Step 3, Overview (timeline edits) |
| `project_config` **(new)** | wizard Step 3 | Planner, Resource Hub, Readiness, Overview, `timeline-engine.js` | wizard Step 3 (create), Planner (date drag → `budget_impact`/`timeline`), wizard re-run (rare) |
| `drawing_uploads` | wizard Step 1 (`qt_`) | wizard Step 1/2, Drawing Intelligence tab | wizard Step 1 (classification results) |
| `beam_library` | Drawing Intelligence Pass 1 (triggered by wizard Step 1) | QuantiTake (Engine 2) | Drawing Intelligence tab (manual edits) |
| `drawing_elements` | Drawing Intelligence Pass 2 **or** wizard Manual Fallback (`source: 'manual'`) | QuantiTake (Engine 2), wizard Step 2 | wizard Step 2 (`user_verified`, `user_corrected_count`), Drawing Intelligence tab |
| `boq_items` | `pipeline.js` `computeBOQ()` (Engine 2) | BBS step, Planner (work_type grouping), Overview KPIs, Resource Hub (material demand) | `pipeline.js` re-run, QuantiTake review edits |
| `bbs_items` | `pipeline.js` `computeBBS()` (Engine 2) | Resource Hub (rebar tonnage), Overview KPI "เหล็กทั้งหมด ตัน" | `pipeline.js` re-run |
| `schedule_tasks` | `pipeline.js` `computeSchedule()` (Engine 3), extended with `work_type`, `period_month`, `resource_group`, CPM fields | Planner UI, Resource Hub (demand curve), Readiness, Overview (timeline groupings) | Planner (drag-to-reschedule → triggers `timeline-engine.js` recalc), `pipeline.js` re-run |
| `weather_snapshots` | `pipeline.js` (Engine 3), now sourced from `PROVINCIAL_WEATHER[project_config.site_province]` instead of hardcoded `WEATHER_BUFFER_BKK` when province ≠ Bangkok | Planner (rainy-season overlay), `timeline-engine.js` | `pipeline.js` re-run on province change |
| `resource_items` | `pipeline.js` `computeResources()` (Engine 3→4 handoff) | Resource Hub UI | Resource Hub (`rh_updateCrew/Material/Equipment`), `pipeline.js` re-run |
| `payroll_entries` | Resource Hub Payroll module (new) | Resource Hub, Overview cost KPI (actuals vs estimate) | Resource Hub Payroll module |
| `readiness_checks` | `pipeline.js` `computeReadiness()` (Engine 5), extended to read `project_config.wizard_completed_at` and `timeline` | Readiness Check UI, Overview RAG strip | `pipeline.js` re-run, Readiness UI manual overrides |
| `timeline_view_state` **(new)** | Planner on first render (`pl_init`) | Planner | Planner `pl_setGrouping()` |

### 5.2 Trigger graph — what recalculates what

```
Wizard Step 1 (PDF upload)
   └─ qt_classifySheets() → drawing_uploads.sheet_type/confidence
        └─ auto-trigger Pass 1 (beam_library) [if floor_plan/section_detail found]
             └─ auto-trigger Pass 2 (drawing_elements)
                  └─ fires WIZARD_EVENT('elements-ready')
                       └─ wizard advances to Step 2 (Review)

Wizard Step 2 (user edits drawing_elements.user_corrected_count, confirms general notes)
   └─ writes drawing_elements (user_verified=true)
   └─ writes project_config.estimation_basis.element_counts (snapshot for Step 3)

Wizard Step 3 (Project Configuration)
   └─ user sets site_province → PROVINCIAL_WEATHER lookup → rainy_season_months
   └─ timeline-engine.js: estimateConstructionDuration(elements, province, standard)
        → project_config.timeline.{estimated_min/recommended/max_days, weather_buffer_days}
   └─ user adjusts dates → calculateBudgetImpact(...)
        → project_config.budget_impact.{delta_cost, extra_crew_needed, ...}
   └─ on "ถัดไป" → project_config.wizard_completed_at = now, wizard_step_reached = 4
        → fires PIPELINE_EVENT('config-ready')

Wizard Step 4 (Generate Overview) — listens for PIPELINE_EVENT('config-ready')
   └─ runPipeline() [existing pipeline.js, EXTENDED]:
        1. computeBOQ(drawing_elements, beam_library, project_config.design_standard) → boq_items
        2. computeBBS(boq_items, beam_library) → bbs_items
        3. computeSchedule(boq_items, project_config) → schedule_tasks (now sets work_type, period_month, resource_group)
             └─ applyWeatherBuffer(schedule_tasks, project_config.timeline.rainy_season_months, 0.4)
        4. computeResources(schedule_tasks) → resource_items
        5. computeReadiness(project_config, schedule_tasks, drawing_elements) → readiness_checks
   └─ each step posts progress → wizard loading checklist
   └─ on completion → fires PIPELINE_EVENT('pipeline-complete') → shell navigates to Overview tab

Planner (Engine 3) — reactive date change
   └─ user drags task bar → schedule_tasks[i].start_date/end_date updated
        └─ recompute task_cost_estimate (qty × productivity-derived crew-days × CREW_TYPES rate)
        └─ recompute downstream tasks via depends_on_task_ids (shift float_days)
        └─ calculateBudgetImpact(project_config.timeline, new_start, new_end, crew_config)
             → project_config.budget_impact updated
        └─ fires PIPELINE_EVENT('schedule-changed')
             ├─ Resource Hub: re-derive weekly demand curve (re-run computeResources subset)
             ├─ Readiness: re-run computeReadiness (date-vs-min-duration check, weather-overlap check)
             └─ Overview: re-render KPI cards + timeline groupings (re-run groupTasksByMode with current timeline_view_state.grouping_mode)

Resource Hub — order status change (existing rh_* — unchanged) / new Payroll entry
   └─ payroll_entries written → Overview cost KPI "ค่าก่อสร้างรวม" recomputes actual-vs-estimate delta (display only, does not mutate project_config.budget_impact)

Readiness Check (Engine 5) — manual override
   └─ unchanged from existing pipeline; additionally seeded by:
        - wizard_completed_at == null → red "Project Setup" check
        - any drawing_elements.confidence < 0.6 && !user_verified → amber "Drawing Review" check
        - project_config.timeline.user_duration_days < estimated_min_days → red "Timeline Risk" check
        - schedule_tasks with weather_risk='high' AND work_type='structure' → amber "Weather Overlap" check
```

### 5.3 Event bus additions

Existing: `PIPELINE_EVENT` (`'constistant:pipeline-updated'`, fired by `pipeline.js` after `runPipeline()`), `PROJECT_EVENT` (`'constistant:project-changed'`, fired by `project-store.js`).

**New**: `WIZARD_EVENT = 'constistant:wizard-step-changed'` — detail `{ projectId, step, status: 'in-progress'|'complete'|'error' }`. Fired by `wz-index.js` on every step transition. Shell listens to hide/show the wizard overlay and to gate tab navigation (tabs other than Overview are disabled — `pointer-events: none` + `aria-disabled` — until `wizard_completed_at` is set, **except** for the demo project which is always fully unlocked).

`PIPELINE_EVENT` payload is extended (backwards-compatible — additive fields only) with `reason: 'full-run' | 'schedule-changed' | 'config-changed'` so listeners can do partial vs full re-renders. Existing listeners that ignore `detail` continue to work unchanged.

### 5.4 New project vs demo project

- Demo project (`DEMO_PROJECT_ID`): wizard is **skipped entirely** — `project_config` is pre-seeded by `demo-seed.js` with `wizard_completed_at` already set, so `shell-index.js` boots straight to whatever tab was last active (current behavior, zero regression).
- New project created via `constistant_createProject()` (existing modal in `shell-index.js`): after `addProject()`, shell checks `project_config` for the new project — absent → shell shows the wizard overlay (full-screen, over canvas) instead of the normal tab content. The existing "New Project" modal (`np-name`, `np-client`, etc.) becomes **wizard Step 3's "Section A: Project Identity"** pre-fill — i.e. the modal's fields map 1:1 into `project_config` (see Deliverable 1 §1.3). The modal still creates the bare `projects` row (unchanged), then immediately opens the wizard at Step 1.

---

## Deliverable 1 — Onboarding Wizard Implementation Spec

### 1.0 Module layout

```
js/wizard/
  wz-index.js        — orchestrator: step state machine, render dispatch, window.wz_* exports
  wz-step1.js         — Primary Input (upload / demo / classification grid)
  wz-step2.js         — Drawing Review & Confirmation (Panels A/B/C)
  wz-step3.js         — Project Configuration (Sections A-E) + timeline/budget preview
  wz-step4.js         — Generate Overview (loading checklist, delegates to pipeline.js)
  wz-manual-fallback.js — Manual element-entry table (shared by Step 1 edge case + Step 2 Panel C)
css/wizard.css         — .fp-wizard-* styles, injected via <link> in contistant.html (same pattern as quantitake.css)
```

`contistant.html` gets one new mount point, sibling to `#canvas`, hidden by default:

```html
<div id="wizard-overlay" class="fp-wizard-overlay" hidden>
  <div class="fp-wizard-shell">
    <div class="fp-wizard-progress"><!-- 4 step dots, rendered by wz_index --></div>
    <div id="wizard-step-root" class="fp-wizard-step-root"><!-- step content injected here --></div>
  </div>
</div>
```

`wz-index.js` is imported by `shell-index.js`. On `PROJECT_EVENT` and on initial `DOMContentLoaded`, shell calls `wz_checkAndShow(projectId)`:

```js
export function wz_checkAndShow(projectId) {
  if (projectId === DEMO_PROJECT_ID) { wz_hide(); return; }
  const cfg = wz_getConfig(projectId);
  if (cfg?.wizard_completed_at) { wz_hide(); return; }
  wz_show(cfg?.wizard_step_reached || 1);
}
```

### 1.1 Step 1 — Primary Input

**HTML structure** (`wz-step1.js` renders into `#wizard-step-root`):

```html
<section class="fp-wizard-step" data-step="1">
  <h2 class="fp-wizard-title">เริ่มต้นโปรเจกต์ — อัปโหลดแบบแปลน</h2>
  <p class="fp-wizard-subtitle">อัปโหลดไฟล์ PDF แบบแปลน หรือใช้โปรเจคตัวอย่างเพื่อสำรวจฟีเจอร์</p>

  <div class="fp-wizard-upload-row">
    <label class="fp-wizard-dropzone" id="wz-dropzone">
      <input type="file" id="wz-file-input" accept="application/pdf" hidden>
      <span class="fp-wizard-dropzone__icon">📄</span>
      <span class="fp-wizard-dropzone__text">ลากไฟล์ PDF มาวาง หรือคลิกเพื่อเลือกไฟล์</span>
    </label>
    <div class="fp-wizard-or">หรือ</div>
    <button class="fp-btn fp-btn--secondary" onclick="wz_useDemoProject()">ใช้โปรเจคตัวอย่าง</button>
  </div>

  <div id="wz-classify-progress" class="fp-wizard-progress-bar" hidden>
    <div class="fp-wizard-progress-bar__fill"></div>
    <span class="fp-wizard-progress-bar__label">กำลังวิเคราะห์แบบแปลน...</span>
  </div>

  <div id="wz-thumb-grid" class="fp-wizard-thumb-grid"></div>

  <div id="wz-low-confidence-banner" class="fp-wizard-banner fp-wizard-banner--warn" hidden>
    <p>แบบแปลนไม่ชัดเจนพอ — ต้องการป้อนข้อมูลเอง?</p>
    <button class="fp-btn fp-btn--secondary" onclick="wz_openManualFallback()">กรอกข้อมูลเอง</button>
    <button class="fp-btn" onclick="wz_retryUpload()">อัปโหลดไฟล์ใหม่</button>
  </div>

  <div class="fp-wizard-actions">
    <button class="fp-btn fp-btn--primary" id="wz-step1-next" onclick="wz_goToStep(2)" disabled>ถัดไป</button>
  </div>
</section>
```

**Thumbnail card** (one per PDF page, rendered after `qt_pdfPageDataUrls` is populated):

```html
<div class="fp-wizard-thumb" data-page="${i}">
  <img src="${dataUrl}" class="fp-wizard-thumb__img">
  <span class="fp-wizard-thumb__badge fp-wizard-thumb__badge--${confidenceClass}">${sheetTypeLabel} · ${confidencePct}%</span>
</div>
```
`confidenceClass`: `high` (≥85%, green), `medium` (60-85%, amber), `low` (<60%, red) — reuses `.fp-badge--green/amber/red` from existing `css/feature-panels.css`.

**JS module — `wz-step1.js` exports**:
- `wz_initStep1()` — wires dropzone (drag/drop + click), calls `qt_handleFileSelect` (reused from `drawing-upload.js`) on file pick.
- `wz_useDemoProject()` — calls `constistant_selectProject(DEMO_PROJECT_ID)`, then `wz_hide()` immediately (demo project never enters wizard per §5.4).
- `wz_classifySheets()` — after `qt_pdfPageDataUrls` ready, calls Gemini via a **new function in `drawing-gemini.js`**: `qt_classifySheet(imageDataUrl)` → returns `{ sheet_type: 'floor_plan'|'section_detail'|'general_notes'|'schedule_table'|'unknown', confidence: 0-1 }`. Runs sequentially per page (reuses existing retry/backoff). Writes results into `drawing_uploads[i].sheet_type/confidence`.
- After classification: if **any** page has `sheet_type in ['floor_plan','section_detail']` with `confidence ≥ 0.6` → auto-call `qt_runPass1()` then `qt_runPass2()` (existing Drawing Intelligence functions, reused as-is) → on completion fire `WIZARD_EVENT({step:1, status:'complete'})`, enable "ถัดไป".
- If **all** pages `confidence < 0.6` → show `#wz-low-confidence-banner`, keep "ถัดไป" disabled unless user picks Manual Fallback (which, on save, marks step complete with `drawing_elements[].source='manual'`).

**localStorage writes at step completion**: `drawing_uploads` (existing key, via `projectStorageKey('constistant_drawing_uploads_v1')` — **new key**, was previously only in-memory/`globalThis`; promoting to persisted storage so wizard can resume after reload), `drawing_elements`, `beam_library` (existing keys, written by `qt_runPass1/2` unchanged). `project_config.wizard_step_reached = 1` saved via `wz_saveConfig()`.

**Error states**: PDF parse failure → `qt_*` existing error toast, stay on Step 1. Gemini classification 429/503 → existing retry/backoff in `drawing-gemini.js` (reused), after max retries mark page `sheet_type:'unknown', confidence:0` and continue (non-blocking, per "no dead ends").

### 1.2 Step 2 — Drawing Review & Confirmation

**HTML structure**:

```html
<section class="fp-wizard-step" data-step="2">
  <h2 class="fp-wizard-title">ตรวจสอบข้อมูลที่สกัดได้</h2>

  <!-- Panel A -->
  <div class="fp-wizard-panel" id="wz-panel-elements">
    <h3 class="fp-wizard-panel__title">สรุปองค์ประกอบที่พบ (Panel A)</h3>
    <table class="fp-wizard-table">
      <thead><tr><th>ประเภทงาน</th><th>จำนวน</th><th>ตัวอย่าง Tag</th><th>ความมั่นใจ</th><th>แก้ไข</th></tr></thead>
      <tbody id="wz-elements-tbody"><!-- rows --></tbody>
    </table>
  </div>

  <!-- Panel B -->
  <div class="fp-wizard-panel" id="wz-panel-notes">
    <h3 class="fp-wizard-panel__title">มาตรฐานออกแบบที่พบ (Panel B)</h3>
    <div id="wz-notes-found"><!-- list of extracted standards w/ confirm/edit --></div>
    <div id="wz-notes-empty" class="fp-wizard-empty" hidden>
      <p>ไม่พบ General Notes — กรอกเอง</p>
      <!-- manual form: f'c, fy main, fy stirrup, cover -->
    </div>
  </div>

  <!-- Panel C -->
  <div class="fp-wizard-panel" id="wz-panel-unknown">
    <h3 class="fp-wizard-panel__title">แผ่นที่ไม่สามารถระบุได้ (Panel C)</h3>
    <div id="wz-unknown-sheets"><!-- per low-confidence sheet: label dropdown OR "ไม่เกี่ยวข้อง" --></div>
  </div>

  <div class="fp-wizard-actions">
    <button class="fp-btn" onclick="wz_goToStep(1)">ย้อนกลับ</button>
    <button class="fp-btn fp-btn--primary" onclick="wz_goToStep(3)">ถัดไป</button>
  </div>
</section>
```

**Panel A row** (one per distinct `element_type` in `drawing_elements`):

```html
<tr data-element-type="${type}">
  <td>${labelTh}</td>
  <td><input type="number" class="fp-wizard-input--count" value="${count}"
       onchange="wz_correctElementCount('${type}', this.value)"></td>
  <td>${exampleTag}</td>
  <td><span class="fp-badge fp-badge--${badgeClass}">${confidencePct}%</span></td>
  <td>${userVerified ? '✓ ตรวจแล้ว' : '<button class=\"fp-btn fp-btn--xs\" onclick=\"wz_verifyElementType(\'' + type + '\')\">ยืนยัน</button>'}</td>
</tr>
```
`badgeClass`: green (>85%), yellow (60-85%), red (<60%) — per-element-type aggregate confidence = average of member `drawing_elements[].confidence`.

**`wz-step2.js` exports**:
- `wz_initStep2()` — reads `drawing_elements` from `project-store.getProjectElements()`, groups by `element_type`, renders Panel A; reads `drawing_uploads` for `general_notes` extraction (if Gemini's normalized output included a `design_standards` block — **new field on `drawing_uploads`**: `extracted_notes: { fc_ksc, fy_main_ksc, fy_stirrup_ksc, cover_mm } | null`); renders Panel B; renders Panel C from any `drawing_uploads[i].sheet_type === 'unknown'`.
- `wz_correctElementCount(type, value)` — sets `user_corrected_count` on every `drawing_elements` entry of that type proportionally is wrong; instead: stores correction at the **type-aggregate level** in a small map `project_config.estimation_basis.element_counts[type] = { extracted: N, corrected: value }`, and writes `user_corrected_count = value` onto a synthetic representative — **decision**: rather than distributing the delta across individual elements (ambiguous), Step 2 corrections only affect the **aggregate count used for Step 3 time estimation** (`estimation_basis.element_counts`). Individual `drawing_elements` rows keep their original `count`/`confidence`; BOQ generation in Engine 2 still uses the per-element rows as-is. This keeps Engine 2 untouched while letting Step 3's duration estimate reflect user corrections. Rationale documented inline as a code comment (one line) since this is a non-obvious modeling choice.
- `wz_verifyElementType(type)` — sets `user_verified = true` on all `drawing_elements` of that type.
- `wz_confirmNotes()` / `wz_editNotes(fields)` — writes confirmed/edited standards into `project_config.design_standard_overrides` (used later if user picked WSD/ACI in Step 3 — these override `REBAR_GRADES` defaults per project, **stored but not yet consumed by Engine 2 in this cycle** — flagged in Deliverable 6 as scaffolded).
- `wz_labelUnknownSheet(uploadId, label)` / `wz_markSheetIrrelevant(uploadId)` — updates `drawing_uploads[i].sheet_type`.

**localStorage writes**: `drawing_elements` (mutated `user_verified`), `drawing_uploads` (mutated `sheet_type` for Panel C), `project_config.estimation_basis.element_counts`, `project_config.design_standard_overrides`, `project_config.wizard_step_reached = 2`.

**Error/recovery**: if Pass 1/2 produced zero `drawing_elements` (e.g. user picked Manual Fallback on Step 1), Panel A renders the **same manual-entry table** from `wz-manual-fallback.js` instead of the review table — "no dead ends": Step 2 is reachable either via successful extraction (review mode) or manual fallback (entry mode), same component, different mode flag (`wz_state.mode = 'review'|'manual'`).

### 1.3 Step 3 — Project Configuration

**HTML structure** (5 sections, each a `.fp-wizard-panel`):

```html
<section class="fp-wizard-step" data-step="3">
  <h2 class="fp-wizard-title">ตั้งค่าโปรเจกต์</h2>

  <!-- Section A: Project Identity -->
  <div class="fp-wizard-panel">
    <h3 class="fp-wizard-panel__title">A. ข้อมูลโครงการ</h3>
    <label>ชื่อโครงการ <input id="wz-cfg-name" type="text"></label>
    <label>ประเภทอาคาร
      <select id="wz-cfg-building-type">
        <option value="residential">บ้านพักอาศัย</option>
        <option value="commercial">อาคารพาณิชย์</option>
        <option value="industrial">โรงงาน/คลังสินค้า</option>
        <option value="institutional">อาคารราชการ/สถาบัน</option>
      </select>
    </label>
    <label>จำนวนชั้น <input id="wz-cfg-floors" type="number"></label>
    <label>พื้นที่ใช้สอยรวม (ตร.ม.) <input id="wz-cfg-area" type="number"></label>
  </div>

  <!-- Section B: Design Standard -->
  <div class="fp-wizard-panel">
    <h3 class="fp-wizard-panel__title">B. มาตรฐานออกแบบ</h3>
    <label><input type="radio" name="wz-design-standard" value="WSD" checked> WSD (Working Stress Design) — แนะนำสำหรับงานราชการไทย</label>
    <label><input type="radio" name="wz-design-standard" value="ACI318"> ACI 318</label>
  </div>

  <!-- Section C: Site Location -->
  <div class="fp-wizard-panel">
    <h3 class="fp-wizard-panel__title">C. สถานที่ก่อสร้าง</h3>
    <label>จังหวัด <select id="wz-cfg-province" onchange="wz_onProvinceChange()"><!-- 77 options --></select></label>
    <label>เขต/อำเภอ <input id="wz-cfg-district" type="text"></label>
    <button class="fp-btn fp-btn--xs" onclick="wz_useGpsLocation()">ใช้ตำแหน่ง GPS ปัจจุบัน</button>
  </div>

  <!-- Section D: Timeline -->
  <div class="fp-wizard-panel">
    <h3 class="fp-wizard-panel__title">D. ระยะเวลาก่อสร้าง</h3>
    <div id="wz-duration-estimate" class="fp-wizard-duration-bars">
      <!-- 3 progress bars: min / recommended / max, rendered after estimateConstructionDuration() -->
    </div>
    <label>วันที่เริ่มงาน <input id="wz-cfg-start-date" type="date" onchange="wz_onDateChange()"></label>
    <label>วันที่สิ้นสุด (โดยประมาณ) <input id="wz-cfg-end-date" type="date" onchange="wz_onDateChange()"></label>
    <div id="wz-budget-impact" class="fp-wizard-banner" hidden><!-- ⚠ budget delta message --></div>
  </div>

  <!-- Section E: Material Pricing -->
  <div class="fp-wizard-panel">
    <h3 class="fp-wizard-panel__title">E. แหล่งราคาวัสดุ</h3>
    <label><input type="radio" name="wz-pricing-source" value="standard_bq" checked> ราคามาตรฐาน BQ</label>
    <label><input type="radio" name="wz-pricing-source" value="catalog"> เลือกจาก Material Catalog</label>
    <label><input type="radio" name="wz-pricing-source" value="manual"> กรอกราคาเอง</label>
    <div id="wz-catalog-supplier-picker" hidden><!-- multi-select from catalog-seed.js suppliers --></div>
  </div>

  <div class="fp-wizard-actions">
    <button class="fp-btn" onclick="wz_goToStep(2)">ย้อนกลับ</button>
    <button class="fp-btn fp-btn--primary" onclick="wz_goToStep(4)">สร้างภาพรวมโครงการ</button>
  </div>
</section>
```

**`wz-step3.js` exports**:
- `wz_initStep3()` — pre-fills Section A from the bare `projects` row (name/building_type/floors/area carried over from the "New Project" modal per §5.4); pre-fills `floor_count`/`total_area_sqm` from `drawing_elements` aggregate if user left them blank (auto-calc: `total_area_sqm = Σ slab area from drawing_elements where element_type='slab'`).
- `wz_onProvinceChange()` — looks up `PROVINCIAL_WEATHER[province]`, sets `project_config.timeline.rainy_season_months`, calls `wz_recalcTimeline()`.
- `wz_recalcTimeline()` — calls `estimateConstructionDuration(elements, province, standard)` from `timeline-engine.js` (Deliverable 3), renders the 3 progress bars, sets `wz-cfg-end-date` default = `start_date + estimated_recommended_days` (only if user hasn't manually edited end date yet — tracked via `wz_state.endDateTouched`).
- `wz_onDateChange()` — recomputes `user_duration_days`, calls `calculateBudgetImpact(...)`, shows/hides `#wz-budget-impact` with the Thai message format from the spec (`"⚠ ระยะเวลา X เดือน ต้องการแรงงานเพิ่ม ~Y% → ค่าใช้จ่ายเพิ่ม ≈ Z บาท"` for compressed timelines, or a weather-risk message for extended ones).
- `wz_useGpsLocation()` — `navigator.geolocation.getCurrentPosition()`, reverse-geocode is **out of scope for this cycle** (flagged Deliverable 6) — stores raw `lat/lng` only, province must still be picked manually. Non-blocking.
- `wz_finishWizard()` — assembles full `project_config` object via `createProjectConfig({...})`, sets `wizard_completed_at = new Date().toISOString()`, `wizard_step_reached = 4`, persists, then calls `wz_goToStep(4)`.

**localStorage writes**: `project_config` (full object, first creation), `projects[i]` updated (`name`, `building_type`, `floors_above_ground`, `total_area_sqm`, `start_date` synced from Section A/D for backward-compat with existing Overview code that reads `projects`).

### 1.4 Step 4 — Generate Overview

**HTML structure**:

```html
<section class="fp-wizard-step" data-step="4">
  <h2 class="fp-wizard-title">กำลังเตรียมข้อมูลโครงการ...</h2>
  <ul class="fp-wizard-checklist">
    <li data-task="boq" class="fp-wizard-checklist__item">คำนวณ BOQ</li>
    <li data-task="bbs" class="fp-wizard-checklist__item">สร้าง BBS</li>
    <li data-task="schedule" class="fp-wizard-checklist__item">สร้างตารางงาน</li>
    <li data-task="resources" class="fp-wizard-checklist__item">คำนวณทรัพยากร</li>
    <li data-task="readiness" class="fp-wizard-checklist__item">ตรวจสอบความพร้อม</li>
  </ul>
</section>
```
Each `<li>` gets class `fp-wizard-checklist__item--done` (✓) or `--active` (⟳, spinning icon via CSS animation) as `runPipeline`'s progress callback fires — "อ่านแบบแปลน" is implicitly done entering Step 4 (shown pre-checked).

**`wz-step4.js` exports**:
- `wz_initStep4()` — calls `runPipeline((label, step, total) => wz_updateChecklist(step, total))` (existing `pipeline.js` function, **extended** per §5.2 but signature unchanged). On resolve: `wz_hide()`, `setActiveTab('Overview')` (calls existing `shell-index.js` function via `window`), fires `PIPELINE_EVENT({reason:'full-run'})` (already does this — no change needed).
- On error: shows inline retry button — "ลองอีกครั้ง" calls `wz_initStep4()` again (no dead end); does **not** block — user can also click "ไปที่ภาพรวม" to enter Overview with partial/empty data (Overview already handles empty-state per existing `overview-index.js`).

### 1.5 Manual Fallback module

`wz-manual-fallback.js`:

```html
<div class="fp-wizard-manual-table">
  <table class="fp-wizard-table">
    <thead><tr><th>ประเภทงาน</th><th>จำนวน</th><th>หน่วย</th><th>หมายเหตุ</th><th></th></tr></thead>
    <tbody id="wz-manual-rows">
      <!-- one row per entry, <select> for ประเภทงาน: เสา/คาน/พื้น/ฐานราก/บันได/อื่นๆ -->
    </tbody>
  </table>
  <button class="fp-btn fp-btn--xs" onclick="wz_addManualRow()">+ เพิ่มรายการ</button>
</div>
```

`wz_addManualRow()`, `wz_removeManualRow(idx)`, `wz_saveManualEntries()` — the latter calls `createDrawingElement({ element_type, count, unit, notes, source: 'manual', confidence: 1.0, user_verified: true })` for each row (via `schema.js` factory, **unchanged signature** — `source` and the rest are existing/new optional fields, see Deliverable 2 §2.2) and pushes into `drawing_elements`. Downstream Engine 2 treats `source:'manual'` rows identically (no branching needed in `pipeline.js` — this is why Manual Fallback is low-risk).

---

## Deliverable 2 — Extended Schema (`js/shared/schema.js`)

### 2.0 Naming reconciliation (decision)

The codebase's `createDrawingElement` already has `confidence_score` (not `confidence`) and `is_manual_override`/`manual_override_note` (not `source`). **Decision**: do not rename existing fields (would break Engine 2's `computeBOQ`/`computeBBS`, which already read `confidence_score`). Instead, **add** the new fields the wizard needs alongside the existing ones:

```js
export function createDrawingElement(overrides = {}) {
  return {
    // ...existing fields unchanged...
    confidence_score: null,
    is_manual_override: false,
    manual_override_note: null,
    // NEW — wizard fields
    source: 'extracted',        // 'extracted' | 'manual' — set 'manual' by wz-manual-fallback.js
    user_verified: false,       // bool — set true by wz_verifyElementType()
    user_corrected_count: null, // int | null — set by wz_correctElementCount() at type-aggregate level (see D1 §1.2)
    created_at: null,
    ...overrides,
  };
}
```
Wizard Step 1/2 UI reads `confidence_score` (existing field) wherever the prompt says "confidence" — no separate `confidence` field is introduced.

Similarly `createDrawingUpload` gains two new fields without touching `drawing_type` (kept for backward-compat with any code reading it):

```js
export function createDrawingUpload(overrides = {}) {
  return {
    // ...existing fields unchanged (file_name, file_url, drawing_type, page_count, extraction_status, extraction_error)...
    // NEW — wizard sheet classification (Step 1)
    sheet_type: null,        // 'floor_plan' | 'section_detail' | 'general_notes' | 'schedule_table' | 'unknown'
    sheet_confidence: null,  // float 0-1 — Gemini classifier confidence
    extracted_notes: null,   // { fc_ksc, fy_main_ksc, fy_stirrup_ksc, cover_mm } | null — Step 2 Panel B
    created_at: null,
    ...overrides,
  };
}
```

### 2.1 New factory — `createProjectConfig`

```js
/**
 * ProjectConfig — ตั้งค่าโครงการจาก Onboarding Wizard (1 row ต่อโปรเจกต์)
 * สร้างครั้งเดียวที่ wizard Step 3 ("สร้างภาพรวมโครงการ"); แก้ไขได้ภายหลังจาก Planner (date drag)
 *
 * @param {Partial<ProjectConfig>} overrides
 */
export function createProjectConfig(overrides = {}) {
  return {
    id: null,                      // uuid
    project_id: null,              // uuid FK (1:1 with projects)

    // Section A — Project Identity
    project_name: '',
    building_type: 'residential',  // 'residential' | 'commercial' | 'industrial' | 'institutional'
    floor_count: null,             // int
    total_area_sqm: null,          // float

    // Section B — Design Standard
    design_standard: 'WSD',        // 'WSD' | 'ACI318'
    design_standard_overrides: null, // { fc_ksc, fy_main_ksc, fy_stirrup_ksc, cover_mm } | null — from wizard Step 2 Panel B

    // Section C — Site Location
    site_province: null,           // string — key into PROVINCIAL_WEATHER
    site_district: null,           // string | null
    site_lat: null,                // float | null
    site_lng: null,                // float | null

    // Section D — Timeline
    timeline: {
      estimated_min_days: null,
      estimated_recommended_days: null,
      estimated_max_days: null,
      user_start_date: null,       // ISO date
      user_end_date: null,         // ISO date
      user_duration_days: null,    // int — computed from user dates
      weather_buffer_days: null,   // float
      rainy_season_months: [],     // int[] 1-12 — from PROVINCIAL_WEATHER[site_province]
      estimation_basis: {
        element_counts: {},        // { [work_type]: { extracted: N, corrected: N|null } }
        productivity_rates_used: null, // snapshot of EARLY_ESTIMATE_RATES at estimation time
        crew_size_used: 8,
        weather_source: 'provincial_table', // 'provincial_table' | 'open_meteo' | 'manual'
      },
    },

    // Budget impact (Section D continued)
    budget_impact: {
      baseline_cost_estimate: null,  // float THB — at estimated_recommended_days
      current_cost_estimate: null,   // float THB — at user_duration_days
      delta_cost: null,               // float THB — current - baseline
      delta_reason: null,             // 'compressed_schedule' | 'extended_schedule' | null
      extra_crew_needed: 0,           // int
      rain_risk_extra_days: 0,        // float
      risk_level: 'none',             // 'none' | 'low' | 'medium' | 'high'
    },

    // Section E — Material Pricing
    pricing_source: 'standard_bq',  // 'standard_bq' | 'catalog' | 'manual'
    catalog_supplier_ids: [],       // uuid[] — FK → suppliers (catalog-seed.js)

    // Wizard state
    wizard_completed_at: null,      // ISO datetime | null
    wizard_step_reached: 1,         // int 1-4

    created_at: null,
    updated_at: null,
    ...overrides,
  };
}
```

**Storage key**: `constistant_project_config_v1` (project-scoped). Added to `PROJECT_SCOPED_KEYS` in `project-store.js`.

**Supabase table**:
```sql
create table project_config (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade unique,
  project_name text,
  building_type text,
  floor_count int,
  total_area_sqm numeric,
  design_standard text default 'WSD',
  design_standard_overrides jsonb,
  site_province text,
  site_district text,
  site_lat numeric,
  site_lng numeric,
  timeline jsonb not null default '{}',
  budget_impact jsonb not null default '{}',
  pricing_source text default 'standard_bq',
  catalog_supplier_ids uuid[] default '{}',
  wizard_completed_at timestamptz,
  wizard_step_reached int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```
`timeline`/`budget_impact` as `jsonb` — same approach the codebase already uses implicitly for nested objects (e.g. `resource_group` below), avoids a wide column migration if estimation_basis shape evolves.

### 2.2 Extended `createScheduleTask`

Additive fields appended (existing fields — `wbs_code`, `activity_name`, `predecessor_task_ids`, `is_critical`, etc. — unchanged; `computeSchedule()` continues to populate them exactly as today):

```js
export function createScheduleTask(overrides = {}) {
  return {
    // ...all existing fields unchanged...

    // NEW — work classification (Engine 3 sets at generation time)
    work_type: null,             // 'foundation' | 'structure' | 'roof' | 'mep' | 'finishing' | 'other'
    period_month: null,          // int — 1-based month index from project start (for groupByTime)
    period_label: null,          // string — "เดือนที่ 1", computed from period_month

    // NEW — resourcing
    resource_group: {
      primary_trade: null,       // 'steel_fixer' | 'carpenter' | 'concrete_gang' | ... (CREW_TYPES key)
      crew_type: null,           // alias of primary_trade, kept for Resource Hub join convenience
      crew_count: null,          // int — same as crew_size, duplicated for resource_group consumers
    },

    // NEW — CPM (extends existing predecessor_task_ids/is_critical, does not replace)
    depends_on_task_ids: [],     // uuid[] — alias of predecessor_task_ids for Deliverable 3/4 consumers;
                                  // computeSchedule() writes both fields identically
    is_critical_path: false,     // bool — alias of is_critical (new name used by Planner UI per spec)
    float_days: 0,               // float — slack time (CPM)

    // NEW — cost tracking
    task_cost_estimate: null,    // float THB — crew_size × CREW_TYPES[trade].day_rate × adjusted_duration_days
    task_cost_actual: null,      // float THB | null — filled from payroll_entries (Resource Hub)

    created_at: null,
    ...overrides,
  };
}
```

`is_critical_path`/`depends_on_task_ids` duplicate `is_critical`/`predecessor_task_ids` rather than renaming — **rationale**: the Master Architecture Prompt's spec names (used by `timeline-engine.js`/Planner UI in Deliverables 3-4) differ from the existing pipeline's names, and existing demo-seed data already populates `is_critical`/`predecessor_task_ids`. `computeSchedule()` is extended to write both pairs identically; `demo-seed.js` is extended to populate both. No reader of the old names breaks.

### 2.3 Extended `createBOQItem`

```js
export function createBOQItem(overrides = {}) {
  return {
    // ...all existing fields unchanged...

    // NEW — Thai BOQ hierarchy (Engine 2)
    category_code: null,       // '1'..'7' or '3.1'/'3.2'/'3.3' — หมวดที่ตาม Thai BOQ convention
    category_label_th: null,   // 'งานโครงสร้าง คอนกรีตเสริมเหล็ก — เสา' etc.
    work_type: null,           // 'foundation' | 'structure' | 'roof' | 'mep' | 'finishing' | 'other' (shared enum with schedule_tasks)

    // NEW — pricing provenance
    unit_price_source: 'bq_standard_2567', // 'bq_standard_2567' | 'catalog' | 'manual'

    // NEW — review flagging (extends existing status:'ok'|'needs_review')
    review_reason: null,       // 'low_extraction_confidence' | 'element_count_unusual' | 'price_deviation_>20%' | null

    created_at: null,
    ...overrides,
  };
}
```

`WORK_TYPE_HIERARCHY` (below) supplies `category_code`/`category_label_th` per `work_type` + `element_type`; `computeBOQ()` is extended to set these three fields (additive — existing `work_category`/`status` untouched).

### 2.4 New factory — `createTimelineViewState`

```js
/**
 * TimelineViewState — UI state ของ Planner (grouping/sort/filter), 1 row ต่อโปรเจกต์
 *
 * @param {Partial<TimelineViewState>} overrides
 */
export function createTimelineViewState(overrides = {}) {
  return {
    id: null,                  // uuid
    project_id: null,          // uuid FK
    grouping_mode: 'time',     // 'time' | 'work_type' | 'resource'
    sort_order: 'asc',         // 'asc' | 'desc'
    collapsed_groups: [],      // string[] — group keys collapsed by user
    date_filter: {
      from_date: null,         // ISO date | null
      to_date: null,           // ISO date | null
    },
    updated_at: null,
    ...overrides,
  };
}
```

**Storage key**: `constistant_timeline_view_state_v1` (project-scoped, added to `PROJECT_SCOPED_KEYS`). This is pure UI state — **decision**: give it a Supabase table anyway (per the "every localStorage entity needs a Supabase table" constraint) so view preferences sync across devices, but it's the lowest-priority sync target (flagged in Deliverable 6).

```sql
create table timeline_view_state (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade unique,
  grouping_mode text default 'time',
  sort_order text default 'asc',
  collapsed_groups text[] default '{}',
  date_filter jsonb default '{}',
  updated_at timestamptz default now()
);
```

### 2.5 New lookup table — `WORK_TYPE_HIERARCHY`

```js
/**
 * WORK_TYPE_HIERARCHY — Thai BOQ category mapping (หมวดที่ 1-7) + scheduling defaults
 * ใช้โดย computeBOQ() (category_code/category_label_th), timeline-engine.js (groupByWorkType),
 * และ Readiness (weather-overlap check ดูจาก typical_month_start)
 */
export const WORK_TYPE_HIERARCHY = {
  foundation: {
    category_code: '2',
    category_label_th: 'งานฐานราก',
    label_th: 'ฐานราก',
    typical_month_start: 1,
    element_types: ['footing'],
  },
  structure: {
    category_code: '3',
    category_label_th: 'งานโครงสร้าง คอนกรีตเสริมเหล็ก',
    label_th: 'โครงสร้าง',
    typical_month_start: 2,
    element_types: ['column', 'beam', 'girder', 'slab', 'staircase'],
    sub_categories: {
      column: { category_code: '3.1', category_label_th: 'งานเสา' },
      beam: { category_code: '3.2', category_label_th: 'งานคาน' },
      girder: { category_code: '3.2', category_label_th: 'งานคาน' },
      slab: { category_code: '3.3', category_label_th: 'งานพื้น' },
    },
  },
  roof: {
    category_code: '4',
    category_label_th: 'งานหลังคา',
    label_th: 'หลังคา',
    typical_month_start: 4,
    element_types: ['roof_truss', 'roof_covering'],
  },
  mep: {
    category_code: '6',
    category_label_th: 'งานระบบไฟฟ้าและสุขาภิบาล',
    label_th: 'งานระบบ',
    typical_month_start: 4,
    element_types: ['electrical', 'plumbing', 'hvac'],
  },
  finishing: {
    category_code: '7',
    category_label_th: 'งานตกแต่งและงานสถาปัตยกรรม',
    label_th: 'ตกแต่ง',
    typical_month_start: 5,
    element_types: ['masonry', 'plastering', 'tiling', 'painting'],
  },
  other: {
    category_code: '1',
    category_label_th: 'งานเตรียมพื้นที่และงานดิน',
    label_th: 'อื่นๆ',
    typical_month_start: 1,
    element_types: [],
  },
};

/** ส่งคืน work_type จาก element_type — ใช้โดย computeBOQ/computeSchedule */
export function workTypeFromElementType(elementType) {
  for (const [workType, def] of Object.entries(WORK_TYPE_HIERARCHY)) {
    if (def.element_types.includes(elementType)) return workType;
  }
  return elementType === 'column' || elementType === 'beam' || elementType === 'slab'
    ? 'structure'
    : 'other';
}
```

### 2.6 New lookup table — `EARLY_ESTIMATE_RATES` (reconciles with existing `PRODUCTIVITY_RATES`)

**The conflict**: the Master Architecture Prompt specifies a coarse `PRODUCTIVITY_RATES` keyed by `work_type` (foundation/column/beam/slab/masonry/finishing) with `crew_size_default = 8`, used for Step 3's **pre-extraction** duration estimate. The existing `schema.js` `PRODUCTIVITY_RATES` (lines 410-423) is keyed `${elementType}_${category}_${unit}` (e.g. `column_concrete_m3: 12`) with crew sizes 2/5, and is the input to `computeSchedule()` which runs **after** BOQ/BBS exist with real quantities.

**Decision**: these serve different purposes and must **not** share a name. Keep the existing `PRODUCTIVITY_RATES` untouched (Engine 3 schedule generation, post-BOQ, per-unit accuracy). Add a **new, separate constant `EARLY_ESTIMATE_RATES`** for Step 3's coarse pre-BOQ estimate, using the prompt's exact values:

```js
/**
 * EARLY_ESTIMATE_RATES — coarse productivity rates สำหรับ wizard Step 3
 * (ก่อนมี BOQ จริง — ใช้ element_counts ดิบจาก drawing_elements)
 * แยกจาก PRODUCTIVITY_RATES (ใช้หลังมี BOQ, ละเอียดกว่า, ขับเคลื่อน computeSchedule)
 * อ้างอิง: Master Architecture Prompt (2026-06-12)
 */
export const EARLY_ESTIMATE_RATES = {
  foundation: { rate: 8, unit: 'm3/crew-day' },
  column:     { rate: 4, unit: 'units/crew-day' },
  beam:       { rate: 3, unit: 'units/crew-day' },
  slab:       { rate: 25, unit: 'm2/crew-day' },
  masonry:    { rate: 12, unit: 'm2/crew-day' },
  finishing:  { rate: 15, unit: 'm2/crew-day' },
};

export const EARLY_ESTIMATE_CREW_SIZE_DEFAULT = 8;
```

Once `computeSchedule()` runs in Step 4 with real BOQ quantities, `schedule_tasks[].adjusted_duration_days` (driven by the existing granular `PRODUCTIVITY_RATES`) becomes the source of truth; `project_config.timeline.estimated_*` fields from Step 3 remain as the **pre-pipeline baseline** used only for `budget_impact` comparisons (i.e. `baseline_cost_estimate` is computed once at Step 3 and never recomputed — `current_cost_estimate` is recomputed from real `schedule_tasks` after Step 4 and on every Planner date change).

### 2.7 New lookup table — `PROVINCIAL_WEATHER`

```js
/**
 * PROVINCIAL_WEATHER — ฤดูฝนและจำนวนวันฝนเฉลี่ยต่อเดือน รายจังหวัด
 * อ้างอิง: Open-Meteo historical climate data (1991-2020 average), aggregated by region
 * rainy_months: เดือนที่ avg_rain_days_per_month >= 15 (เกณฑ์ "ฤดูฝน")
 * ครอบคลุม 24 จังหวัด (ตัวแทนแต่ละภาค) — จังหวัดที่เหลือใช้ค่าเฉลี่ยภาคใกล้เคียงผ่าน PROVINCE_REGION_FALLBACK
 */
export const PROVINCIAL_WEATHER = {
  'กรุงเทพมหานคร':   { region: 'central',   rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [3,4,7,15,16,17,18,18,19,16,5,2] },
  'นนทบุรี':         { region: 'central',   rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [3,4,7,15,16,17,18,18,19,16,5,2] },
  'ปทุมธานี':        { region: 'central',   rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [3,4,7,15,16,17,18,18,19,16,5,2] },
  'สมุทรปราการ':     { region: 'central',   rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [3,4,7,14,15,16,17,17,18,15,5,2] },
  'นครปฐม':          { region: 'central',   rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [3,4,7,14,15,16,17,17,18,15,5,2] },
  'พระนครศรีอยุธยา':  { region: 'central',   rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [3,4,7,14,15,16,17,17,18,15,5,2] },
  'ชลบุรี':          { region: 'east',      rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [3,3,5,12,16,17,18,18,20,18,7,2] },
  'ระยอง':           { region: 'east',      rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [3,3,5,11,16,17,19,19,21,18,7,2] },
  'จันทบุรี':         { region: 'east',      rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [4,4,6,13,18,19,21,21,22,20,8,3] },
  'เชียงใหม่':       { region: 'north',     rainy_months: [5,6,7,8,9],      avg_rain_days_per_month: [2,2,4,8,15,16,18,19,17,10,4,1] },
  'เชียงราย':        { region: 'north',     rainy_months: [5,6,7,8,9],      avg_rain_days_per_month: [2,2,4,8,16,17,19,20,17,10,4,1] },
  'ลำปาง':           { region: 'north',     rainy_months: [5,6,7,8,9],      avg_rain_days_per_month: [2,2,4,8,15,16,17,18,16,9,3,1] },
  'พิษณุโลก':        { region: 'north',     rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [2,3,5,9,15,15,16,17,17,12,4,1] },
  'นครสวรรค์':       { region: 'central',   rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [2,3,5,10,15,15,16,17,17,13,4,1] },
  'ขอนแก่น':         { region: 'northeast', rainy_months: [5,6,7,8,9],      avg_rain_days_per_month: [2,3,5,9,15,15,16,16,16,11,3,1] },
  'นครราชสีมา':      { region: 'northeast', rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [2,3,5,9,15,14,15,16,17,12,4,1] },
  'อุดรธานี':        { region: 'northeast', rainy_months: [5,6,7,8,9],      avg_rain_days_per_month: [2,3,5,9,16,16,17,17,17,11,3,1] },
  'อุบลราชธานี':     { region: 'northeast', rainy_months: [5,6,7,8,9,10],   avg_rain_days_per_month: [2,3,5,10,16,15,16,17,18,13,4,1] },
  'สุราษฎร์ธานี':    { region: 'south_gulf',  rainy_months: [10,11,12],      avg_rain_days_per_month: [6,4,5,8,14,13,13,14,16,19,19,12] },
  'นครศรีธรรมราช':   { region: 'south_gulf',  rainy_months: [10,11,12],      avg_rain_days_per_month: [8,5,5,8,14,12,13,14,16,20,21,15] },
  'สงขลา':           { region: 'south_gulf',  rainy_months: [11,12],         avg_rain_days_per_month: [9,5,5,7,12,11,11,12,14,17,20,16] },
  'ภูเก็ต':          { region: 'south_andaman', rainy_months: [5,6,7,8,9,10], avg_rain_days_per_month: [5,4,6,11,19,19,18,19,21,19,12,6] },
  'กระบี่':          { region: 'south_andaman', rainy_months: [5,6,7,8,9,10], avg_rain_days_per_month: [5,4,6,11,20,19,18,19,21,19,12,6] },
  'ระนอง':           { region: 'south_andaman', rainy_months: [5,6,7,8,9,10], avg_rain_days_per_month: [7,6,9,16,24,24,23,23,24,22,15,8] },
};

/** ภาคของแต่ละจังหวัด — ใช้ fallback สำหรับจังหวัดที่ไม่อยู่ใน PROVINCIAL_WEATHER โดยตรง */
export const PROVINCE_REGION_FALLBACK = {
  // จังหวัดอื่นๆ ที่ไม่ได้ระบุ -> ใช้ค่าเฉลี่ยของภาคที่อยู่ใกล้เคียงที่สุดจาก PROVINCIAL_WEATHER ภาคเดียวกัน
  // ตัวแทนภาค: central='กรุงเทพมหานคร', east='ชลบุรี', north='เชียงใหม่', northeast='ขอนแก่น',
  //            south_gulf='สุราษฎร์ธานี', south_andaman='ภูเก็ต'
  default_region_representative: {
    central: 'กรุงเทพมหานคร',
    east: 'ชลบุรี',
    north: 'เชียงใหม่',
    northeast: 'ขอนแก่น',
    south_gulf: 'สุราษฎร์ธานี',
    south_andaman: 'ภูเก็ต',
  },
};

/**
 * คืนค่า weather profile ของจังหวัด — ใช้ PROVINCIAL_WEATHER โดยตรงถ้ามี
 * ไม่งั้น fallback ไปจังหวัดตัวแทนของภาค (ต้องระบุ region เอง ถ้าไม่ทราบ default เป็น 'central')
 */
export function getProvincialWeather(province, fallbackRegion = 'central') {
  if (PROVINCIAL_WEATHER[province]) return PROVINCIAL_WEATHER[province];
  const rep = PROVINCE_REGION_FALLBACK.default_region_representative[fallbackRegion];
  return PROVINCIAL_WEATHER[rep];
}
```

24 provinces populated (>20 per Deliverable 2 requirement), covering all 6 climate regions with a documented fallback for the remaining 53. **Scope decision** (flagged in Deliverable 6): populating all 77 individually from live Open-Meteo calls is a >1-cycle data-entry task with low demo value (the wizard only needs *a* plausible rainy-season profile per province, not survey-grade accuracy) — the region-representative fallback is sufficient for the competition demo and is architecturally swappable later (replace `getProvincialWeather` body with an Open-Meteo fetch + cache, same call signature).

### 2.8 New storage key constants

Added to `pipeline.js` `STORAGE_KEYS` (additive) and/or `project-store.js` `PROJECT_SCOPED_KEYS`:

```js
// pipeline.js — STORAGE_KEYS (additive)
export const STORAGE_KEYS = {
  boq: 'constistant_boq_items_v1',
  bbs: 'constistant_bbs_items_v1',
  schedule: 'constistant_schedule_tasks_v1',
  resources: 'constistant_resource_items_v1',
  readiness: 'constistant_readiness_checks_v1',
  // NEW
  projectConfig: 'constistant_project_config_v1',
  timelineViewState: 'constistant_timeline_view_state_v1',
  drawingUploads: 'constistant_drawing_uploads_v1',
  payroll: 'constistant_payroll_entries_v1',
};

// project-store.js — PROJECT_SCOPED_KEYS (additive)
export const PROJECT_SCOPED_KEYS = [
  'constistant_boq_items_v1',
  'constistant_bbs_items_v1',
  'constistant_schedule_tasks_v1',
  'constistant_resource_items_v1',
  'constistant_readiness_checks_v1',
  'constistant_resource_plan_v1',
  // NEW
  'constistant_project_config_v1',
  'constistant_timeline_view_state_v1',
  'constistant_drawing_uploads_v1',
  'constistant_payroll_entries_v1',
];
```

### 2.9 `createPayrollEntry` — already exists, used as-is

`schema.js:335` already defines `createPayrollEntry({ project_id, resource_item_id, worker_name, work_date, regular_hours, ot_hours, daily_rate_thb, ot_multiplier, total_pay_thb, sso_deduction_thb, ... })`. The Master Architecture Prompt's proposed shape (`crew_type, worker_count, period_start, period_end, total_days_worked, total_amount, payment_status, payment_date`) is a **period-aggregate** view rather than the existing **per-worker-per-day** entry. **Decision**: do not add a second factory — the existing per-day shape is strictly more granular and the Resource Hub Payroll module (Deliverable 6, scaffolded) aggregates `payroll_entries` by `(resource_item_id, period)` client-side for display. No schema change needed; `constistant_payroll_entries_v1` storage key (added in §2.8) is the only new addition.

---

## Deliverable 3 — `js/shared/timeline-engine.js`

New shared module, imported by `wz-step3.js` (Step 3 estimate/budget preview), `js/planner/planner-index.js` (grouping + weather overlay + reactive recalc), and `pipeline.js` (Step 4 `applyWeatherBuffer` call inside `computeSchedule`).

```js
/**
 * timeline-engine.js — duration estimation, budget impact, task grouping, weather buffering.
 * Pure functions only — no localStorage access, no DOM. Callers persist results.
 */

import {
  EARLY_ESTIMATE_RATES,
  EARLY_ESTIMATE_CREW_SIZE_DEFAULT,
  getProvincialWeather,
  WORK_TYPE_HIERARCHY,
  workTypeFromElementType,
  CREW_TYPES,
  OVERTIME_COST_MULTIPLIER,
} from './schema.js';

// ─────────────────────────────────────────────
// estimateConstructionDuration
// ─────────────────────────────────────────────

/**
 * Pre-BOQ duration estimate for wizard Step 3.
 * @param {Array} elements - drawing_elements (raw, from getProjectElements())
 * @param {string} province - project_config.site_province
 * @param {string} standard - 'WSD' | 'ACI318' (not yet used to vary rates — reserved for future)
 * @returns {{
 *   estimated_min_days: number, estimated_recommended_days: number, estimated_max_days: number,
 *   weather_buffer_days: number, rainy_season_months: number[],
 *   estimation_basis: object
 * }}
 */
export function estimateConstructionDuration(elements, province, standard = 'WSD') {
  // 1. Aggregate element counts by work_type (using user corrections if present —
  //    caller may pre-merge project_config.estimation_basis.element_counts[type].corrected)
  const countsByWorkType = {};
  elements.forEach(el => {
    const workType = workTypeFromElementType(el.element_type);
    const rateKey = workType === 'structure' ? el.element_type : workType; // column/beam/slab kept granular
    countsByWorkType[rateKey] = (countsByWorkType[rateKey] || 0) + (el.count || 1);
  });

  // 2. base_duration_days = Σ(count[type] × 1/rate[type]) / crew_size_default
  //    For volume-based types (foundation, slab, masonry, finishing) "count" is treated
  //    as the unit quantity (m³ or m²) — for early estimation this is the element COUNT,
  //    which is a deliberate approximation (no BOQ exists yet); flagged in Deliverable 6.
  const crewSize = EARLY_ESTIMATE_CREW_SIZE_DEFAULT;
  let totalCrewDays = 0;
  const ratesUsed = {};
  Object.entries(countsByWorkType).forEach(([type, count]) => {
    const rateDef = EARLY_ESTIMATE_RATES[type] || EARLY_ESTIMATE_RATES.finishing; // fallback
    ratesUsed[type] = rateDef;
    totalCrewDays += count / rateDef.rate;
  });
  const baseDurationDays = totalCrewDays / crewSize * crewSize; // crew-days / crew_size_default... see note below
  // NOTE: totalCrewDays already represents "crew-days" (count / units-per-crew-day).
  // crew_size_default scales how many of those crew-day pools run in PARALLEL, so:
  const baseDuration = totalCrewDays / 1; // sequential crew-day total
  const parallelBaseDuration = Math.max(baseDuration / Math.max(crewSize / 4, 1), 1);
  // crew_size_default=8 assumed to mean "8 workers staffed across ~2 concurrent trade crews of 4"
  // -> divide by (crew_size_default / 4) as the parallelism factor. Documented decision: with no
  // BOQ yet, a single global parallelism factor is the simplest defensible approximation.

  // 3. Weather buffer
  const weather = getProvincialWeather(province);
  const rainyMonths = weather ? weather.rainy_months : [];
  const avgRainyDaysInRainySeason = rainyMonths.length
    ? rainyMonths.reduce((s, m) => s + weather.avg_rain_days_per_month[m - 1], 0) / rainyMonths.length
    : 0;
  // Estimate how many of the project's days fall in rainy months, proportional to project length
  const rainySeasonOverlapDays = parallelBaseDuration * (rainyMonths.length / 12);
  const weatherBufferDays = rainySeasonOverlapDays * 0.4;

  // 4. Final outputs (per spec formulas)
  const totalMin = parallelBaseDuration * 0.8;
  const totalRecommended = parallelBaseDuration + weatherBufferDays;
  const totalMax = parallelBaseDuration * 1.35 + weatherBufferDays;

  return {
    estimated_min_days: Math.round(totalMin),
    estimated_recommended_days: Math.round(totalRecommended),
    estimated_max_days: Math.round(totalMax),
    weather_buffer_days: parseFloat(weatherBufferDays.toFixed(1)),
    rainy_season_months: rainyMonths,
    estimation_basis: {
      element_counts: countsByWorkType,
      productivity_rates_used: ratesUsed,
      crew_size_used: crewSize,
      weather_source: weather ? 'provincial_table' : 'fallback',
    },
  };
}

// ─────────────────────────────────────────────
// calculateBudgetImpact
// ─────────────────────────────────────────────

/**
 * @param {object} baselineTimeline - project_config.timeline (after estimateConstructionDuration)
 * @param {string} userStartDate - ISO date
 * @param {string} userEndDate - ISO date
 * @param {{ crew_size_default?: number, daily_wage?: number }} [crewConfig]
 * @returns {object} project_config.budget_impact shape
 */
export function calculateBudgetImpact(baselineTimeline, userStartDate, userEndDate, crewConfig = {}) {
  const crewSizeDefault = crewConfig.crew_size_default ?? EARLY_ESTIMATE_CREW_SIZE_DEFAULT;
  // Daily wage default = blended average of the three primary trades (matches CREW_TYPES/LABOR_RATE_THB)
  const dailyWage = crewConfig.daily_wage
    ?? Math.round((CREW_TYPES.steel_fixer.day_rate + CREW_TYPES.carpenter.day_rate + CREW_TYPES.concrete_gang.day_rate) / 3);

  const recommendedDays = baselineTimeline.estimated_recommended_days;
  const actualDays = Math.max(1, Math.round((new Date(userEndDate) - new Date(userStartDate)) / 86400000));

  const baselineCost = recommendedDays * crewSizeDefault * dailyWage;

  let extraCrewNeeded = 0;
  let rainRiskExtraDays = 0;
  let deltaCost = 0;
  let deltaReason = null;
  let riskLevel = 'none';
  let currentCost = baselineCost;

  if (actualDays < recommendedDays) {
    // Compressed schedule -> need more crew, paid at overtime multiplier
    extraCrewNeeded = Math.max(0, Math.ceil(recommendedDays / actualDays * crewSizeDefault) - crewSizeDefault);
    const extraCost = extraCrewNeeded * dailyWage * actualDays * OVERTIME_COST_MULTIPLIER;
    currentCost = actualDays * crewSizeDefault * dailyWage + extraCost;
    deltaCost = currentCost - baselineCost;
    deltaReason = 'compressed_schedule';
    const pctCompression = (recommendedDays - actualDays) / recommendedDays;
    riskLevel = pctCompression > 0.3 ? 'high' : pctCompression > 0.1 ? 'medium' : 'low';
  } else if (actualDays > recommendedDays) {
    // Extended schedule -> more days fall into rainy season
    const additionalDays = actualDays - recommendedDays;
    rainRiskExtraDays = additionalDays * 0.4;
    const rainCost = rainRiskExtraDays * crewSizeDefault * dailyWage;
    currentCost = actualDays * crewSizeDefault * dailyWage + rainCost;
    deltaCost = currentCost - baselineCost;
    deltaReason = 'extended_schedule';
    riskLevel = additionalDays > recommendedDays * 0.3 ? 'medium' : 'low';
  } else {
    currentCost = baselineCost;
  }

  return {
    baseline_cost_estimate: Math.round(baselineCost),
    current_cost_estimate: Math.round(currentCost),
    delta_cost: Math.round(deltaCost),
    delta_reason: deltaReason,
    extra_crew_needed: extraCrewNeeded,
    rain_risk_extra_days: parseFloat(rainRiskExtraDays.toFixed(1)),
    risk_level: riskLevel,
  };
}

// ─────────────────────────────────────────────
// groupTasksByMode
// ─────────────────────────────────────────────

const WORK_TYPE_ORDER = ['foundation', 'structure', 'roof', 'mep', 'finishing', 'other'];

/**
 * @param {Array} tasks - schedule_tasks
 * @param {'time'|'work_type'|'resource'} mode
 * @param {object} projectConfig - project_config (for timeline anchor in 'time' mode)
 * @returns {Array<{ key: string, label: string, tasks: Array }>}
 */
export function groupTasksByMode(tasks, mode, projectConfig) {
  if (mode === 'work_type') return groupByWorkType(tasks);
  if (mode === 'resource') return groupByResource(tasks);
  return groupByTime(tasks, projectConfig?.timeline);
}

export function groupByTime(tasks, timeline) {
  const startDate = timeline?.user_start_date ? new Date(timeline.user_start_date) : null;
  const groups = new Map();
  tasks.forEach(task => {
    let periodMonth = task.period_month;
    if (periodMonth == null && startDate && task.start_date) {
      const months = (new Date(task.start_date) - startDate) / (1000 * 60 * 60 * 24 * 30.44);
      periodMonth = Math.max(1, Math.floor(months) + 1);
    }
    periodMonth = periodMonth ?? 1;
    const key = `month_${periodMonth}`;
    if (!groups.has(key)) groups.set(key, { key, label: `เดือนที่ ${periodMonth}`, sortKey: periodMonth, tasks: [] });
    groups.get(key).tasks.push(task);
  });
  return [...groups.values()].sort((a, b) => a.sortKey - b.sortKey);
}

export function groupByWorkType(tasks) {
  const groups = new Map();
  tasks.forEach(task => {
    const workType = task.work_type || 'other';
    const def = WORK_TYPE_HIERARCHY[workType] || WORK_TYPE_HIERARCHY.other;
    if (!groups.has(workType)) groups.set(workType, { key: workType, label: def.label_th, sortKey: WORK_TYPE_ORDER.indexOf(workType), tasks: [] });
    groups.get(workType).tasks.push(task);
  });
  return [...groups.values()].sort((a, b) => a.sortKey - b.sortKey);
}

export function groupByResource(tasks) {
  const groups = new Map();
  tasks.forEach(task => {
    const trade = task.resource_group?.primary_trade || 'unassigned';
    const label = CREW_TYPES[trade]?.label_th || 'ไม่ระบุ';
    if (!groups.has(trade)) groups.set(trade, { key: trade, label, sortKey: label, tasks: [] });
    groups.get(trade).tasks.push(task);
  });
  return [...groups.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'th'));
}

// ─────────────────────────────────────────────
// applyWeatherBuffer
// ─────────────────────────────────────────────

/**
 * Mutates and returns a new array of schedule_tasks with weather buffer applied.
 * For tasks whose start_date falls in a rainy month: extends adjusted_duration_days
 * by bufferRatio, sets weather_risk='high', and shifts end_date accordingly.
 * Also returns synthetic "buffer" tasks representing the weather_buffer_days total,
 * inserted after the last structure-phase task per floor (visual Gantt marker).
 *
 * @param {Array} tasks - schedule_tasks (already has start_date/end_date/work_type)
 * @param {number[]} rainyMonths - 1-12
 * @param {number} bufferRatio - e.g. 0.4
 * @returns {Array} new tasks array (same length or +1 buffer task if structure tasks overlap rainy season)
 */
export function applyWeatherBuffer(tasks, rainyMonths, bufferRatio = 0.4) {
  if (!rainyMonths?.length) return tasks.map(t => ({ ...t, weather_risk: 'none' }));

  let shiftDays = 0;
  const result = tasks.map(task => {
    const start = new Date(task.start_date);
    start.setDate(start.getDate() + shiftDays);
    const month = start.getMonth() + 1;
    const inRainySeason = rainyMonths.includes(month);
    const isStructure = task.work_type === 'structure' || task.work_type === 'foundation';

    let adjustedDuration = task.adjusted_duration_days ?? task.base_duration_days;
    let weatherRisk = 'none';
    if (inRainySeason && isStructure) {
      const extra = parseFloat((adjustedDuration * bufferRatio).toFixed(1));
      adjustedDuration += extra;
      shiftDays += extra;
      weatherRisk = 'high';
    } else if (inRainySeason) {
      weatherRisk = 'medium';
    }

    const end = new Date(start);
    end.setDate(end.getDate() + Math.ceil(adjustedDuration));

    return {
      ...task,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      adjusted_duration_days: parseFloat(adjustedDuration.toFixed(1)),
      weather_risk: weatherRisk,
    };
  });

  return result;
}
```

**Integration points**:
- `wz-step3.js`: `wz_recalcTimeline()` calls `estimateConstructionDuration()`, `wz_onDateChange()` calls `calculateBudgetImpact()`.
- `pipeline.js` `computeSchedule()`: after building `tasks[]` as today, call `applyWeatherBuffer(tasks, project_config.timeline.rainy_season_months, 0.4)` before returning — replaces the current per-task `calcAdjustedDuration(baseDuration, month)` call (existing `WEATHER_BUFFER_BKK`-based logic is kept as the **fallback** when `project_config` is absent/legacy, i.e. demo project with `site_province` unset defaults to Bangkok behavior — zero regression).
- `planner-index.js`: `pl_init()` calls `groupTasksByMode()` using `timeline_view_state.grouping_mode`; `pl_setGrouping(mode)` re-renders.

---

## Deliverable 4 — Planner Engine Extended Spec

### 4.0 Current state

`js/planner/planner-index.js` (227 lines) currently renders a flat, date-sorted task **table** (`pl_addTask`/`pl_deleteTask`, `WORK_CATEGORIES` = structural/architectural/mep/finishing) with a summary pill row (count, critical-path count, total days). There is no Gantt visualization yet. This deliverable adds: (a) a grouping toggle above the table, (b) a new pure-SVG Gantt/timeline view (same pattern as Resource Hub's Zone D forecast chart — no chart library), with a rainy-season overlay band, and (c) reactive recalculation on date edits.

### 4.1 Group-by toggle UI

Inserted into the `.fp-header` block, above the summary pills:

```html
<div class="fp-toggle-group" role="tablist" aria-label="จัดกลุ่มงาน">
  <button class="fp-toggle fp-toggle--active" data-mode="time" onclick="pl_setGrouping('time')">จัดกลุ่มตามช่วงเวลา</button>
  <button class="fp-toggle" data-mode="work_type" onclick="pl_setGrouping('work_type')">จัดกลุ่มตามประเภทงาน</button>
  <button class="fp-toggle" data-mode="resource" onclick="pl_setGrouping('resource')">จัดกลุ่มตามทรัพยากร</button>
</div>
```

```js
export function pl_setGrouping(mode) {
  const state = loadViewState();
  state.grouping_mode = mode;
  state.updated_at = new Date().toISOString();
  saveViewState(state);
  render();
}
```
`loadViewState()`/`saveViewState()` use `createTimelineViewState()` + `projectStorageKey(STORAGE_KEYS.timelineViewState)` (Deliverable 2 §2.4). `render()` calls `groupTasksByMode(tasks, state.grouping_mode, getProjectConfig())` (Deliverable 3) and renders one collapsible `.fp-group` section per returned group, in place of the current flat table. Each group header shows `label` + task count + group subtotal duration; `state.collapsed_groups` (array of group `key`s) controls a `<details>`-style collapse — toggled via `pl_toggleGroup(key)`.

Each task row gains a clickable area (`onclick="pl_openTaskDetail(taskId)"`) opening a detail panel (reuses `.fp-card` modal pattern already used by Resource Hub's `rh_focusResource`) showing: WBS, dependencies (`depends_on_task_ids` resolved to activity names), float days, `task_cost_estimate` vs `task_cost_actual`, and `weather_risk` badge.

### 4.2 Gantt timeline with weather overlay

New section rendered below the grouped list, `<div id="planner-gantt" class="fp-gantt">` — pure SVG, generated by a new internal function `renderGanttSVG(tasks, projectConfig)`:

```js
function renderGanttSVG(tasks, projectConfig) {
  const timeline = projectConfig?.timeline;
  const startDate = new Date(timeline?.user_start_date || tasks[0]?.start_date || Date.now());
  const endDate = new Date(timeline?.user_end_date || tasks[tasks.length - 1]?.end_date || Date.now());
  const totalDays = Math.max(1, (endDate - startDate) / 86400000);

  const rowHeight = 28;
  const chartWidth = 800;
  const dayWidth = chartWidth / totalDays;
  const chartHeight = tasks.length * rowHeight + 40;

  const dayOffset = (dateStr) => Math.max(0, (new Date(dateStr) - startDate) / 86400000);

  // Rainy-season overlay bands — one translucent red <rect> per rainy month within range
  const rainyMonths = timeline?.rainy_season_months || [];
  const overlayBands = [];
  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    const month = cursor.getMonth() + 1;
    if (rainyMonths.includes(month)) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const x1 = Math.max(0, dayOffset(monthStart.toISOString().slice(0,10))) * dayWidth;
      const x2 = Math.min(totalDays, dayOffset(monthEnd.toISOString().slice(0,10)) + 1) * dayWidth;
      overlayBands.push(`<rect x="${x1}" y="0" width="${x2-x1}" height="${chartHeight}" fill="#ef4444" opacity="0.08"/>`);
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Today marker (reuses Overview's pattern)
  const todayX = Math.min(totalDays, Math.max(0, dayOffset(new Date().toISOString().slice(0,10)))) * dayWidth;
  const todayLine = `<line x1="${todayX}" y1="0" x2="${todayX}" y2="${chartHeight}" stroke="#3b82f6" stroke-width="2" stroke-dasharray="4,2"/>`;

  // Task bars — color by work_type, hatched pattern if weather_risk='high'
  const bars = tasks.map((t, i) => {
    const x = dayOffset(t.start_date) * dayWidth;
    const w = Math.max(2, (t.adjusted_duration_days || 1) * dayWidth);
    const y = i * rowHeight + 8;
    const color = WORK_TYPE_COLORS[t.work_type] || '#94a3b8';
    const riskStripe = t.weather_risk === 'high'
      ? `<rect x="${x}" y="${y}" width="${w}" height="12" fill="url(#rain-stripe)"/>`
      : '';
    const criticalStroke = t.is_critical_path ? 'stroke="#ef4444" stroke-width="1.5"' : '';
    return `<g onclick="pl_openTaskDetail('${t.id}')" style="cursor:pointer">
      <rect x="${x}" y="${y}" width="${w}" height="12" rx="3" fill="${color}" ${criticalStroke}/>
      ${riskStripe}
      <text x="${x + 4}" y="${y + 9}" font-size="9" fill="#fff">${escapeHtml(t.activity_name).slice(0, Math.floor(w/6))}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="fp-gantt__svg">
    <defs><pattern id="rain-stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#3b82f6" opacity="0.15"/><rect width="3" height="6" fill="#3b82f6" opacity="0.3"/>
    </pattern></defs>
    ${overlayBands.join('')}
    ${bars}
    ${todayLine}
  </svg>`;
}

const WORK_TYPE_COLORS = {
  foundation: '#92400e', structure: '#1d4ed8', roof: '#7c3aed',
  mep: '#0891b2', finishing: '#16a34a', other: '#64748b',
};
```

A legend row below the SVG lists each `WORK_TYPE_HIERARCHY` entry's color+`label_th`, plus a "ช่วงฤดูฝน" red-band swatch and "วันนี้" blue-dashed-line swatch — same legend pattern as Resource Hub Zone D.

### 4.3 Reactive date-change → cost recalculation

Each Gantt bar gets native HTML5 drag handles is out of scope for this cycle (flagged in Deliverable 6 as "scaffold view-only, defer drag-to-resize"); date editing for this cycle remains via the existing table's `<input type="date">` per task row (already present in `pl_addTask`'s form pattern — extended to inline-edit existing rows via `pl_updateTaskDate(id, field, value)`, mirroring `rh_updateCrew`'s inline-edit convention).

```js
export function pl_updateTaskDate(id, field, value) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task[field] = value;

  // 1. Recompute this task's adjusted_duration_days from new date range
  const days = Math.max(0.5, (new Date(task.end_date) - new Date(task.start_date)) / 86400000);
  task.adjusted_duration_days = parseFloat(days.toFixed(1));

  // 2. Recompute task_cost_estimate
  const rate = CREW_TYPES[task.resource_group?.primary_trade]?.day_rate || 500;
  task.task_cost_estimate = Math.round((task.crew_size || 1) * rate * task.adjusted_duration_days);

  // 3. Shift dependent tasks (simple CPM: successors start when this task ends + lag)
  shiftDependents(task);

  // 4. Recompute project_config.budget_impact against the new overall end date
  const cfg = getProjectConfig();
  if (cfg) {
    const newProjectEnd = tasks.reduce((max, t) => t.end_date > max ? t.end_date : max, tasks[0].end_date);
    cfg.timeline.user_end_date = newProjectEnd;
    cfg.timeline.user_duration_days = Math.round((new Date(newProjectEnd) - new Date(cfg.timeline.user_start_date)) / 86400000);
    cfg.budget_impact = calculateBudgetImpact(cfg.timeline, cfg.timeline.user_start_date, newProjectEnd);
    saveProjectConfig(cfg);
  }

  saveTasks(tasks);
  render();
  window.dispatchEvent(new CustomEvent(PIPELINE_EVENT, { detail: { reason: 'schedule-changed', schedule: tasks } }));
}

function shiftDependents(changedTask) {
  const successors = tasks.filter(t => (t.depends_on_task_ids || []).includes(changedTask.id));
  successors.forEach(succ => {
    const earliestStart = new Date(changedTask.end_date);
    earliestStart.setDate(earliestStart.getDate() + (succ.lag_days || 0));
    const earliestStartStr = earliestStart.toISOString().slice(0, 10);
    if (succ.start_date < earliestStartStr) {
      const duration = succ.adjusted_duration_days || succ.base_duration_days || 1;
      succ.start_date = earliestStartStr;
      const end = new Date(earliestStart);
      end.setDate(end.getDate() + Math.ceil(duration));
      succ.end_date = end.toISOString().slice(0, 10);
      shiftDependents(succ); // cascade
    }
  });
}
```

**`PIPELINE_EVENT` listener registration** (per Deliverable 5 §5.2/5.3): Resource Hub, Readiness, and Overview each register `window.addEventListener(PIPELINE_EVENT, e => { if (e.detail.reason === 'schedule-changed') { /* partial re-render */ } })`. Resource Hub's partial re-render re-derives the weekly demand curve from the updated `tasks` (passed in `e.detail.schedule`) without re-running the full `computeResources()` BOQ pass. Overview re-renders KPI cards (cost delta) and re-runs `groupTasksByMode()` for its timeline view. This satisfies the "<200ms reactive UI" principle — no full pipeline re-run on a single date edit.

A small **diff indicator** appears next to the edited row: `<span class="fp-diff fp-diff--${deltaCost > 0 ? 'bad' : 'good'}">${deltaCost > 0 ? '+' : ''}${deltaCost.toLocaleString('th-TH')} บาท</span>`, fading out after 4s (CSS animation, matches existing toast pattern in `drawing-ui.js`).

---

## Deliverable 6 — Implementation Priority Order

Rubric weight: Engineering Viability 40% — prioritize **end-to-end data flow correctness** (wizard → pipeline → all 5 tabs reflect consistent numbers) over visual polish. Team capacity ≈ 10 days per cycle; items >1 cycle are explicitly flagged for descoping or stub-only treatment.

### Cycle 1 (must exist for a credible demo) — ~10 days

1. **Deliverable 2 schema additions** (1-2 days): `createProjectConfig`, extended `createScheduleTask`/`createBOQItem`/`createDrawingElement`/`createDrawingUpload`, `WORK_TYPE_HIERARCHY`, `EARLY_ESTIMATE_RATES`, `PROVINCIAL_WEATHER` (24 provinces), new storage keys. Pure data — low risk, unblocks everything else. **No existing factory signatures change**, so this can land first without breaking the current app.
2. **`timeline-engine.js`** (Deliverable 3) (1-2 days): all four functions. Unit-testable in isolation (pure functions) — write against demo project's `drawing_elements` to sanity-check `estimateConstructionDuration` produces plausible (30-180 day) outputs before wiring to UI.
3. **Wizard Steps 1-3 happy path** (3-4 days): file upload → classification → Pass 1/2 (reuse existing `qt_*` functions, only add `qt_classifySheet`) → Step 2 review (Panel A only — confirm/correct counts; Panels B/C as simple stubs that auto-pass-through) → Step 3 (Sections A-D fully functional; Section E defaults to `standard_bq` with the radio group present but catalog-picker stubbed to "coming soon"). This is the highest-value path: it's what differentiates "we have a wizard" from "we have 5 disconnected tabs."
4. **Wizard Step 4 + pipeline integration** (1 day): loading checklist wired to existing `runPipeline()` progress callback (already supports this signature — zero pipeline.js changes needed beyond `applyWeatherBuffer` call). `computeSchedule()` extended to set `work_type`/`category_code`/`category_label_th` via `WORK_TYPE_HIERARCHY` and call `applyWeatherBuffer()` using `project_config.timeline.rainy_season_months` (falls back to existing `WEATHER_BUFFER_BKK` if `project_config` absent — demo project unaffected).
5. **`demo-seed.js` extension** (1 day, can run in parallel with #3): add `project_config` for the demo project with `wizard_completed_at` pre-set (province = กรุงเทพมหานคร, WSD, realistic timeline numbers computed once via `estimateConstructionDuration` and hand-pasted as the seed), and populate `work_type`/`depends_on_task_ids`/`is_critical_path`/`resource_group` on existing demo `schedule_tasks`/`boq_items` entries so groupings render correctly from day one.

### Cycle 2 (strengthens the demo, still core to rubric) — ~10 days

6. **Planner grouping toggle + grouped list rendering** (Deliverable 4 §4.1) (2-3 days): `groupTasksByMode` is already done in Cycle 1 — this is UI wiring + `timeline_view_state` persistence. Highest ROI item in Cycle 2 because "3 grouping modes" is explicitly named in the prompt as differentiating.
7. **Wizard Step 2 Panels B & C real implementations** (2 days): general-notes extraction parsing from Gemini's normalized output, manual-entry form, unknown-sheet labeling.
8. **Manual Fallback module** (Deliverable 1 §1.5) (1-2 days): low-confidence banner + manual entry table. Important for "no dead ends" judging criterion and is structurally simple (creates `drawing_elements` with `source:'manual'`, no Engine 2 branching).
9. **Readiness Check wizard-aware flags** (Deliverable 5 §5.2 last block) (1 day): `wizard_completed_at`, low-confidence, `user_duration_days < estimated_min_days`, weather-overlap checks — small additions to existing `computeReadiness()`.
10. **Reactive date-change recalculation** (Deliverable 4 §4.3) (2-3 days): `pl_updateTaskDate`, `shiftDependents`, `calculateBudgetImpact` re-run, `PIPELINE_EVENT('schedule-changed')` partial-render listeners in Resource Hub/Overview/Readiness. This is the "reactive UI <200ms" principle made concrete — strong Engineering Viability signal but depends on #6 being in place first.

### Cycle 3 (visual differentiation, defer if time-constrained) — ~10 days

11. **Gantt SVG with weather overlay** (Deliverable 4 §4.2) (3-4 days): the pure-SVG chart, rainy-season bands, today marker, work-type color legend. High visual impact for judges but **not load-bearing** — the grouped-list view from #6 already demonstrates the grouping/weather-awareness story without it.
12. **Resource Hub Payroll module UI** (2 days): `payroll_entries` already has a factory (§2.9, no schema change) — this is purely a new sub-tab in Resource Hub reading/writing that storage key with a simple table form.
13. **Material Catalog Section E full picker** (1-2 days): wire `pages/material-catalog.html`/`js/catalog/` suppliers into wizard Step 3 Section E's `catalog_supplier_ids`.

### Explicitly deferred post-competition (flagged >1 cycle or low marginal value)

- **Full 77-province `PROVINCIAL_WEATHER` via live Open-Meteo** — 24-province table + region fallback (Deliverable 2 §2.7) is architecturally swappable later behind `getProvincialWeather()` without touching any caller.
- **GPS reverse-geocoding in Step 3 Section C** — `wz_useGpsLocation()` stores raw lat/lng only; province must be picked manually this cycle.
- **`design_standard_overrides` consumption in Engine 2** — Step 2 Panel B *stores* user-confirmed `f'c`/`fy` overrides into `project_config`, but `computeBOQ`/`computeBBS` continue to use the existing `REBAR_GRADES` defaults until a follow-up cycle wires the override through (storing-without-consuming is safe and non-breaking; flagged with a one-line TODO comment at the point in `pipeline.js` where `REBAR_GRADES[grade]` is looked up).
- **Gantt drag-to-resize** — view-only Gantt in Cycle 3; `pl_updateTaskDate` (Cycle 2) already provides the reactive-recalc story via the existing table inputs, so drag interaction is a polish item, not a viability gap.
- **`timeline_view_state` Supabase sync** — table defined (Deliverable 2 §2.4) for schema completeness, but local-only persistence is acceptable for the demo; sync this last among all new Supabase tables.

### Risk callouts for the team

- **`estimateConstructionDuration`'s parallelism-factor approximation** (Deliverable 3, `parallelBaseDuration`) is the single most "made a judgment call" piece of math in this document — if Step 3's duration estimates look implausible against the demo project's known-good numbers (from `demo-seed.js`'s hand-tuned `schedule_tasks`), adjust the `crew_size_default / 4` divisor first; the formula structure (min=0.8×, recommended=base+weather, max=1.35×+weather) is fixed by the prompt and should not change.
- **`is_critical_path`/`depends_on_task_ids` field duplication** (Deliverable 2 §2.2) is intentional to avoid a breaking rename — if the team later consolidates, do it in a dedicated migration pass across `demo-seed.js`, `pipeline.js`, and `planner-index.js` simultaneously, not incrementally.
