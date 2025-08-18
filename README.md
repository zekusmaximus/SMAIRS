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
| Phase | Days | Deliverable Summary |
|-------|------|---------------------|
| 1 Skeleton | 1–3 | Scene segmentation, reveal extraction prototype, inventory report |
| 2 Opening Lab | 4–7 | Candidate scoring, spoiler heatmaps, context gaps, edit burden |
| 3 Patch Packs | 8–11 | Anchored micro-edits, bridge drafts, tension curves, diffs |
| 4 Export & Validate | 12–14 | Applied revisions, continuity checks, submission bundle |

## Stack Summary (Authoritative per PROJECT_VISION.md overrides conflicts)
Desktop Shell: Tauri (Rust core + React/TypeScript front-end)
UI: React 18 + Vite 5 + TypeScript 5
Editor: CodeMirror 6 (virtual scrolling, large-doc performance)
State: Zustand (+ React Query for async orchestration)
Search Index: Tantivy (Rust) via Tauri commands
DB / Persistence: SQLite (tauri-plugin-sql) + flat text & YAML metadata
LLM Orchestration: Whole-document structural pass + targeted micro passes
LLM Providers: Primary Claude 3.5 Sonnet (1M ctx); Backup GPT-4 Turbo (PROJECT_VISION supersedes earlier Anthropic/Gemini spec). Fallback/mocking supported.
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

## Quickstart (Scaffold Only – functionality not yet implemented)
Prerequisites:
- Node 20 LTS (`.nvmrc`)
- pnpm ≥ 9 (or npm if preferred)
- Rust (stable toolchain via rustup)
- (Optional) Pandoc (export formats)

Install & Dev (after code exists):
```bash
corepack enable
pnpm install
pnpm dev            # Starts Vite + (later) Tauri dev
pnpm test           # Runs Vitest suite
pnpm tauri dev      # Tauri shell once src-tauri is implemented
```

Offline / Mock Mode (future): set `LLM_OFFLINE=1` in environment (never commit `.env`).

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

## Roadmap (Condensed)
- Phase 1: Segmentation & Reveal Graph CLI prototype
- Phase 2: Opening Lab scoring & reporting
- Phase 3: Patch Packs generation
- Phase 4: Export bundle + continuity verification

## License
MIT (see `LICENSE`).

## Status
Scaffold only. No runtime features implemented yet.

---
Contributions welcome—respect scope: single manuscript, opening optimization, minimal precise revisions.
