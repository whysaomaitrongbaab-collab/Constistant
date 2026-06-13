# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Constistant" (Steel Calc) — a static, no-build, vanilla JS web app for Thai construction teams: rebar cut-list optimization (CSP), AI-driven drawing/quantity-takeoff scanning, and project save/load via Supabase. Built for STECON Group Innovation Challenge SS4.

There is no build step, package manager, or test runner — plain HTML/CSS/JS files served directly (e.g. via a static file server / Live Server).

See [README.md](README.md) for the full project layout and data flow diagram.

## Setup

- Copy [config/supabase.example.js](config/supabase.example.js) to `supabase.js` at the repo root and fill in real Supabase project URL + anon key (gitignored — never commit real keys).
- Pages of interest:
  - [contistant.html](contistant.html) — main app shell (sidebar/tabs/canvas layout). CSS in `css/`; shell behavior in `js/shell/shell-index.js`.
  - [pages/boq-summary.html](pages/boq-summary.html) and [pages/material-catalog.html](pages/material-catalog.html) — standalone pages mounting `js/boq/boq-summary.js` and `js/catalog/material-catalog.js`
  - [demo/drawing-demo-runner.html](demo/drawing-demo-runner.html) — standalone demo runner for the drawing pipeline
  - [legacy/quantitake-kak.html](legacy/quantitake-kak.html) — legacy QT prototype (superseded by shell + `templates/drawing/quantitake-panel.html`)

## Architecture

### Shell (`contistant.html` + `js/shell/`, `css/`)
`contistant.html` is a thin shell: topbar (project switcher, "Calculate Project" button), sidebar, tab bar, and one `<div class="app-panel" id="*-app">` per feature tab. `js/shell/shell-index.js` wires tab switching, project switcher, wizard overlay, and `constistant_runPipeline()`.

### Data contract: `js/shared/schema.js`
Single source of truth for all object shapes. **Never construct entity objects ad-hoc — always use `create*` factory functions.**

Entity dependency chain:
```
projects
  └── project_config
  └── drawing_uploads
        ├── beam_library
        └── drawing_elements
              ├── boq_items → bbs_items → schedule_tasks → resource_items
              └── readiness_checks
```

`schema.js` also exports lookup tables: waste/lap/bend factors, cost factors, `CREW_TYPES`, `EQUIPMENT_TYPES`, `PROVINCIAL_WEATHER`, `WORK_TYPE_HIERARCHY`, etc.

### Shared modules (`js/shared/`)
- `schema.js` — entity factories and reference tables
- `demo-seed.js` — demo project seed data via `getDemoDataByEngine(engine)`
- `pipeline.js` — `runPipeline()`: BOQ → BBS → schedule → resources → readiness; fires `PIPELINE_EVENT`
- `project-store.js` — multi-project localStorage via `projectStorageKey()`; fires `PROJECT_EVENT`
- `timeline-engine.js` — duration estimation, budget impact, task grouping, weather buffer, `computeEVM()` (Earned Value Management: SPI/CPI/EAC/VAC + S-curve series from `schedule_tasks.percent_complete`/`task_cost_actual`)
- `price-config.js` — **single source of truth for material pricing** (concrete, rebar, formwork, labor costs from CGD 2569); supports user overrides via `getEffectivePrice()` + localStorage, tracks `unit_price_source` ('cgd_2026' | 'manual' | 'upload')

### Feature modules (one folder per tab)
| Folder | Tab / page | Prefix |
|---|---|---|
| `js/overview/` | Overview | — |
| `js/drawing/` | Drawing Intelligence | `qt_*` |
| `js/bbs/` | BBS | — |
| `js/readiness/` | Readiness Check | `rc_*` |
| `js/planner/` | Planner | `pl_*` |
| `js/resource/` | Resource Hub | `rh_*` |
| `js/wizard/` | Onboarding wizard | `wz_*` |
| `js/boq/` | BOQ Summary page | — |
| `js/catalog/` | Material Catalog page | — |

Drawing Intelligence loads its UI from `templates/drawing/quantitake-panel.html` at runtime via `drawing-index.js` → `qt_mountPanel()`.

### Material Pricing System (`js/shared/price-config.js`, `js/boq/boq-export.js`)
**Single source of truth for construction material costs** — replaces hardcoded rates across pipeline/BOQ/catalog.

**Data hierarchy:**
1. `MATERIAL_PRICES` in price-config.js — base prices from CGD 2569 (concrete: 180-350 ksc; rebar: SR24/SD30/SD40 all diameters; formwork; labor)
2. User overrides — localStorage `constistant_price_override` (per material_key: `concrete.ready_mix_240`, `rebar.sd40_16`, etc.)
3. Supabase `material_prices` table (future per-project pricing)

**Functions:**
- `getPriceByKey(material_key)` — retrieve base price
- `getEffectivePrice(material_key)` — base price + user overrides
- `saveLocalStorageOverride(material_key, price, source, note)` — user custom price
- All exported to `window.*` for onclick handlers in Material Catalog UI

**BOQ Export (`js/boq/boq-export.js` + `boq-print.css`):**
- `exportBOQToHTML(projectId)` — government-standard format (mirrors "Boq Excel Template for public job.xlsm")
- Pulls data from localStorage `STORAGE_KEYS.boq` (populated by pipeline)
- Hierarchical WBS grouping by `category_code` + subtotals per category
- Grand total + 7% VAT footer, signature blocks
- Opens in new window with auto-triggered print dialog → PDF
- Print CSS: A4 landscape, Sarabun + IBM Plex Mono, color-coded rows (category header #d4d4d4, subtotal #e8e8e8, grand total #1a4080)

**Integration:** Pipeline reads prices via `getConcretePrice(ksc)`, `getRebarPrice(grade, dia_mm)`, `getFormworkPrice(element_type)` → tracks `unit_price_source` in BOQ items for traceability.

### Planner (`js/planner/`) — site-engineer overview
Page is overview-first: header status strip (activity/critical counts, total days, project end date, SPI/CPI pills via `computeEVM()`, overall % -complete bar) → HTML-grid Gantt → editable task table → add-activity form.
- Gantt is an HTML grid (`.gantt2*` classes in `css/feature-panels.css`), not SVG — left label column + month axis row + per-task lane, with percent-complete fill, critical-path outline, weather-risk hatch, rainy-season band overlays, and a today-line.
- Click any Gantt bar → `pl_showDetail(id)` opens a `.modal-overlay`/`.pl-detail` modal with the full task record (`renderDetailModal`); `pl_closeDetail()` closes it. State held in module-level `openDetailId`.
- Editing `% เสร็จ` / `ใช้จริง (฿)` in the task table calls `pl_updateProgress`/`pl_updateActualCost`, which persist and dispatch `PIPELINE_EVENT` (`reason: 'progress-changed'`) so Overview's EVM card re-renders live.
- `loadProjectConfig()` falls back to `getDemoProject().project_config` when the current project is `DEMO_PROJECT_ID` and localStorage has no saved config (keeps rainy-season overlay working out of the box).

### Module conventions
- ES modules, but functions also attached to `window`/`globalThis` for inline `onclick` handlers.
- Cross-module mutable state on `globalThis` (e.g. `qt_elementsData`).
- Comments mix Thai and English — follow existing usage per file.

### Three-layer model
1. Frontend (HTML/CSS/JS) — UI only
2. Supabase JS SDK (`supabase.js` at repo root) — DB read/write
3. Supabase (Postgres + Auth) — schema in `database/`

## Reference docs
- [docs/architecture/ARCHITECTURE_ONBOARDING_WIZARD.md](docs/architecture/ARCHITECTURE_ONBOARDING_WIZARD.md) — wizard spec, cross-engine data flow
- [docs/planning/ENDGAME_BUILD_PLAN.md](docs/planning/ENDGAME_BUILD_PLAN.md) — implementation roadmap
- [docs/team/STEEL_CALC_TEAM_GUIDE.md](docs/team/STEEL_CALC_TEAM_GUIDE.md) — team roles, scoring rubric
- [database/](database/) — SQL schemas
- [research/](research/) — domain research reports
