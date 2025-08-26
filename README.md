# Single Manuscript AI Revision System (SMAIRS)

> Purpose: A bespoke, single-use "Opening Lab" to analyze ONE professionally-edited manuscript (80k–120k words), select the optimal opening (scene or composite), generate minimal anchored revisions, and export a submission-ready bundle (opening pages + synopsis + rationale memo) within a two-week window.

## Why This Exists

Traditional revision tools treat chapters as atoms and lose reference stability after edits. SMAIRS focuses on scenes, reveal sequencing, spoiler avoidance, anchored micro-edits, and quantified edit burden—providing decision confidence while preserving the author’s voice.

## High-Level Goals

1. Scenes as atoms (granular analysis & recomposition)
2. Reveal Graph (what the reader knows when)
3. Spoiler Heatmap (violations if an alternate opening chosen)
4. Opening Lab (compare 3–5 candidates: scores, violations, burden)
5. Anchored Edits & Bridge Paragraphs (robust, survivable references)
6. Patch Packs (grouped micro-edits + diffs)
7. Export Bundle (opening pages, synopsis, memo)

## Delivery Phases (Target ≈14 days)

| Phase               | Days  | Deliverable Summary                                               |
| ------------------- | ----- | ----------------------------------------------------------------- |
| 1 Skeleton          | 1–3   | Scene segmentation, reveal extraction prototype, inventory report |
| 2 Opening Lab       | 4–7   | Candidate scoring, spoiler heatmaps, context gaps, edit burden    |
| 3 Patch Packs       | 8–11  | Anchored micro-edits, bridge drafts, tension curves, diffs        |
| 4 Export & Validate | 12–14 | Applied revisions, continuity checks, submission bundle           |

## Stack Summary (Authoritative per PROJECT_VISION.md overrides conflicts)

Desktop Shell: Tauri (Rust core + React/TypeScript front-end)
UI: React 18 + Vite 5 + TypeScript 5
Editor: CodeMirror 6 (virtual scrolling, large-doc performance)
State: Zustand (+ React Query for async orchestration)
Search Index: Tantivy (Rust) via Tauri commands
DB / Persistence: SQLite (tauri-plugin-sql) + flat text & YAML metadata
LLM Orchestration: Whole-document structural pass + targeted micro passes
LLM Capability Profiles (indirection layer):
	- STRUCTURE_LONGCTX → default anthropic:claude-4-sonnet (1M ctx beta gated)
	- FAST_ITERATE      → default openai:gpt-5-mini
	- JUDGE_SCORER      → default google:gemini-2.5-pro
Profiles are the contract; concrete models are overrideable via env.
Testing: Vitest + @testing-library/react
Packaging: Tauri bundler
Exports: Pandoc-driven (DOCX / MD / HTML / PDF) + diff/patch packs
Privacy Model: Local-first (manuscript, indices, caches all on disk; outbound only for explicit LLM calls)

## Non-Negotiables

- Local-first storage; no cloud sync
- Scenes > chapters; anchors not line numbers
- Robust anchor resolution (multi-tier fuzzy strategy)
- Performance budgets (cold start, indexing latency, scroll smoothness)
- Mock / offline LLM mode (deterministic fixtures)

## Repository Structure

```
README.md                // You are here
AGENT_STACK.md           // Prescriptive stack manifest (historical source)
PROJECT_VISION.md        // Vision + phase deliverables (authoritative intent)
package.json             // JS/TS workspace scaffold
.nvmrc                   // Node 20 LTS pin
src/                     // Front-end (React/TS + feature folders) – empty scaffold
src-tauri/               // (Placeholder) Rust Tauri core (commands, indexing)
docs/                    // Architecture, contracts, runbooks
tests/                   // Test strategy + future unit/integration tests
data/                    // Manuscript source (txt), metadata (YAML) – not committed
out/                     // Generated reports, patch packs, exports – gitignored
.editorconfig            // Consistent formatting
.gitattributes           // LF normalization & linguist hints
.gitignore               // Comprehensive ignores (Node, Rust, OS, tooling)
CONTRIBUTING.md          // Contribution workflow & DoR/DoD
CODE_OF_CONDUCT.md       // Community standards
SECURITY.md              // Vulnerability reporting
LICENSE                  // MIT
```

### Key Folders

- `src/` (future) feature-based modules: manuscript, search, llm, editor, ui, lib
- `src-tauri/` Rust commands: index_build, index_query, file ops, SQLite helpers
- `docs/` authoritative design & operational references
- `tests/` Vitest config, strategy, coverage thresholds once code lands
- `data/` (local only) manuscript.txt, manuscript.yml, caches/
- `out/` generated artifacts (comparison reports, patch packs, exports)

## Core Data Concepts (See `docs/CONTRACTS.md` for full interfaces)

Scenes, Reveals, SpoilerViolations, OpeningCandidates, OpeningAnalyses, AnchoredEdits, TextAnchors, BridgeDrafts, PatchPacks.

## LLM Flow (Planned)

1. Whole-manuscript structural analysis (scene inventory, hotspot detection)
2. Candidate opening synthesis & reveal impact scoring
3. Targeted micro-passes for hotspot edits & bridge paragraphs
4. Patch pack assembly (anchored modifications + diffs)

Caching & Cost: Reusable static system prompt + compressed global synopsis hash; serialized queue (1–2 concurrent) with exponential backoff.

## Performance Budgets (Targets)

- Cold start ≤ 4s
- Open 120k-word manuscript (warm) ≤ 800ms
- Search latency p95 ≤ 120ms
- Smooth 60fps scrolling (virtual windowing)
- Anchor preservation ≥ 90% after edits

## Models & Environment Overrides

Capability profiles decouple the product vision from concrete model IDs. Defaults (Aug 2025 – may change without README rewrite):

```
STRUCTURE_LONGCTX = anthropic:claude-4-sonnet
FAST_ITERATE      = openai:gpt-5-mini
JUDGE_SCORER      = google:gemini-2.5-pro
```

Override via environment variables in `.env` (copy from example):

```
LLM_PROFILE__STRUCTURE=anthropic:claude-4-sonnet
LLM_PROFILE__FAST=openai:gpt-5-mini
LLM_PROFILE__JUDGE=google:gemini-2.5-pro
LLM_LONGCTX_ENABLE=true   # allow >200k / 1M ctx structural pass
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_API_KEY=...
LLM_OFFLINE=1             # mock mode
```

Cost / limits snapshot (verify before heavy use):
- Claude Sonnet 4: ~$3/Mtok in, $15/Mtok out; 1M ctx beta (higher tier >200k).
- GPT-5 mini: low-latency, lower-cost tier (see OpenAI pricing page).
- Gemini 2.5 Pro: reasoning / judge use (see Google pricing page).

Usage accounting will normalize token units across providers where feasible.

## Quickstart

The application is in active development with substantial functionality implemented. You can analyze manuscripts via CLI or explore the UI.

Prerequisites:

- Node 20 LTS (see `.nvmrc`)
- npm 10 (ships with Node 20+; ensure up to date via `npm i -g npm@latest` if needed)
- Rust (stable) + toolchain components `cargo`, `rustc`
- (Optional) Global Tauri CLI or add `@tauri-apps/cli` as a dev dependency
- (Optional) Pandoc for export functionality

Environment Setup: copy `.env.example` → `.env` (do NOT commit) and adjust for LLM providers.

Install & Run:

```bash
npm ci            # Install deps (clean, uses package-lock.json)
npm run typecheck # TS strict pass
npm run lint      # ESLint
npm run test -- --run # Vitest + Testing Library
npm run dev       # Vite dev server (http://localhost:5173 by default)
npm run tauri:dev # Launch desktop shell (requires Tauri CLI)
```

## CLI Analysis Tools

Analyze a manuscript with the Opening Lab:

```bash
# Basic scene inventory
npm run cli -- data/manuscript.txt out/scene-inventory.md

# Full opening analysis (mock LLM mode)
LLM_OFFLINE=1 npm run analyze:opening -- data/manuscript.txt out/opening-analysis

# With real LLM integration
USE_REAL_LLM=true npm run analyze:opening -- data/manuscript.txt out/opening-analysis
```

Assumptions / Notes:

- `npm run tauri:dev` needs a Tauri CLI in PATH (install globally: `cargo install tauri-cli@2` OR add `@tauri-apps/cli` as a dev dependency).
- CLI tools are fully functional; UI is in development.
- `LLM_OFFLINE=1` enables mock mode for development without API keys.
- Place your manuscript at `data/manuscript.txt` for analysis.

## Project Structure (Current Scaffold)

```
.
├─ index.html                # Vite entry
├─ package.json              # Scripts & deps (strict TS, lint, test, tauri)
├─ tsconfig.json             # App TS config (strict)
├─ tsconfig.node.json        # Tooling TS config
├─ vite.config.ts            # Vite + React plugin + @ alias
├─ vitest.config.ts          # jsdom, coverage reporters
├─ eslint.config.mjs         # Flat ESLint config
├─ .prettierrc               # Prettier formatting rules
├─ src/                      # React source (App entry, styles, tests)
├─ src-tauri/                # Tauri v2 Rust shell (no commands yet)
├─ tests/                    # Vitest setup (jest-dom)
├─ docs/                     # ARCHITECTURE / CONTRACTS / RUNBOOKS
├─ .github/workflows/ci.yml  # CI: typecheck, lint, test, soft audits
└─ .env.example              # Example env (LLM_OFFLINE, DEBUG)
```

## Contributing & PR Checks

Core scripts enforced in CI:
| Command | Purpose |
|---------|---------|
| `npm run typecheck` | Strict TypeScript validation |
| `npm run lint` | ESLint (flat config) |
| `npm test -- --run` | Vitest unit/component tests |
| `npm run format` | Prettier write (manual) |

PR Expectations (see `CONTRIBUTING.md` for full workflow):

- Keep changes focused; add/update tests for behavior changes.
- No committing real manuscript data or secrets; use `data/` locally only.
- Add docs links instead of duplicating large explanations in the README.

Reference Docs:

- Architecture: `docs/ARCHITECTURE.md`
- Data Contracts: `docs/CONTRACTS.md`
- Runbooks: `docs/RUNBOOKS.md`

## Contribution Model

Branch Naming: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`
Default Branch: `main`
Working Branch Flow:

1. Fork or branch from `main`
2. Keep patches atomic & focused
3. Add/update tests & docs for behavior changes
4. PR template (to be added) enforces: linked issue, summary, validation notes

Definition of Ready (DoR): Problem stated, constraints clear, acceptance tests drafted.
Definition of Done (DoD): Code + tests passing (≥95% critical-path coverage later), docs updated, performance budgets unaffected, no console warnings, anchors & invariants preserved.

Required PR Checks (future CI): type check, lint, unit tests, format, size guard, (later) performance smoke.

## Acceptance Test Targets (Initial High-Level)

- Warm open 120k-word file < 800ms
- Search character name p95 < 120ms
- Structure pass returns hotspots + valid anchors
- Edits preserve ≥ 90% anchors
- Export four formats without crash

## Security & Privacy

- No manuscript content committed; add to `data/` locally only
- Never commit API keys; use environment variables / OS keychain
- All LLM calls explicit & auditable

## Documentation Index

- Architecture: `docs/ARCHITECTURE.md`
- Data Contracts: `docs/CONTRACTS.md`
- Runbooks (env, build, tests, export): `docs/RUNBOOKS.md`

### Quick Doc Links

[Architecture](docs/ARCHITECTURE.md) · [Contracts](docs/CONTRACTS.md) · [Runbooks](docs/RUNBOOKS.md)

## Roadmap (Condensed)

- Phase 1: Segmentation & Reveal Graph CLI prototype
- Phase 2: Opening Lab scoring & reporting
- Phase 3: Patch Packs generation
- Phase 4: Export bundle + continuity verification

## License

MIT (see `LICENSE`).

## Status

**Phase 2 Implementation (Opening Lab) - IN PROGRESS**

### ✅ Completed Features
- **Scene Analysis Pipeline**: Complete manuscript segmentation, character extraction, reveal mapping
- **Reveal Graph**: Dependency tracking and spoiler detection infrastructure
- **Opening Candidate Generation**: Automated identification of 3-5 viable opening scenarios
- **LLM Integration**: Multi-provider support with capability profiles (STRUCTURE_LONGCTX, FAST_ITERATE, JUDGE_SCORER)
- **CLI Tools**: Scene inventory analysis, opening candidate evaluation, comprehensive reporting
- **Performance**: Sub-2-second processing for 120k-word manuscripts
- **Caching System**: Persistent analysis results with delta tracking
- **Export Templates**: Pandoc-based export system for DOCX, Markdown, and PDF

### 🚧 In Progress
- **Opening Lab UI**: React-based interface for candidate comparison and analysis
- **Spoiler Heatmaps**: Visual violation detection and context gap analysis
- **Edit Burden Calculator**: Quantified revision effort assessment
- **Bridge Paragraph Generation**: AI-drafted transitions for missing context

### 📋 Planned
- **Patch Pack Generation**: Anchored micro-edits with side-by-side diffs
- **Full Export Bundle**: DOCX with Track Changes, synopsis, and agent memo
- **Continuity Validation**: Automated fact-checking and timeline verification

---

Contributions welcome—respect scope: single manuscript, opening optimization, minimal precise revisions.
