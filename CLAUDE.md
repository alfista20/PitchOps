# CLAUDE.md — PitchOps Project Documentation

> This file is the single source of truth for any AI assistant working on PitchOps.
> Read it fully before touching any code. Last updated: May 2026.

---

## 1. Project Overview

**PitchOps** is a global pitch operations and quality management platform for FIFA tournaments. It serves as a shared platform where ground staff (Venue Managers) and organisers (Area Managers, Master Admin) can:

- Register and track pitch maintenance tasks and pitch usage
- Plan future operations and events via a weekly/monthly schedule
- Run statistics and analytics on pitch operations
- (Planned) Conduct structured pitch assessments and performance tests per the FIFA Natural Pitch Rating System
- (Planned) Generate consolidated PDF reports across all data modules

**Target scale:** Hundreds of venues across multiple simultaneous FIFA tournaments worldwide.

**Deployment:** `https://alfista20.github.io/PitchOps` (GitHub Pages)

**Backend:** Supabase — `https://dqlcgqfkyvzneakgcyxq.supabase.co`

---

## 2. Current Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Single-file HTML (`index.html`) | CSS + JS in one file, ~9300 lines |
| Backend | Supabase (PostgreSQL + Storage + Realtime) | JS SDK v2.39.3 |
| Charts | Chart.js 4.4.1 | Stats module |
| Fonts | Syne (headings), system sans-serif | Via Google Fonts |
| Hosting | GitHub Pages | Auto-deploy on push to main |
| Translation | Supabase Edge Function `translate` | Calls Anthropic claude-haiku via proxy |
| Auth | Custom SHA256 + localStorage | Temporary — migrating to Supabase Auth with Area Manager |

**Why single-file:** Started as a rapid prototype, grew organically. Migration to proper architecture is planned (see Section 9).

---

## 3. Access Levels & Hierarchy

```
Master Admin (Kris Puzio)
    └── Area Manager  (multi-project, email+password, Supabase Auth planned)
            └── Venue Manager  (single venue, URL token ?token=)
                    └── Project Viewer  (read-only, URL token ?view=)
```

### Current implementation
| Role | Auth method | Scope |
|------|------------|-------|
| Master Admin | Email + SHA256 password (localStorage) | Full access, all projects |
| Area Manager | **Planned** — Supabase Auth | Assigned projects + venues |
| Venue Manager | URL token `?token=` | Single venue |
| Project Viewer | URL token `?view=` | Read-only, single project |

### Area Manager (planned — next major feature)
- Logs in with email + password via Supabase Auth
- Master Admin assigns: which projects, which venues within those projects
- Can act as **Assessor** for both Pitch Assessments and Pitch Performance Tests
- Can manage multiple tournaments simultaneously
- Permissions managed via new `pitchops_area_managers` + `pitchops_am_permissions` tables

### Venue Manager token rules
- Venue Manager (token): access to Pitch Operations + Pitch Performance Tests (as assessor)
- Venue Manager does NOT have access to Pitch Assessments (Area Manager only)

---

## 4. Supabase Schema

### Tables

| Table | Description | Key columns |
|-------|-------------|-------------|
| `pitchops_projects` | Tournaments/projects | `id`, `code`, `name`, `country`, `status`, `viewer_token` |
| `pitchops_venues` | Stadiums/pitches | `id`, `project_id`, `name`, `city`, `type`, `token` |
| `pitchops_operations` | Maintenance tasks | `id` (text `op_+Date.now()`), `venue_id`, `project_id`, `operation_date`, `type`, `zone`, `status`, `staff`, `photo_urls` |
| `pitchops_usage` | Pitch usage log | `id`, `venue_id`, `usage_date`, `usage_type`, `team`, `time_from`, `time_to` |
| `pitchops_plans` | Planned operations | `id`, `venue_id`, `operation_date`, `type`, `zone` |
| `pitchops_events` | Calendar events | `id`, `venue_id`, `name`, `date_start`, `date_end`, `color_bg`, `color_fg` |
| `pitchops_op_types` | Task type bank | `id`, `name`, `name_en`, `name_pl`, `name_es`, `name_fr`, `name_de`, `name_pt` |
| `pitchops_usage_types` | Usage type bank | `id`, `name`, `name_en`, `name_pl`, `name_es`, `name_fr`, `name_de`, `name_pt` |

### ID convention
Operations: `'op_' + Date.now()` (text type, NOT UUID). All other tables use serial integer IDs.

### RLS status
All tables have RLS enabled with `allow_all` policy (`USING (true)`). This is a temporary state — proper per-user RLS will be implemented when Supabase Auth is introduced with Area Manager.

### Storage
Bucket: `pitchops-photos`. Photos stored at `{table}/{recordId}/photo_{index}_{timestamp}.jpg`. All images compressed client-side to max 1200px / 0.82 JPEG quality before upload. Max file size: 5MB per file, max 8 photos per record.

### Edge Functions
- `translate` — proxies Anthropic claude-haiku-4-5 to auto-translate task/usage type names into 6 languages. JWT verification disabled. Requires `ANTHROPIC_API_KEY` secret.

---

## 5. Application Modules

### Current — Pitch Operations (live)
The core module. Accessible to all roles.

**Sub-features:**
- **Log Task** — record maintenance operations with type, zone, staff, photos, status
- **Log Usage** — record pitch usage (match day, training, other) with team, time, photos
- **Schedule** — weekly Gantt (admin: all venues) + weekly/monthly calendar (venue)
- **Stats** — Chart.js charts, PDF export, admin compare-venues builder

### Planned modules (in priority order)

**Pitch Assessments** (Area Manager + Venue Manager as assessor)
- Structured forms: Data Questionnaire, Stage I Assessment, Stage II Assessment, Tournament Daily Assessment
- Pre-designed templates, data input, export to PDF
- Separate Supabase tables per assessment type

**Pitch Performance Tests** (Area Manager + Venue Manager as assessor)
- Numeric data input from physical tests per FIFA Natural Pitch Rating System
- Tests: Surface Hardness (CIV), Compaction (MPa), Infiltration Rate (mm/h), NDVI, Sward Height, Root Depth, Thatch Depth, Ground Coverage %, Weed Content, Moisture Content, Ball Rebound, Ball Roll, Shock Absorption, Vertical Deformation, Rotational Resistance, Evenness
- Test positions: A–S per FIFA field diagram (6 key positions for reduced assessment: A, L, K, J, Q, H)
- Assessment types: Full Assessment (FIFA-accredited) + Reduced Assessment (ground staff)
- Grass type context: Cool season / Warm season (affects benchmarks)
- Auto-scoring per FIFA rating system (1/3/5/7/10 points per characteristic + weightings)
- Overall score = % of weighted sum
- Graphs, trends over time, benchmark comparison
- Export to PDF

**Report Generator**
- Cross-module: select any data from any module
- Export to single consolidated Report.pdf

**Future (not yet planned):**
- Inventory management
- Turf Monitor — API/sensor integration with live dashboards

---

## 6. FIFA Natural Pitch Rating System

Key reference for Pitch Performance Tests module design.

### Scoring
- Unacceptable: 1pt | Poor: 3pt | Satisfactory: 5pt | Good: 7pt | Excellent: 10pt
- Consistency rated separately (same scale) — not counted if main score is Unacceptable/Poor
- Subjective: Major concerns 1pt | Minor 5pt | No concerns 10pt
- Overall score (%) = Σ(score × weighting) / Σ(10 × weighting)

### Key characteristics and weightings (abbreviated)
| Characteristic | Weighting |
|---------------|-----------|
| Surface hardness | 10 |
| Surface hardness — consistency | 10 |
| Shock absorption | 9 |
| Infiltration rate | 8 |
| Ground coverage | 8 |
| Rotational resistance | 6 |
| NDVI | 6 |
| Evenness | 5 |
| Sward height, Root depth, Thatch, Weed, Insects, Diseases | 5 each |
| Vertical ball rebound, Ball roll, Vertical deformation | 4 each |
| Compaction severity | 3 |
| Visual inspection (divots) | 3 each |
| Moisture consistency | 3 |

Full specification: `FIFA_natural_pitch_rating_system_EN_v1_0.pdf` (in project repo).

---

## 7. Internationalisation (i18n)

**6 languages:** EN (base), PL, ES, FR, DE, PT

**Rules:**
- All UI strings must have keys in ALL 6 language blocks in `index.html`
- i18n object is at line ~1991 in `index.html`
- Block order: `en → pl → es → fr → de → pt`
- `t('key')` function returns `(i18n[state.lang]||i18n.en)[key]||key`
- `appLocale()` maps `state.lang` to browser locale (e.g. `'pl'→'pl-PL'`)
- Never use `toLocaleDateString` without passing `appLocale()` — otherwise uses OS language

**Validator — run before every deploy:**
```bash
node validate-i18n.js index.html
```
Exit code 0 = all languages complete. Exit code 1 = missing keys, do not deploy.

**Task/usage type names:** Stored in DB with `name_en`, `name_pl`, `name_es`, `name_fr`, `name_de`, `name_pt` columns. Display via `opTypeName(tp)` / `usageTypeName(tp)` helpers. Auto-translated via Edge Function on add/re-translate.

---

## 8. Critical Coding Rules

These rules exist because violations have caused production bugs. Follow them without exception.

### 1. Syntax check after every change
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);if(m){const js=m.map(s=>s.replace(/<\/?script>/g,'')).join('\n');require('vm').compileFunction(js,[],{});console.log('JS OK');}"
```

### 2. Guard pattern on all async write functions
Every async function that writes to DB must use:
```javascript
async function myFunction(){
  if(!_guardStart('myFunction')) return;
  try {
    // ... work
  } catch(err){ showToast('Error: '+esc(err.message)); console.error('myFunction:', err); }
  finally { _guardEnd('myFunction'); }
}
```

### 3. Timezone — NEVER use toISOString().slice(0,10)
Always use `todayStr()` for current date strings. UTC offset causes 1-day discrepancy between admin and venue views.
```javascript
// ❌ Wrong
const today = new Date().toISOString().slice(0,10);
// ✅ Correct
const today = todayStr();
```

### 4. No duplicate function names
Single-file means duplicate `function foo()` silently breaks login and other flows. Always grep before adding a new function:
```bash
grep -n "^function myFunctionName\|^async function myFunctionName" index.html
```

### 5. No global replace without context check
Never do a file-wide string replace without checking every occurrence in context. One replace operation at a time, verify before next.

### 6. XSS — always escape user data in innerHTML
Use `esc()` helper for any user-supplied data rendered into HTML templates:
```javascript
// ❌ Wrong
el.innerHTML = `<div>${venue.name}</div>`;
// ✅ Correct
el.innerHTML = `<div>${esc(venue.name)}</div>`;
```

### 7. Display vs storage for op/usage types
- `op.type` stores `name_en` (canonical English key)
- Display: `opTypeDisplay(op.type)` — translates to current language
- Never render `op.type` directly

### 8. Data window and limits
```javascript
const DATA_WINDOW_DAYS = 60;  // Initial load window
const DATA_LIMIT = 500;       // Max rows per query
```
Do not increase these without justification. For historical data, use on-demand date-range queries.

### 9. Calendar debounce
`_refreshCalendars()` uses `requestAnimationFrame` debounce. Do not call render functions directly in rapid succession — always go through `_refreshCalendars()`.

### 10. i18n completeness
Run validator before deploy. Never add a `data-i18n` key to HTML without adding translations to all 6 language blocks.

---

## 9. Architecture — Current & Target

### Current (single-file HTML)
```
index.html (9300+ lines)
├── <style> — all CSS
├── <body> — all HTML screens
└── <script> — all JS
    ├── i18n (6 languages)
    ├── State management (state object + ~45 global vars)
    ├── Supabase loaders
    ├── Auth (SHA256 + localStorage)
    ├── Render functions (Gantt, Calendar, Lists, Stats)
    ├── Photo upload/compression
    ├── Drag & drop
    └── PDF export
```

### Target architecture (migration planned)
```
pitchops/
├── index.html              # Shell only
├── vite.config.js
├── src/
│   ├── main.js             # Entry point
│   ├── state/
│   │   └── store.js        # Centralised state
│   ├── modules/
│   │   ├── pitch-operations/
│   │   ├── pitch-assessments/     # Planned
│   │   ├── pitch-performance/     # Planned
│   │   └── report-generator/      # Planned
│   ├── components/
│   │   ├── calendar/
│   │   ├── gantt/
│   │   ├── stats/
│   │   └── photos/
│   ├── i18n/
│   │   └── {en,pl,es,fr,de,pt}.js
│   ├── lib/
│   │   ├── supabase.js
│   │   ├── auth.js         # Supabase Auth (with Area Manager)
│   │   └── fifa-rating.js  # FIFA scoring engine
│   └── styles/
│       └── main.css
```

### Migration trigger
Migrate **before** building Pitch Assessments or Pitch Performance Tests modules. The current single-file cannot scale to absorb those modules without becoming unmaintainable.

### Auth migration
Move from SHA256/localStorage to **Supabase Auth** when implementing Area Manager. This enables proper per-user RLS policies.

---

## 10. Known Tech Debt

| Item | Priority | Notes |
|------|----------|-------|
| Single-file → Vite modules | P0 | Do before new modules |
| SHA256 auth → Supabase Auth | P0 | Do with Area Manager |
| ~45 global vars → module state | P0 | Resolved by migration |
| RLS `allow_all` → per-user policies | P1 | Needs Supabase Auth first |
| `opToDb/dbToOp` type validation | P2 | Low risk until external APIs |
| i18n in DB types (auto-translate) | ✅ Done | Edge Function `translate` |
| Data window + limits | ✅ Done | 60 days / 500 rows |
| Calendar debounce | ✅ Done | requestAnimationFrame |
| Photo size limit | ✅ Done | 5MB + canvas compression |

---

## 11. Deployment Flow

1. Edit `index.html` locally
2. Run syntax check (Section 8, Rule 1)
3. Run i18n validator: `node validate-i18n.js index.html`
4. If both pass → push to GitHub
5. GitHub Pages auto-deploys within ~60 seconds
6. Verify at `https://alfista20.github.io/PitchOps`

---

## 12. Key People

| Role | Person | Access |
|------|--------|--------|
| Master Admin / Product Owner | Kris Puzio | `kpuzio33@gmail.com`, `kris.puzio@fifa.org` |

---

## 13. Working Principles with Claude

- **Confirm before building** — for any significant feature, confirm understanding of scope before writing code
- **One change at a time** — make one logical change, verify syntax, then proceed
- **Never global replace** — always check context of every occurrence before replacing
- **Consistent across dashboards** — features must work in both admin and venue (token) views
- **Naming matters** — `+Add task` not `+Add operation`; `vcard-` prefix for venue stats; `state_usage` for venue, `state_admin_usage` for admin
- **Button colour coding** — purple gradient = usage; blue = task
- **Polish is primary language** — Kris communicates in Polish and English; both are fine
- **Ask before doing** — when uncertain about scope or approach, ask first
