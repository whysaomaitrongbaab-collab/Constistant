# CONSTISTANT — Endgame Build Plan

Status: build plan, written against the working tree as of 2026-06-13 (post shell-refactor, **uncommitted**).
Relationship to existing docs: this document **adopts** `ARCHITECTURE_ONBOARDING_WIZARD.md` (referenced below as **AOW**, by deliverable/section, e.g. AOW D1 §1.3) as the detailed spec for the wizard, extended schema, and timeline engine. Where this plan corrects or extends AOW, the correction is marked **⚠ DELTA**. Do not re-derive what AOW already specifies — go read the cited section.

**Step 0 (before anything else): commit the current working tree.** The shell refactor + Resource Hub rewrite (~1,100 net new lines across 8 modified + 2 new directories) is the foundation every item below builds on, and it exists only as uncommitted changes. One bad `git checkout` loses a week.

---

## Part 1 — Gap Analysis

Scoring against the 7-item demo checklist. "Exists" means it runs live today on the demo project.

| # | Demo moment | Status | What's there / what's missing |
|---|---|---|---|
| 1 | PDF upload → elements extracted with confidence | **partial** | The 4-pass Gemini flow works (`qt_runRead` in [drawing-index.js:48](js/drawing/drawing-index.js#L48): Pass 0 page classification, Pass 1 section details, Pass 2–3 layout counting, review UI). **Missing:** results live only in `globalThis.qt_elementsData` in QT's own shape `{id, length_groups, …}` — never converted to `createBeamLibraryEntry`/`createDrawingElement`, never persisted via `project-store.js`. The TODO at [pipeline.js:80](js/shared/pipeline.js#L80) marks exactly this hole. Until the bridge exists, a real upload produces zero BOQ. |
| 2 | 4-step onboarding wizard | **missing** | `js/wizard/` does not exist. Full spec exists (AOW D1). |
| 3 | Auto-generate BOQ (Thai format) / BBS / Schedule / Resources | **mostly exists** | `runPipeline()` produces all four tiers with waste/lap/bend factors, cure lags, weather buffer, material order dates. **Missing slices:** Thai BOQ category codes (หมวดที่ 1–7 — AOW D2 §2.3/§2.5, Small); weather is Bangkok-only (`WEATHER_BUFFER_BKK`) — provincial table specified in AOW D2 §2.7 (Small); Gantt visualization (Planner is a flat table — AOW D4 §4.2, Large). |
| 4 | Overview: KPIs, RAG, timeline-grouped work breakdown | **partial** | KPI cards, RAG strip, BOQ doughnut, schedule-by-floor bar chart all live ([overview-index.js](js/overview/overview-index.js)). **Missing:** timeline-grouped work breakdown — needs `work_type`/`period_month` on tasks + `groupTasksByMode()` (AOW D3) + one new Overview section (Medium). |
| 5 | Change end date → budget impact recalculates live across tabs | **missing** | No `timeline-engine.js`, no `calculateBudgetImpact`, no `pl_updateTaskDate`, no `reason` field on `PIPELINE_EVENT`. Spec exists (AOW D3 + D4 §4.3). |
| 6 | Readiness flags: "ช่วงโครงสร้างตรงกับฤดูฝน", "ระยะเวลาสั้นเกินไป" | **partial** | `computeReadiness()` already auto-generates 5 checks including a generic weather-buffer check. The two named flags need `project_config` (wizard output) to compare against — Small once #2 lands (AOW D5 §5.2 last block). |
| 7 | Resource Hub: lead times vs task starts → automatic shortage flags | **exists** | `buildMaterialRows()` computes `days_until_needed` vs lead time, sets red/amber, feeds `computeAlerts()` and the `schedule_impact_days` KPI ([resource-index.js:176-345](js/resource/resource-index.js#L176-L345)). Done. |

**Honest score today: ~3/7 live** (items 3, 7 fully; 4 half; 1 half-but-disconnected). The demo currently depends on the demo project's seed data; a judge handing us a fresh PDF gets a dead end after the review screen.

---

## Part 2 — The Critical Path

Ordered by: blockers → high-visibility → infrastructure. Each item lists file(s), dependencies, size (S < 100 lines, M 100–400, L 400+).

| Seq | Work item | File(s) | Depends on | Size |
|---|---|---|---|---|
| 0 | **Commit the working tree** (then commit after every item below) | — | — | — |
| 1 | **Schema additions** — `createProjectConfig`, `createTimelineEstimate` (Part 4), extended `createScheduleTask`/`createBOQItem`/`createDrawingElement`/`createDrawingUpload`, `WORK_TYPE_HIERARCHY`, `EARLY_ESTIMATE_RATES`, `PROVINCIAL_WEATHER`, new storage keys. Pure additive data — unblocks everything. Spec: AOW D2 verbatim. | `js/shared/schema.js`, `js/shared/pipeline.js` (STORAGE_KEYS), `js/shared/project-store.js` (PROJECT_SCOPED_KEYS) | nothing | M |
| 2 | **⚠ DELTA — Drawing bridge** (not in AOW's cycle plan, but its hidden prerequisite): convert `qt_elementsData` + Pass 1 output into `createBeamLibraryEntry[]`/`createDrawingElement[]` and persist via `project-store.js` so `getProjectElements()` returns them and `runPipeline()` consumes a real upload. Closes the TODO at pipeline.js:80. This is what makes demo item #1 *true* instead of staged. | new `js/drawing/drawing-bridge.js` (+1 call site in `drawing-index.js`/wizard) | 1 | M |
| 3 | **`timeline-engine.js`** — `estimateConstructionDuration` (Part 3 algorithm), `calculateBudgetImpact`, `groupTasksByMode`, `applyWeatherBuffer`. Pure functions; sanity-check against demo data before UI wiring. Spec: AOW D3 + Part 3 §3.6 below. | new `js/shared/timeline-engine.js`; export `computeBOQ`/`computeSchedule` from `pipeline.js` | 1 | M–L |
| 4 | **Wizard Steps 1–4 happy path** — overlay mount, step machine, Step 1 upload+classify (reuses `qt_extractPdfPages`/`qt_callGeminiParts` + bridge), Step 2 Panel A review, Step 3 config+estimate+budget preview, Step 4 pipeline checklist. Spec: AOW D1 with Part 3 corrections below. | new `js/wizard/wz-*.js` (5 files), `css/wizard.css`, one mount div in `contistant.html`, hook in `js/shell/shell-index.js` | 1, 2, 3 | L |
| 5 | **Pipeline extensions + demo-seed parity** — `computeSchedule` sets `work_type`/`period_month`/`resource_group`/CPM aliases; `computeBOQ` sets category codes; `applyWeatherBuffer` with provincial months (BKK fallback for legacy/demo); `PIPELINE_EVENT` gains `reason`. Seed `project_config` (wizard_completed_at pre-set) + new task fields for the demo project. | `js/shared/pipeline.js`, `js/shared/demo-seed.js` | 1, 3 | M |
| 6 | **Readiness wizard-aware flags + Overview work breakdown** — the two named Thai flags (#6) and the timeline-grouped section on Overview (#4). High judge visibility, small code. | `pipeline.js` (`computeReadiness`), `js/overview/overview-index.js` | 4, 5 | S+M |
| 7 | **Reactive date change** — `pl_updateTaskDate`, `shiftDependents`, budget-impact re-run, partial-render listeners in Resource Hub/Overview/Readiness. The demo's money moment (#5). Spec: AOW D4 §4.3 + Part 5 below. | `js/planner/planner-index.js`, listeners in 3 feature modules | 3, 5, 6 | M |
| 8 | **Planner grouping toggle + Gantt SVG with rainy-season overlay** — visual differentiation; the grouped list (cheap) ships before the SVG (expensive). Spec: AOW D4 §4.1–4.2. | `js/planner/planner-index.js` | 5 | L |

Items 1–6 = a credible 6/7 demo (everything except live reactive). Item 7 makes it 7/7. Item 8 is polish that can slip.

**Cut line if time runs out:** ship 1–5 and demo the wizard on the demo PDF; readiness flags (6) and reactive (7) degrade gracefully to "shown in slides."

---

## Part 3 — Onboarding Wizard: Complete Spec

**Adopt AOW D1 in full** (HTML structures, exports, localStorage writes, error states, manual fallback). This section records the corrections and the one piece AOW left soft: the estimation algorithm.

### 3.1 ⚠ DELTA — naming and CSS prefix
- CSS classes use **`.wz-*`** (e.g. `.wz-overlay`, `.wz-step`, `.wz-panel`, `.wz-dropzone`), not AOW's `.fp-wizard-*`. File stays `css/wizard.css`. Wizard markup may still *reuse* existing `.fp-btn`/`.fp-badge--*` primitives from `feature-panels.css`.
- Module prefix `wz_`, exported + assigned to `window`, per house convention. (AOW agrees.)

### 3.2 ⚠ DELTA — what Step 1 actually reuses
AOW D1 §1.1 says Step 1 auto-calls `qt_runPass1()` then `qt_runPass2()` "existing functions, reused as-is." **Those functions do not exist.** The existing flow is one monolithic `qt_runRead()` (drawing-index.js:48) that runs Pass 0–4 and ends at the QT review screen with results in `globalThis.qt_elementsData`. Step 1 therefore:

1. Reuses `qt_extractPdfPages` (drawing-upload.js) for PDF→images.
2. Adds `qt_classifySheet(imageDataUrl)` in `drawing-gemini.js` — per AOW; note Pass 0 inside `qt_runRead` already does page identification, so the prompt/parse logic can be lifted from there.
3. Calls a new `qt_runExtraction(key, pages, elements, note)` — which is `qt_runRead`'s body **refactored out** of its DOM handling (the DOM-coupled `qt_runRead` becomes a thin wrapper calling it, so the standalone QT tab keeps working unchanged).
4. On completion calls the **bridge** (Part 2 item 2): `qt_saveExtractionToProject(projectId)` converts `qt_elementsData` → schema entities → persists via `project-store.js`.

The bridge mapping (one place, documented): QT element `{id, type, b, h, main:{n, dia}, stirrup:{dia, spacing}, length_groups:[{length, qty}], estimated}` →
- one `createBeamLibraryEntry` per distinct `id` (dimensions, bars, stirrups; `confidence_score` = 0.9 default, 0.6 when `estimated:true`, carrying QT warnings into `confidence_flags`);
- one `createDrawingElement` per `id` × floor (count = Σ qty, `span_length_m` = weighted mean length; `confidence_score` as above).

### 3.3 Step flow and data captured (summary — details in AOW D1)

| Step | User provides | Platform computes | Persisted at completion |
|---|---|---|---|
| 1 Upload | PDF (or "ใช้โปรเจคตัวอย่าง") | sheet classification + Pass 1/2 extraction + bridge | `drawing_uploads`, `beam_library`, `drawing_elements`, `project_config.wizard_step_reached=1` |
| 2 Review | count corrections, verify per type, notes confirm, unknown-sheet labels | per-type aggregate confidence | `drawing_elements.user_verified`, `project_config.estimation_basis.element_counts`, `design_standard_overrides`, step=2 |
| 3 Configure | name/type/floors/area, standard (WSD/ACI318), province, start+end dates, pricing source | duration estimate (3 bars), budget impact banner, rainy months | full `project_config` via `createProjectConfig`, `timeline_estimates` append, `projects` row sync, `wizard_completed_at`, step=4 |
| 4 Generate | nothing | `runPipeline()` with progress checklist | all 5 pipeline keys; navigates to Overview |

State machine: linear 1→2→3→4 with back-nav 2→1, 3→2; resume from `wizard_step_reached` on reload (`wz_checkAndShow`, AOW D1 §1.0); demo project never enters the wizard (AOW D5 §5.4); every error state has a non-blocking path (retry / manual fallback / proceed-with-partial).

### 3.4 Error states (per step)
- Step 1: PDF parse fail → toast, stay. Gemini 429/503 → existing retry/backoff; after max retries page marked `unknown`, flow continues. All pages < 0.6 confidence → manual-fallback banner (AOW D1 §1.5).
- Step 2: zero extracted elements → Panel A renders manual-entry mode (same component, `wz_state.mode='manual'`).
- Step 3: end date < min estimate → red budget banner but **not blocking** (judges may deliberately stress it — that's demo moment #5's setup).
- Step 4: pipeline throw → inline "ลองอีกครั้ง" + "ไปที่ภาพรวม" (Overview handles empty state already).

### 3.5 ⚠ DELTA — the time-estimation algorithm (engine-backed, defensible)

AOW D3 flags its own coarse model (`parallelBaseDuration` with a `crew_size/4` parallelism guess) as "the single most made-a-judgment-call piece of math." Don't defend a guess in front of engineering judges when the real engine is available. **By the time Step 3 runs, `beam_library` + `drawing_elements` exist (Step 1 produced them).** So:

**Primary path (extraction succeeded):** the estimate *is* the schedule engine.
```
estimateConstructionDuration(elements, beamLibraryById, province, project):
  boq      = computeBOQ(elements, beamLibraryById, project)        // exported from pipeline.js
  tasks    = computeSchedule(elements, boq, project)               // real PRODUCTIVITY_RATES + CURE_LAG_DAYS
  baseDays = lastTask.end_date − project.start_date                // includes cure lags + serialization
  weatherBufferDays = Σ over project months in rainy_months:
                      daysInMonth × WEATHER_IMPACT (0.4) × (avg_rain_days/30)
  recommended = baseDays + weatherBufferDays
  min = round(baseDays × 0.9)          // compressed: parallel crews, no weather slack
  max = round(baseDays × 1.25 + weatherBufferDays)   // conservative: rework + holidays
```
Every number traces to a citable source already in `schema.js`: `PRODUCTIVITY_RATES` (research4 Thai benchmarks — e.g. column concrete 12 m³/crew-day by pump, rebar 225 kg/fixer-day), `CURE_LAG_DAYS` (ACI 318 + Thai SME practice — slab 14 days before de-shoring), `PROVINCIAL_WEATHER` (Open-Meteo 1991–2020 climatology, AOW D2 §2.7). When a judge asks "where does 62 days come from?", the answer is a walkthrough of the actual task list, not a parallelism heuristic.

**Fallback path (manual entry, no beam library):** AOW's `EARLY_ESTIMATE_RATES` coarse model, kept exactly as specced (AOW D2 §2.6, D3) — labelled in the UI as "ประมาณการเบื้องต้น" so the two paths are never confused.

**Scope honesty (judges will probe this):** the estimate covers **structural works** (งานโครงสร้าง) because that is what the extraction produces. The UI labels it "ระยะเวลางานโครงสร้าง" and shows a secondary whole-project indication using a structure-share factor (structure ≈ 40% of total duration for Thai low-rise RC, per research9) — displayed, never fed into any calculation.

**Sanity gate (do this before wiring UI):** run the primary path on the demo project's seed; output must land near the hand-tuned demo schedule (~2 months structural). If it doesn't, the bug is in the harness, not the rates.

### 3.6 How wizard completion feeds the 5 tabs
Identical to AOW D5 §5.2's trigger graph: Step 4 → `runPipeline()` → each tab reads its storage key; `project_config` is additionally read by Overview (timeline groupings, budget KPI), Planner (Gantt anchor, rainy overlay), Readiness (min-duration + weather-overlap checks), Resource Hub (province-aware lead context). Tab gating: non-Overview tabs disabled until `wizard_completed_at`, demo project exempt (AOW D5 §5.3–5.4).

---

## Part 4 — Extended Schema

**Adopt AOW D2 in full**: `createProjectConfig` (AOW §2.1 — exact field list), extended `createScheduleTask` with `work_type`/`period_month`/`resource_group`/`depends_on_task_ids`/`is_critical_path`/`float_days`/`task_cost_estimate` as **additive aliases** of the existing CPM fields (§2.2 — the duplication rationale stands), extended `createBOQItem` with `category_code`/`category_label_th`/`work_type`/`unit_price_source`/`review_reason` (§2.3), `createTimelineViewState` (§2.4), `WORK_TYPE_HIERARCHY` + `workTypeFromElementType` (§2.5), `EARLY_ESTIMATE_RATES` kept **separate** from the existing granular `PRODUCTIVITY_RATES` (§2.6 — naming decision stands), `PROVINCIAL_WEATHER` 24 provinces + `PROVINCE_REGION_FALLBACK` + `getProvincialWeather` covering all 77 (§2.7), storage keys (§2.8), `createPayrollEntry` reused as-is (§2.9).

Deltas on top of AOW D2:

### 4.1 ⚠ DELTA — `createTimelineEstimate` (audit trail, new factory)
AOW folds the estimate into `project_config.timeline`, which is overwritten on every recalc — no audit trail. Judges asking "what did the AI estimate *before* you compressed it?" deserve a stored answer, and the reactive demo (Part 5) needs the immutable baseline. Append-only log, one entry per estimation run:

```js
/**
 * TimelineEstimate — บันทึกผลการประมาณระยะเวลา 1 ครั้ง (append-only, audit trail)
 * สร้างโดย estimateConstructionDuration ทุกครั้งที่รัน (wizard Step 3, Planner recalc)
 */
export function createTimelineEstimate(overrides = {}) {
  return {
    id: null,                        // uuid
    project_id: null,                // uuid FK
    estimated_at: null,              // ISO datetime
    trigger: 'wizard_step3',         // 'wizard_step3' | 'planner_recalc' | 'province_change'
    method: 'engine',                // 'engine' (computeSchedule-backed) | 'early_rates' (fallback)
    estimated_min_days: null,
    estimated_recommended_days: null,
    estimated_max_days: null,
    weather_buffer_days: null,
    rainy_season_months: [],
    // audit trail — ทุก input ที่ใช้ ณ เวลานั้น
    inputs: {
      element_counts: {},            // { [type]: count } หลัง user correction
      productivity_rates_used: null, // snapshot
      cure_lags_used: null,          // snapshot of CURE_LAG_DAYS
      province: null,
      weather_source: 'provincial_table',
      crew_assumptions: null,
    },
    created_at: null,
    ...overrides,
  };
}
```
Storage: `constistant_timeline_estimates_v1` (project-scoped array, added to both key lists). `project_config.timeline.estimated_*` stays as the *latest* values for cheap reads; the log is the provenance. Supabase sketch: same columns, `inputs jsonb`.

### 4.2 New `STORAGE_KEYS` / `PROJECT_SCOPED_KEYS` (superset of AOW §2.8)
```
projectConfig:      constistant_project_config_v1
timelineViewState:  constistant_timeline_view_state_v1
timelineEstimates:  constistant_timeline_estimates_v1   // ⚠ DELTA
drawingUploads:     constistant_drawing_uploads_v1
payroll:            constistant_payroll_entries_v1
```
All five also appended to `PROJECT_SCOPED_KEYS` so project deletion wipes them.

### 4.3 ⚠ DELTA — pipeline exports
`computeBOQ` and `computeSchedule` become **exported** from `pipeline.js` (currently module-private) so `timeline-engine.js` can drive the engine-backed estimate without duplicating math. No behavior change; `runPipeline()` keeps calling them internally.

---

## Part 5 — The Reactive Engine

The demo's signature moment: drag/edit a date → cost delta + flags update everywhere in under 200 ms, with no full pipeline re-run.

### 5.1 `js/shared/timeline-engine.js` — exports
Pure functions, no DOM, no localStorage (callers persist):

| Export | Used by |
|---|---|
| `estimateConstructionDuration(elements, beamLibraryById, province, project)` — Part 3 §3.5 dual-path | wz-step3, Planner province change |
| `calculateBudgetImpact(baselineTimeline, userStart, userEnd, crewConfig?)` — AOW D3 verbatim (compressed → extra crews at `OVERTIME_COST_MULTIPLIER`; extended → rain-risk days at 0.4 factor; returns the `budget_impact` shape with `risk_level`) | wz-step3, `pl_updateTaskDate` |
| `groupTasksByMode(tasks, 'time'|'work_type'|'resource', projectConfig)` + the three group fns — AOW D3 verbatim | Planner render, Overview work breakdown |
| `applyWeatherBuffer(tasks, rainyMonths, ratio=0.4)` — AOW D3 verbatim; called inside `computeSchedule` when `project_config` present, `WEATHER_BUFFER_BKK` fallback otherwise (zero demo-project regression) | pipeline.js |
| `shiftDependents(task, allTasks)` — ⚠ DELTA: lives here (pure), not in planner-index.js, so it's unit-checkable; cascades successor start dates via `depends_on_task_ids` + `lag_days` | `pl_updateTaskDate` |

### 5.2 Event contract
- `PIPELINE_EVENT` detail gains `reason: 'full-run' | 'schedule-changed' | 'config-changed'` (additive; current listeners ignore detail and keep working). `'schedule-changed'` carries `{ schedule, budget_impact }` so listeners re-render without re-reading localStorage.
- New `WIZARD_EVENT = 'constistant:wizard-step-changed'`, detail `{ projectId, step, status }` — shell listens for overlay show/hide + tab gating (AOW D5 §5.3).

### 5.3 Subscription matrix

| Module | `full-run` | `schedule-changed` | `config-changed` | `PROJECT_EVENT` |
|---|---|---|---|---|
| Overview | full re-render (today's behavior) | KPI cards + work-breakdown section only | KPI cards | full |
| Planner | full | re-render rows + Gantt (it originated the event — skip if self) | re-anchor Gantt, rainy bands | full |
| Resource Hub | full (`loadData`+`rebuildState`) | re-derive weekly demand + alerts from `e.detail.schedule` (skip BOQ pass) | — | full |
| Readiness | full | re-run the 2 date-sensitive checks only (min-duration, weather-overlap) | same | full |
| Shell | — | — | — | wizard check (`wz_checkAndShow`) |

### 5.4 The exact calculation chain (date edit)
```
pl_updateTaskDate(id, field, value)
  1. task[field] = value; recompute task.adjusted_duration_days from the new range
  2. task.task_cost_estimate = crew_size × CREW_TYPES[trade].day_rate_thb × duration
  3. shiftDependents(task, tasks)            // cascade via depends_on_task_ids + lag_days
  4. newProjectEnd = max(end_date); cfg.timeline.user_end_date / user_duration_days updated
  5. cfg.budget_impact = calculateBudgetImpact(cfg.timeline, start, newProjectEnd)
     // baseline_cost_estimate is the Step-3 frozen baseline (timeline_estimates[0]) — never recomputed
  6. saveTasks + saveProjectConfig
  7. dispatch PIPELINE_EVENT { reason:'schedule-changed', schedule, budget_impact }
  8. inline diff chip on the edited row: "+12,400 บาท" (red) / "−3,100 บาท" (green), fades 4s
```
Steps 1–7 are array math over <100 tasks — comfortably <200 ms. The visible cross-tab effects: Overview cost KPI shows the delta, Readiness flips "ระยะเวลาสั้นเกินไป" red when `user_duration_days < estimated_min_days`, Resource Hub shortage list re-sorts as `days_until_needed` shifts.

---

## Part 6 — Copilot Prompts for the Team

Paste-ready, in build order. Each assumes the previous one landed.

## Copilot Prompt 1: Schema extensions for wizard + timeline
### File: js/shared/schema.js (also js/shared/pipeline.js STORAGE_KEYS, js/shared/project-store.js PROJECT_SCOPED_KEYS)
### Depends on: nothing (pure additive)
---
In js/shared/schema.js (Thai/English comment style ตามไฟล์เดิม), add — without changing any existing field or factory signature:
1. `createProjectConfig(overrides)` — copy the exact field list from ARCHITECTURE_ONBOARDING_WIZARD.md §2.1 (sections A–E, nested `timeline` with `estimation_basis`, nested `budget_impact`, `wizard_completed_at`, `wizard_step_reached`).
2. `createTimelineEstimate(overrides)` — append-only estimate log: id, project_id, estimated_at, trigger ('wizard_step3'|'planner_recalc'|'province_change'), method ('engine'|'early_rates'), estimated_min/recommended/max_days, weather_buffer_days, rainy_season_months[], inputs {element_counts, productivity_rates_used, cure_lags_used, province, weather_source, crew_assumptions}, created_at.
3. Extend `createScheduleTask`: add work_type, period_month, period_label, resource_group {primary_trade, crew_type, crew_count}, depends_on_task_ids [] (alias of predecessor_task_ids — both always written identically), is_critical_path (alias of is_critical), float_days, task_cost_estimate, task_cost_actual. Existing fields untouched.
4. Extend `createBOQItem`: add category_code, category_label_th, work_type, unit_price_source ('bq_standard_2567' default), review_reason.
5. Extend `createDrawingElement`: add source ('extracted'|'manual'), user_verified, user_corrected_count. Extend `createDrawingUpload`: add sheet_type, sheet_confidence, extracted_notes.
6. `createTimelineViewState(overrides)` per ARCHITECTURE doc §2.4.
7. New constants: `WORK_TYPE_HIERARCHY` + `workTypeFromElementType()` (§2.5 verbatim), `EARLY_ESTIMATE_RATES` + `EARLY_ESTIMATE_CREW_SIZE_DEFAULT` (§2.6), `PROVINCIAL_WEATHER` 24 provinces + `PROVINCE_REGION_FALLBACK` + `getProvincialWeather()` (§2.7 verbatim — keep Thai province names as keys).
Then in pipeline.js add to STORAGE_KEYS: projectConfig/timelineViewState/timelineEstimates/drawingUploads/payroll ('constistant_project_config_v1' etc.), and append the same five keys to PROJECT_SCOPED_KEYS in project-store.js.

## Copilot Prompt 2: Drawing bridge — QT output → schema entities
### File: js/drawing/drawing-bridge.js (new)
### Depends on: schema.js, project-store.js, the shape of globalThis.qt_elementsData (see drawing-ui.js render + drawing-calc.js qt_calcElement for field names)
---
Create js/drawing/drawing-bridge.js (ES module). Export `qt_saveExtractionToProject(projectId)`:
1. Read `globalThis.qt_elementsData` (array of QT elements: {id, type, b, h, main:{n, dia}, stirrup:{dia, spacing}, length_groups:[{length, qty}], estimated, …} — confirm exact field names against drawing-calc.js).
2. For each distinct element id, build one entry with `createBeamLibraryEntry()` from schema.js: element_id, element_type (map QT type strings to 'beam'|'column'|'slab'|'footing'), width_mm/height_mm from b/h (m→mm if needed), main_bar_count/main_bar_dia_mm from main, stirrup fields, steel_grade 'SD40' default, confidence_score 0.9 (0.6 if estimated===true, add 'count_estimated' to confidence_flags).
3. For each element id, build one `createDrawingElement()`: count = Σ length_groups.qty, span_length_m = quantity-weighted mean length, floor_level 'F1' default (parameterizable), beam_library_id linking the entry from step 2, same confidence.
4. Persist both arrays through project-store.js so `getProjectElements(projectId)` returns them (follow how demo-seed data is stored/read there — extend project-store with a setter if none exists, key pattern via projectStorageKey).
5. Return {beamLibrary, elements} and also expose on window.qt_saveExtractionToProject. ห้ามสร้าง object shape เอง — ใช้ factory จาก schema.js เท่านั้น (กฎใน CLAUDE.md).

## Copilot Prompt 3: timeline-engine.js
### File: js/shared/timeline-engine.js (new); export computeBOQ + computeSchedule from js/shared/pipeline.js
### Depends on: schema.js (Prompt 1), pipeline.js
---
First, in pipeline.js, add `export` to computeBOQ and computeSchedule (no other change).
Create js/shared/timeline-engine.js — pure functions only, no DOM/localStorage:
1. `estimateConstructionDuration(elements, beamLibraryById, province, project)` — primary path: call computeBOQ then computeSchedule from pipeline.js; baseDays = (last task end_date − project.start_date) in days; weatherBufferDays = Σ over each calendar month the schedule spans where month ∈ getProvincialWeather(province).rainy_months: overlapDays × 0.4 × (avg_rain_days_per_month[m−1]/30); return {estimated_min_days: round(baseDays×0.9), estimated_recommended_days: round(baseDays+buffer), estimated_max_days: round(baseDays×1.25+buffer), weather_buffer_days, rainy_season_months, method:'engine', estimation_basis:{…inputs snapshot}}. Fallback path when beamLibraryById is empty (manual entry): coarse EARLY_ESTIMATE_RATES model from ARCHITECTURE doc D3 with method:'early_rates'.
2. `calculateBudgetImpact(baselineTimeline, userStartDate, userEndDate, crewConfig)` — exactly as ARCHITECTURE doc D3 (compressed → extraCrew ceil(recommended/actual×crew)−crew at OVERTIME_COST_MULTIPLIER; extended → rainRiskExtraDays = extra×0.4; risk_level thresholds 0.1/0.3).
3. `groupTasksByMode(tasks, mode, projectConfig)` + groupByTime/groupByWorkType/groupByResource — ARCHITECTURE doc D3 verbatim.
4. `applyWeatherBuffer(tasks, rainyMonths, bufferRatio=0.4)` — ARCHITECTURE doc D3 verbatim.
5. `shiftDependents(changedTask, allTasks)` — cascade successors: for tasks whose depends_on_task_ids includes changedTask.id, if start < changedTask.end+lag_days, shift start/end preserving duration, recurse.
Add a sanity block in a comment: running path 1 on the demo project must give ~50–70 days structural; if wildly off, check date math before touching rates.

## Copilot Prompt 4: Wizard shell + step state machine
### File: js/wizard/wz-index.js (new), css/wizard.css (new), contistant.html (one div), js/shell/shell-index.js (hook)
### Depends on: schema.js (Prompt 1), project-store.js
---
Create the onboarding wizard frame per ARCHITECTURE_ONBOARDING_WIZARD.md D1 §1.0, with CSS prefix `.wz-*` (NOT .fp-wizard-*):
1. contistant.html: add `<div id="wizard-overlay" class="wz-overlay" hidden><div class="wz-shell"><div class="wz-progress"></div><div id="wizard-step-root" class="wz-step-root"></div></div></div>` next to the canvas, plus `<link rel="stylesheet" href="css/wizard.css">`.
2. css/wizard.css: full-screen overlay (position fixed, inset 0, z-index above canvas, backdrop), centered shell card max-width 920px, 4 progress dots (.wz-dot, .wz-dot--active, .wz-dot--done), step panels .wz-step/.wz-panel/.wz-table/.wz-dropzone — reuse fp-btn/fp-badge styles from css/feature-panels.css, match the app's existing visual language.
3. js/wizard/wz-index.js: WIZARD_EVENT='constistant:wizard-step-changed'; wz_state {projectId, step, mode}; wz_getConfig/wz_saveConfig using createProjectConfig + projectStorageKey('constistant_project_config_v1'); wz_show(step)/wz_hide(); wz_goToStep(n) — saves wizard_step_reached, dispatches WIZARD_EVENT, renders step module into #wizard-step-root; wz_checkAndShow(projectId) — hide for DEMO_PROJECT_ID or when wizard_completed_at set, else show at wizard_step_reached. Export all + window.wz_*.
4. shell-index.js: import wz-index; call wz_checkAndShow on DOMContentLoaded and on PROJECT_EVENT; while wizard visible disable non-Overview tabs (pointer-events:none + aria-disabled), demo project always unlocked.
All user-facing text Thai. Step modules (wz-step1..4) are separate files — stub them as placeholder renders for now.

## Copilot Prompt 5: Wizard Steps 1–2 (upload, classify, review)
### File: js/wizard/wz-step1.js, js/wizard/wz-step2.js, js/wizard/wz-manual-fallback.js, js/drawing/drawing-gemini.js (one new fn)
### Depends on: wz-index.js (Prompt 4), drawing-bridge.js (Prompt 2), drawing-upload.js, drawing-gemini.js
---
Implement wizard Steps 1–2 per ARCHITECTURE_ONBOARDING_WIZARD.md D1 §1.1–1.2 and §1.5, with these corrections: there are no qt_runPass1/qt_runPass2 functions — reuse qt_extractPdfPages (drawing-upload.js) and qt_callGeminiParts (drawing-gemini.js) directly, and lift the page-classification prompt from Pass 0 inside qt_runRead (drawing-index.js) into a new exported `qt_classifySheet(key, imageDataUrl)` in drawing-gemini.js returning {sheet_type:'floor_plan'|'section_detail'|'general_notes'|'schedule_table'|'unknown', confidence:0–1}.
Step 1 (wz-step1.js): dropzone (drag+click) → qt_extractPdfPages → thumbnail grid with classification badge per page (≥0.85 green / 0.6–0.85 amber / <0.6 red, reuse .fp-badge--*) → if any floor_plan/section_detail ≥0.6, run the extraction passes (reuse the prompt strings from qt_runRead) → call qt_saveExtractionToProject(projectId) from drawing-bridge.js → enable ถัดไป. If all <0.6: show banner with "กรอกข้อมูลเอง" (manual fallback) and "อัปโหลดไฟล์ใหม่". "ใช้โปรเจคตัวอย่าง" button → selectProject(DEMO_PROJECT_ID) + wz_hide().
Step 2 (wz-step2.js): Panel A table grouped by element_type from getProjectElements() — editable count (writes project_config.estimation_basis.element_counts[type]={extracted, corrected}, NOT individual rows), ยืนยัน button sets user_verified on all rows of the type; Panel B/C per the doc (simple pass-through acceptable first iteration).
wz-manual-fallback.js: add/remove row table (ประเภทงาน select เสา/คาน/พื้น/ฐานราก/บันได, จำนวน, หน่วย, หมายเหตุ); save → createDrawingElement({source:'manual', confidence_score:1, user_verified:true}) per row, persisted same way as the bridge.
CSS .wz-*, text Thai, all handlers exported + window.wz_*.

## Copilot Prompt 6: Wizard Steps 3–4 (configure, estimate, generate)
### File: js/wizard/wz-step3.js, js/wizard/wz-step4.js
### Depends on: timeline-engine.js (Prompt 3), wz-index.js, pipeline.js
---
Implement wizard Steps 3–4 per ARCHITECTURE_ONBOARDING_WIZARD.md D1 §1.3–1.4.
Step 3: five .wz-panel sections — A ข้อมูลโครงการ (pre-fill from projects row; auto-calc area from slab elements if blank), B มาตรฐานออกแบบ (WSD default / ACI318), C สถานที่ (province select — 77 จังหวัด, the 24 in PROVINCIAL_WEATHER first then เรียงตามตัวอักษร; on change call wz_recalcTimeline), D ระยะเวลา (3 horizontal bars min/แนะนำ/max from estimateConstructionDuration — label "ระยะเวลางานโครงสร้าง"; start/end date inputs; end defaults to start+recommended unless user touched it; on change run calculateBudgetImpact and show banner "⚠ ระยะเวลา X วัน ต้องการแรงงานเพิ่ม ~Y คน → ค่าใช้จ่ายเพิ่ม ≈ Z บาท" for compression or rain-risk message for extension), E แหล่งราคาวัสดุ (radio, standard_bq default, catalog picker stub "เร็วๆ นี้").
Every estimateConstructionDuration call also appends a createTimelineEstimate entry to constistant_timeline_estimates_v1 (project-scoped).
"สร้างภาพรวมโครงการ" → wz_finishWizard(): assemble full createProjectConfig, wizard_completed_at=now, persist, sync name/building_type/floors/area/start_date back onto the projects row, goToStep(4).
Step 4: checklist of 5 items (BOQ/BBS/ตารางงาน/ทรัพยากร/ความพร้อม) driven by runPipeline's existing onProgress(label, step, total) callback — spinner on active, ✓ on done; on resolve wz_hide() + activate Overview tab; on error inline ลองอีกครั้ง + ไปที่ภาพรวม (non-blocking).

## Copilot Prompt 7: Pipeline extensions + demo-seed parity
### File: js/shared/pipeline.js, js/shared/demo-seed.js
### Depends on: schema.js (Prompt 1), timeline-engine.js (Prompt 3)
---
pipeline.js: (1) computeBOQ — set work_type via workTypeFromElementType(el.element_type) and category_code/category_label_th from WORK_TYPE_HIERARCHY (use sub_categories for column/beam/slab), unit_price_source 'bq_standard_2567'; (2) computeSchedule — set work_type the same way, period_month = 1-based month index of start_date from project start, period_label "เดือนที่ N", resource_group {primary_trade: rebar→'steel_fixer', formwork→'carpenter', concrete→'concrete_gang', crew_type same, crew_count: crew_size}, write depends_on_task_ids identical to predecessor_task_ids and is_critical_path identical to is_critical, task_cost_estimate = crew_size × CREW_TYPES[trade].day_rate_thb × adjusted_duration_days; (3) after building tasks, if project_config (read via projectStorageKey('constistant_project_config_v1')) has rainy_season_months, replace the per-task calcAdjustedDuration weather logic with applyWeatherBuffer(tasks, months, 0.4) from timeline-engine.js — keep existing WEATHER_BUFFER_BKK path when config absent (demo project unaffected); (4) computeReadiness — add two checks when project_config exists: red 'timeline_risk' "ระยะเวลาสั้นเกินไป" when timeline.user_duration_days < estimated_min_days (detail: ระบุจำนวนวันที่ขาด), amber 'weather_overlap' "ช่วงโครงสร้างตรงกับฤดูฝน" when any task work_type∈{structure,foundation} has weather_risk='high' (detail: รายชื่อเดือนที่ทับซ้อน); (5) PIPELINE_EVENT detail gains reason:'full-run'.
demo-seed.js: add a PROJECT_CONFIG seed (createProjectConfig: กรุงเทพมหานคร, WSD, wizard_completed_at set, timeline numbers consistent with the existing schedule ~Sep–Nov 2025) exposed via a new getDemoDataByEngine case or alongside existing exports; populate work_type/period_month/resource_group/depends_on_task_ids/is_critical_path on the four existing SCHEDULE_TASKS and work_type/category_code on BOQ_ITEMS so groupings render with zero pipeline runs.

## Copilot Prompt 8: Reactive date editing in Planner
### File: js/planner/planner-index.js (+small listeners in overview-index.js, resource-index.js, readiness-index.js)
### Depends on: timeline-engine.js (Prompt 3), pipeline extensions (Prompt 7)
---
planner-index.js: (1) grouping toggle (จัดกลุ่มตามช่วงเวลา/ประเภทงาน/ทรัพยากร) persisted via createTimelineViewState + projectStorageKey('constistant_timeline_view_state_v1'); render collapsible groups from groupTasksByMode; (2) inline `<input type="date">` on each task row's start/end → pl_updateTaskDate(id, field, value): update task, recompute adjusted_duration_days from the range, task_cost_estimate (crew_size × CREW_TYPES[resource_group.primary_trade].day_rate_thb × duration), call shiftDependents from timeline-engine.js, derive newProjectEnd = max end_date, update project_config.timeline.user_end_date/user_duration_days, project_config.budget_impact = calculateBudgetImpact(timeline, start, newProjectEnd), persist tasks + config, dispatch PIPELINE_EVENT {reason:'schedule-changed', schedule, budget_impact}, re-render, show transient diff chip "+N บาท"/"−N บาท" fading after 4s; (3) export + window.pl_setGrouping/pl_updateTaskDate/pl_toggleGroup.
Listeners (additive — do not break existing full re-render on PIPELINE_EVENT): in overview-index.js, resource-index.js, readiness-index.js, branch on e.detail?.reason==='schedule-changed' to do a partial update — Overview: KPI cards + timeline groupings only; Resource Hub: rebuild weekly demand + alerts from e.detail.schedule without reloading BOQ; Readiness: re-evaluate only timeline_risk and weather_overlap checks. Events with no reason or 'full-run' keep today's behavior.

---

## The Honest Assessment

Given the current state — a working 5-engine pipeline, a finished Resource Hub, a fully-specced wizard, but zero wizard code, no QT→schema bridge, and nothing reactive — a 5-tech-person team has a **realistic but not comfortable** shot at 7/7: call it **60–65% for 7/7, 90%+ for 6/7**, assuming roughly two 10-day cycles remain (items 1–6 fit in cycle one with parallelization across schema/bridge/engine/wizard; reactive + Gantt fill cycle two). The two highest-risk items are: **(1) live Gemini extraction on the judges' (or our own real) PDF** — the entire wizard Step 1 happy path depends on a multi-pass vision flow that today has only ever fed a disconnected review screen, and rate limits, a blurry scan, or a misclassified sheet at demo time kills demo moments #1–#2 in front of the room; **(2) the reactive engine's cross-tab consistency** — five modules re-rendering from one event with partial updates is exactly the kind of feature that works in isolation and shows a stale KPI in the live demo. The fallback that still scores well on Engineering Viability: the architecture already contains it — the demo project's pre-seeded path and the manual-fallback table are both first-class flows, so if risk 1 materializes we run the wizard on the demo PDF with cached classification (or pivot to "กรอกข้อมูลเอง" on stage, which is itself a judged "no dead ends" feature), and if risk 2 materializes we cut partial re-renders and let `pl_updateTaskDate` trigger a full `runPipeline()` — it's ~1.5 s instead of 200 ms, which is a worse sentence in this document but a perfectly fine moment on stage. What is *not* recoverable late is the drawing bridge (item 2) — it is the difference between a platform and a slideshow, it is two days of work, and it should be the first code written after the current tree is committed.
