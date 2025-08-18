# Runbooks

Operational guides (scaffold – commands illustrative; implement later).

## 1. Environment Setup

```bash
# Enable package manager shims
corepack enable

# Install JS/TS deps (after code exists)
pnpm install

# Ensure Rust toolchain
rustup update

# (Optional) Pandoc for exports
pandoc -v || echo "Pandoc not installed – exports limited to txt/md"
```

Environment Variables (do not commit):

```
LLM_PRIMARY=claude
LLM_SECONDARY=gpt4
ANTHROPIC_API_KEY=... (if using Claude)
OPENAI_API_KEY=...     (for GPT-4 Turbo fallback)
LLM_OFFLINE=1          (optional mock mode)
```

## 2. Development Workflow

```bash
pnpm dev         # Vite dev server (future: concurrently with Tauri)
pnpm tauri dev   # Launch Tauri shell once backend scaffold exists
```

## 3. Testing

```bash
pnpm test        # Vitest (unit + component)
pnpm test:watch  # Watch mode
```

Planned coverage thresholds: critical path ≥ 90% lines / 95% branches (post MVP).

## 4. Building & Packaging

```bash
pnpm build       # Front-end bundle (Vite)
pnpm tauri build # Desktop binaries
```

## 5. Index Operations

Triggered automatically on manuscript import & save (debounced). Manual (future CLI):

```bash
pnpm run index:rebuild
```

## 6. LLM Operations

- Structure Pass: Single queued job; expects full normalized text + metadata
- Micro Passes: Spawned per hotspot sequentially (limited concurrency)
- Offline Mode: Provide deterministic fixtures for UI development

## 7. Data Layout (Local Only)

```
data/
  manuscript.txt        # Canonical text (normalized)
  manuscript.yml        # Scene/chapter metadata
  cache/                # LLM summaries, synopsis, prompt cache
out/
  reports/              # Opening comparison markdown / pdf
  patches/              # Patch packs (JSON + diff)
  exports/              # Final opening pages, synopsis, memo
```

## 8. Export Pipeline (Planned)

1. Apply selected Patch Pack to working text
2. Generate submission opening pages (DOCX/MD/PDF)
3. Generate synopsis (1–2 pages)
4. Generate rationale memo
5. Bundle artifacts under `out/exports/<timestamp>/`

## 9. Continuity / Validation (Planned)

- Spoiler violations count must reach zero
- Edit burden check (≤10%) enforced before export
- Anchor stability report generated

## 10. Troubleshooting

| Symptom                | Action                                                |
| ---------------------- | ----------------------------------------------------- |
| Index queries empty    | Rebuild index; check Tantivy schema mismatch          |
| Anchors drifting       | Inspect checksum mismatches; re-resolve tier strategy |
| LLM timeout            | Retry with exponential backoff; fallback provider     |
| Export missing formats | Verify Pandoc installed and accessible in PATH        |

## 11. Future CI (Not Implemented Yet)

- Lint & Type Check (`tsc --noEmit`)
- Test (`vitest run`)
- Size / Bundle guard
- Basic performance smoke (open large fixture)
