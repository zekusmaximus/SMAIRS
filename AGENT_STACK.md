Here’s a single drop-in file you can add to your repo (I recommend `AGENT_STACK.md` at the root). It’s written for AI coding agents: concise, prescriptive, and fully pinned where it matters.

---

# AGENT\_STACK.md

```yaml
name: Manuscript Revision App Stack Manifest
goal: "Build a local-first desktop app that edits and analyzes 80k–120k word novels with whole-manuscript AI."
primary_stack:
  app_shell: "Tauri (>=1.5)"
  ui: "React 18 + TypeScript 5 + Vite 5"
  editor: "CodeMirror 6"
  state: "Zustand"
  search_index: "Tantivy (Rust) via Tauri command"
  db: "SQLite (tauri-plugin-sql)"
  packaging: "Tauri bundler"
  tests: "Vitest + @testing-library/react"
os_targets: ["macOS (universal)", "Windows x64", "Linux x64"]
privacy_model: "Local-first: docs, index, and caches stored locally; outbound only for explicit LLM calls."
llm:
  primary: { provider: "Anthropic", model: "Claude Sonnet 4 (1M ctx)" }
  fallback: { provider: "Google", model: "Gemini 2.5 Pro (1M ctx)" }
  strategy:
    - "Whole-manuscript structural pass (1 call) + targeted chunk calls for line edits."
    - "Use prompt caching / reuse static system preamble; queue requests; exponential backoff."
  env:
    - "ANTHROPIC_API_KEY"
    - "GOOGLE_API_KEY"
    - "LLM_PRIMARY=anthropic"
    - "LLM_SECONDARY=google"
performance_budgets:
  cold_start_s: 4
  idle_ram_mb: 160
  open_120k_word_ms: 800
  search_latency_ms_p95: 120
  scroll_jank: "none at 60fps with virtual scrolling"
risks_and_fallbacks:
  - { risk: "LLM unavailable", fallback: "Return mock analysis; keep UI usable" }
  - { risk: "Indexing slow", fallback: "Defer index build; lazy per-chapter" }
  - { risk: "DOCX track-changes hard", fallback: "Export clean DOCX + HTML diff pack; Pandoc for formats" }
```

---

## 1) Non-Negotiables (agents: do not change)

* **Desktop shell:** Tauri (Rust core + JS/TS front-end). No Electron unless explicitly asked.
* **Editor:** CodeMirror 6 with virtual scrolling; must remain responsive on 120k+ words.
* **Local-first:** All documents and indices live on disk; no cloud sync by default.
* **LLM flow:** Prefer **single whole-document pass** for structure, then **targeted passes** for micro-edits.
* **Search:** Native local index (Rust **Tantivy**). No external search services.
* **State:** **Zustand**; avoid Redux/RTK for this project.
* **Testing:** **Vitest** for unit/UI; no Jest.

---

## 2) Versions & Tooling

* **Node:** 20 LTS
* **pnpm:** 9.x (use if present; otherwise npm ok)
* **Rust:** stable (rustup default)
* **Tauri:** `^1.5` (plus official plugins below)
* **React:** `^18.2` • **TypeScript:** `^5.5` • **Vite:** `^5` • **Vitest:** `^1`

**NPM packages (minimum):**

* `react`, `react-dom`, `zustand`, `@tanstack/react-query` (for async LLM jobs & caching)
* `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/search`
* `diff-match-patch` (text diffs for previews)
* `zod` (runtime validation)
* `immer` (safe immutable updates where needed)

**Rust crates (minimum):**

* `tauri`, `tauri-plugin-log`, `tauri-plugin-dialog`, `tauri-plugin-updater`
* `tauri-plugin-sql` (SQLite)
* `tantivy` (full-text search)
* `serde`, `serde_json`, `anyhow`, `thiserror`
* `similar` or `difference` (diffs), `strsim` (fuzzy matching)

**External CLI (optional but recommended):**

* **Pandoc** (multi-format export; use via Tauri `shell`)

---

## 3) Project Layout (expected)

```
/src
  /app
    App.tsx
    routes.tsx
  /editor
    Editor.tsx              // CodeMirror 6 wrapper with virtual scrolling
    cmExtensions.ts         // search, line wrap, syntax highlight basics
  /features
    manuscript/
      useManuscriptStore.ts // Zustand (document, selection, cursor map)
      importer.ts           // txt/md/docx->txt via Pandoc; normalize endings
      exporter.ts           // txt/md/docx/html/pdf via Pandoc; diff pack
      anchoring.ts          // robust text anchoring (see spec below)
    search/
      searchApi.ts          // invoke Tauri command: index/query
      highlighter.ts
    llm/
      queue.ts              // rate limit, exponential backoff, retries
      prompts.ts            // static system preamble, reusable blocks
      providers/
        anthropic.ts        // fetch wrapper; stream support
        gemini.ts
      orchestrator.ts       // whole-doc pass + targeted passes
  /ui
    components/*            // buttons, panels, splitters
    panes/*
  /lib
    fs.ts                   // open/save via Tauri
    log.ts
    env.ts                  // loads and validates env (zod)
  /tests
/src-tauri
  /src
    main.rs                 // commands: index_build, index_query, doc_ops
    search.rs               // tantivy schema & ops
    db.rs                   // sqlite helpers
    fs.rs                   // safe file ops
  tauri.conf.json
```

---

## 4) LLM Integration (agents: implement exactly)

**Approach**

1. **Whole-Document Structural Pass (1M ctx):**

   * Inputs: full normalized manuscript (plain text), metadata (chapter map), constraints (style guardrails).
   * Outputs: outline with plot dependencies, character arcs, scene-order risks, “hotspots” map (byte/char ranges).
2. **Targeted Micro-Passes:**

   * For each hotspot, send a **focused slice** (up to a few thousand words) + global synopsis (compressed) for line-level edits.
3. **Cost Controls:**

   * Reuse a **static system prompt** and **project synopsis** across calls.
   * Maintain a local **prompt cache id** (hash of preamble + synopsis) to hint the agent to reuse content.
   * Queue all requests; limit concurrency to 1–2.

**Provider adapters**

* `llm/providers/anthropic.ts` and `llm/providers/gemini.ts` expose:

  ```ts
  export type LLMRequest = { system: string; user: string; stream?: boolean; };
  export type LLMResponse = AsyncIterable<string> | { text: string };
  export async function callLLM(req: LLMRequest): Promise<LLMResponse>;
  ```
* `orchestrator.ts` chooses primary (Anthropic) and falls back to Gemini on error or quota.

**Env required**

* `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `LLM_PRIMARY`, `LLM_SECONDARY`

> Note: Verify provider pricing/config in deployment; this file focuses on structure and integration behavior.

---

## 5) Text Anchoring (robust selection preservation)

Implement **four-tier fallback** to keep annotations/LLM hotspots stable across edits:

1. **Range-based structural match:** exact chapter/scene ids + intra-scene offsets.
2. **Position-based offsets:** original char offsets adjusted by measured insertions/deletions nearby.
3. **Context fuzzy (prefix/suffix):** match using a 32–64 char window on both sides with `strsim`/`similar`.
4. **Content-only fuzzy search:** search the longest unique substring (≥32 chars) within the new doc; pick best score.

Store anchors as:

```ts
type Anchor = {
  id: string;               // uuid
  chapterId: string;
  start: number;            // char offset
  end: number;              // char offset
  contextPrefix: string;    // <=64 chars
  contextSuffix: string;    // <=64 chars
  checksum: string;         // sha256 of slice
  lastResolvedAt: string;   // ISO
};
```

---

## 6) Search & Indexing (local only)

* **Tantivy schema:** fields = `chapter` (string), `scene` (string), `text` (text), `chars` (u64).
* Build index on import and incrementally on save (debounce 1s).
* Expose Tauri commands:

  * `index_build(path: String) -> Result<(), Error>`
  * `index_query(q: String, limit: u32) -> Result<Vec<Hit>, Error>`

---

## 7) Data & Storage

* **Content:** Plain text per manuscript (`.txt`) for reliability in version control.
* **Metadata:** YAML (`manuscript.yml`) for chapter/scene table, POV, notes.
* **SQLite:** relationships and quick lookups (anchors, hotspots, LLM job ledger, index pointers).
* **Exports:** DOCX/MD/HTML/PDF via **Pandoc**; for “track changes,” ship HTML diff pack + instructions (docx redline is a stretch goal).

---

## 8) Performance Patterns

* **Segmented load:** Maintain in-memory only the visible window ± prefetch buffer.
* **Virtual scrolling:** CodeMirror extensions configured for large docs.
* **LRU cache:** 64KB chunks for editing ops.
* **Background workers:** run LLM jobs & indexing off the UI thread.
* **No jank:** keep 60fps during scroll; yield on long tasks.

---

## 9) Minimal Feature Set (Week-2 deliverable)

* Import `.txt/.md/.docx` (Pandoc), normalize newlines.
* Editor with search, replace, jump-to-chapter, and selection-to-anchor.
* Local search (Tantivy) with hit highlighting.
* **LLM “Structure Pass”** button → outline + hotspot markers.
* **LLM “Improve Selection”** for targeted spans.
* Export `.docx/.md/.html/.pdf`.
* Basic autosave + recovery.

---

## 10) Risk Mitigation (implement all)

* Provide **mock LLM** mode (env flag `LLM_OFFLINE=1`) returning deterministic fixtures.
* If Pandoc missing, **degrade** to `.txt/.md` only and show a one-click help link.
* If index build fails, **disable** search gracefully and log.

---

## 11) Acceptance Tests (agents must add)

* Open 120k-word file < 800ms on second open (warm cache).
* Scroll from top→bottom with no frame drops on a typical laptop.
* Search “character name” returns results < 120ms p95.
* Structure pass returns hotspots with valid anchors; edits preserve ≥90% anchors.
* Export all four formats from a 120k word manuscript without crash.

---

## 12) Environment Setup (commands)

**JS/TS**

```bash
corepack enable
pnpm i
pnpm dev
pnpm test
```

**Rust/Tauri**

```bash
rustup update
pnpm tauri dev
pnpm tauri build
```

**Optional**

```bash
# Pandoc presence check (agents: document if not found)
pandoc -v
```

---

## 13) Guardrails for Agents

* Do **not** introduce Electron, Redux, or server backends.
* Keep all document content **local** by default.
* Any change to LLM provider/model must preserve 1M-context whole-doc capability.
* Prioritize responsiveness over features; never block the UI for LLM calls or indexing.

---

**End of file.**
