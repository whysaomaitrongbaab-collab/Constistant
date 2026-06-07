# Steel Calc — Team Guide
### Platform Architecture, Workflow, and Responsibilities
**STECON Group Innovation Challenge SS4**

---

## 1. What We Are Building

**Steel Calc** is a web-based platform for rebar bar cut list optimization, targeting Thai construction field teams. It is not a full BIM replacement — it is a lightweight, field-accessible tool that solves a specific problem: minimizing rebar waste through intelligent cut-list calculation.

**Core Value Proposition:**
- Contractor inputs required bar lengths and quantities
- Platform calculates the optimal cutting pattern from standard stock bars
- Result: measurable waste reduction (target ≥8%) with exportable cut list

**Three Core Features (in priority order):**

| Priority | Feature | Why It Matters |
|---|---|---|
| 1 | CSP Rebar Optimizer | Engineering Viability — 40% of score |
| 2 | AI Scanner | Innovation — 30% of score |
| 3 | Save / Load Projects | Business Viability + demo credibility |

---

## 2. Platform Architecture — The Big Picture

The platform has 3 layers. Every team member must understand what each layer does and does not do.

```
┌─────────────────────────────────────┐
│         LAYER 1: FRONTEND           │
│   What the user sees and clicks     │
│   HTML + CSS + JavaScript           │
└──────────────┬──────────────────────┘
               │ sends / receives data
┌──────────────▼──────────────────────┐
│     LAYER 2: SUPABASE SDK           │
│   The messenger between UI and DB   │
│   JavaScript library (5-10 lines)   │
└──────────────┬──────────────────────┘
               │ reads / writes
┌──────────────▼──────────────────────┐
│       LAYER 3: SUPABASE             │
│   The database — stores all data    │
│   Lives on Supabase's servers       │
│   Managed via web dashboard         │
└─────────────────────────────────────┘
```

**Key principle:** The user only ever sees Layer 1. Layers 2 and 3 are invisible to them. F&E team owns defining what Layer 1 looks and behaves like. Tech team owns building all three layers.

---

## 3. Coding Languages

All layers use **one language: JavaScript**. This is intentional — it keeps the team aligned and reduces integration friction.

| Layer | Language | Who Writes It |
|---|---|---|
| UI structure | HTML | Frontend dev |
| UI styling | CSS | Frontend dev |
| UI behavior + logic | JavaScript | Frontend dev |
| Database calls | JavaScript (Supabase SDK) | Backend dev |
| Optimization algorithm | JavaScript | Backend dev |
| AI Scanner calls | JavaScript | Backend dev |
| Database tables | No code — Supabase dashboard | Backend dev |

---

## 4. File Structure

Everything lives in one GitHub repository. Frontend and Backend work in separate files within that repo.

```
steel-calc/
│
├── index.html              ← Main page shell
├── style.css               ← All styling
│
├── app.js                  ← Main app logic, navigation, state
├── supabase.js             ← ALL database read/write calls
├── calculator.js           ← CSP optimization algorithm (core engine)
├── ai-scanner.js           ← AI Scanner API call + response parsing
│
└── components/
    ├── cutlist.js          ← Cut list input component
    ├── results.js          ← Results display component
    ├── projects.js         ← Save/load project list
    └── scanner-ui.js       ← Camera/upload UI for AI Scanner
```

**Ownership:**

| File / Folder | Owner |
|---|---|
| `index.html`, `style.css`, `app.js`, `components/` | Frontend dev |
| `supabase.js`, `calculator.js`, `ai-scanner.js` | Backend dev |
| Supabase dashboard (tables, auth) | Backend dev |

---

## 5. Data Flow — How the Platform Works

### When a user calculates and saves a project:

```
1. User fills in bar diameter, stock length, and required cut list
          ↓
2. Frontend collects all input values (JavaScript)
          ↓
3. Frontend passes data to calculator.js (CSP algorithm runs)
          ↓
4. Results display on screen (waste %, cutting patterns)
          ↓
5. User clicks "Save Project"
          ↓
6. Frontend calls supabase.js: "insert this project into database"
          ↓
7. Supabase SDK sends secure request to Supabase servers
          ↓
8. Supabase stores it — returns confirmation
          ↓
9. Frontend shows: "Project saved ✓"
```

### When a user loads a saved project:

```
1. User clicks "My Projects"
          ↓
2. Frontend calls supabase.js: "fetch all projects for this user"
          ↓
3. Supabase returns list of saved projects
          ↓
4. Frontend renders them as selectable cards
          ↓
5. User selects one — inputs and results repopulate
```

### When a user uses AI Scanner:

```
1. User uploads photo of rebar schedule / structural drawing
          ↓
2. scanner-ui.js receives the image file
          ↓
3. ai-scanner.js sends image + prompt to Claude API (or GPT-4o)
          ↓
4. AI returns extracted cut list as structured JSON data
          ↓
5. Frontend auto-populates the cut list input fields
          ↓
6. User reviews, adjusts if needed, then runs optimization
```

---

## 6. Database Schema (Supabase Tables)

Backend dev sets this up in Supabase dashboard. F&E must review and approve before coding begins.

### Table: `projects`

| Field | Type | Description |
|---|---|---|
| `project_id` | UUID | Auto-generated unique ID |
| `user_id` | UUID | Links to authenticated user |
| `project_name` | Text | User-defined project name |
| `created_at` | Timestamp | Auto-generated |
| `bar_diameter` | Number | e.g. 16, 20, 25 mm |
| `stock_length` | Number | Standard bar length in mm (e.g. 12000) |
| `cut_list` | JSON | Array of { length, quantity } objects |
| `optimization_result` | JSON | { waste_percent, patterns, total_bars_used } |

### Table: `users` (handled by Supabase Auth — no manual setup needed)

---

## 7. Team Roles and Responsibilities

### F&E Team (Feature & Engineering) — 3 people

**Primary responsibility:** Define what gets built. Own the specification documents that Tech builds from.

| Responsibility | Output |
|---|---|
| Feature specification per screen | Written spec with input/output description |
| User flow definition | Step-by-step user journey for each feature |
| Data field list for each feature | Tells backend what to store in database |
| Engineering formula research | Formulas for CSP algorithm for backend to implement |
| Acceptance criteria | How Tech knows a feature is "done" |
| Validation sign-off | F&E confirms built feature matches spec |

**Rule:** No feature enters development without a written spec from F&E. Verbal handoffs are not acceptable.

---

### Tech Team (Frontend + Backend) — 4 people

**Primary responsibility:** Build what F&E specifies. Own all code and infrastructure.

**Frontend (1–2 people)**

| Responsibility |
|---|
| Build all UI screens from F&E wireframes/specs |
| Handle all user inputs, button clicks, navigation |
| Display calculation results clearly |
| Connect UI to backend functions (supabase.js, calculator.js) |
| Own: index.html, style.css, app.js, components/ |

**Backend (1–2 people)**

| Responsibility |
|---|
| Build CSP optimization algorithm (calculator.js) |
| Set up Supabase tables and authentication |
| Write all database read/write functions (supabase.js) |
| Integrate AI Scanner API (ai-scanner.js) |
| Own: supabase.js, calculator.js, ai-scanner.js, Supabase dashboard |

---

## 8. Build Workflow — Stage by Stage

### Stage 1: Spec Lock (F&E → Tech)
F&E delivers written specifications covering:
- Every screen the user sees
- Every input field and output shown
- What data gets saved per feature
- Acceptance criteria (what "done" looks like)

**Gate:** Tech does not start coding until this is approved by both sides.

---

### Stage 2: Schema Design (Backend)
Backend defines the database table structure in Supabase dashboard.
F&E reviews and approves all fields before tables are created.

**Gate:** F&E signs off on schema. Changes after this point require explicit approval.

---

### Stage 3: Parallel Build
Frontend and Backend build simultaneously using the approved spec and schema.
- Frontend uses mock/placeholder data while Backend builds
- Backend builds save/load logic independently
- Both sides sync at defined checkpoints (recommended: every 3 days)

---

### Stage 4: Integration
Frontend connects to Backend. Both sides test the full user flow together.
- Input → Calculate → Save → Close → Reopen → Load
- This stage always takes longer than expected. Build in at least 3–4 days.

---

### Stage 5: F&E Validation
F&E tests the working prototype against the original spec.
- Does it do what the spec said?
- Are all inputs and outputs correct?
- Does the save/load work reliably?

F&E raises issues as written bug reports. Tech fixes and re-submits for validation.

---

## 9. Demo Readiness Standard

The prototype is demo-ready when it passes this test:

```
1. Open the platform URL on any device
2. Enter a rebar cut list (manually OR via AI Scanner)
3. Run the optimization — see waste % and cutting patterns
4. Save the project with a name
5. Close the browser completely
6. Reopen the URL and log back in
7. Load the saved project — all data reappears correctly
```

If all 7 steps work cleanly, the demo is ready. If any step fails, it is not ready.

---

## 10. Critical Deadlines

| Milestone | Who | Deadline |
|---|---|---|
| Feature specs written | F&E | Before Stage 2 |
| Database schema approved | Both | Before Stage 3 |
| Backend has working save endpoint | Backend | ≥5 days before demo |
| Integration complete | Tech | ≥3 days before demo |
| F&E validation complete | F&E | ≥2 days before demo |
| Demo rehearsal | Full team | ≥1 day before demo |

**The single highest-risk item:** Backend save/load must be working 5 days before demo. If this is not met, the entire platform demo is at risk.

---

## 11. Tech Stack Summary

| Component | Technology | Purpose |
|---|---|---|
| Frontend | HTML, CSS, JavaScript | User interface |
| Database | Supabase (PostgreSQL) | Data storage and auth |
| Database SDK | Supabase JavaScript SDK | Connect frontend to database |
| Hosting | Vercel or Netlify (free) | Live URL for judges |
| AI Scanner | Claude API or GPT-4o | Extract cut list from photos |
| Version Control | GitHub | Shared code repository |
| Algorithm | Custom JavaScript (CSP) | Rebar cut optimization engine |

---

## 12. Scoring Alignment

Every feature we build must serve the competition rubric.

| Rubric Category | Weight | Feature That Serves It |
|---|---|---|
| Engineering Viability | 40% | CSP Algorithm — waste %, cutting patterns, calculation accuracy |
| Innovation | 30% | AI Scanner — field photo to cut list automatically |
| Business Viability | 10% | Save/Load Projects — platform usability and retention |
| Sustainability | 10% | Waste reduction metrics — CO₂ and material savings displayed |
| Presentation & Teamwork | 10% | Demo flow, team coordination, delivery quality |

Build in this order. Engineering Viability + Innovation = 70% of the score.

---

*Document version: 1.0 — Steel Calc Team, STECON SS4*
