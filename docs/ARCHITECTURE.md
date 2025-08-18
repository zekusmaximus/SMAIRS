# Architecture Overview

## Purpose
Provide a lean, local-first system to evaluate and optimize a *single* manuscript opening with minimal edit burden and high decision confidence.

## Context Sources
- `PROJECT_VISION.md` (authoritative intent and phasing)
- `AGENT_STACK.md` (stack & non-negotiables; superseded where conflicts by vision)

## System Pillars
1. Scene-centric modeling (chapters => scenes => candidates)
2. Reveal Graph + Spoiler Detection
3. Opening Lab comparative analysis
4. Anchored Edits & Bridge Drafts (survivable references)
5. Patch Packs (grouped atomic changes)
6. Export Bundle (opening, synopsis, memo)

## High-Level Components
| Layer | Responsibility |
|-------|----------------|
| UI (React/Vite) | Visualization of candidates, heatmaps, patch packs |
| Editor (CodeMirror 6) | Large-document navigation, anchor selection |
| State (Zustand + React Query) | Local reactive stores & async orchestration |
| LLM Orchestrator | Whole-doc pass + targeted micro passes; queuing, fallback, caching |
| Search/Index (Tantivy) | Local full-text & metadata queries (scenes, reveals) |
| Persistence (SQLite + flat files) | Anchors, reveals, job ledger, settings |
| Import/Export (Pandoc + diff tooling) | Normalize input; produce patch packs & bundle |
| Anchoring Engine | Multi-tier resolution to preserve references post-edit |

## Data Flows (Planned)
1. Import manuscript (txt/md/docx → normalized plain text + YAML metadata) → Scene segmentation → Scene inventory persisted.
2. Whole-document LLM structural pass → Outline + hotspots + initial reveals.
3. Reveal graph consolidation (dependencies, first exposure, violations).
4. Candidate generation (select up to 5 scenes / composites) → Opening analyses (scores, spoiler heatmap, context gaps, edit burden metrics).
5. Micro-pass generation (anchored edits, bridge paragraphs) → Patch Packs.
6. Export pipeline builds submission bundle (opening pages, synopsis, rationale memo, diff artifacts).

## Anchoring Strategy
Four-tier resolution: structural ids → adjusted offsets → prefix/suffix fuzzy → unique substring search. Stores context + checksum for integrity. Goal: ≥90% anchor stability through revision cycles.

## LLM Strategy
- Single whole-doc structural pass (1M context) using Claude 3.5 Sonnet.
- Targeted passes for hotspots / edits with compressed synopsis context.
- Fallback to GPT-4 Turbo on provider failure.
- Mock mode for offline development.

## Performance Considerations
- Virtual scrolling & segmented loading (avoid loading entire DOM).
- Debounced indexing; lazy scene-based index hydration.
- Queue-based LLM calls (1–2 concurrent) with exponential backoff.

## Non-Negotiables
- No multi-manuscript support
- No external vector DB / RAG complexity
- Local-first privacy (only explicit LLM requests leave machine)
- Scenes are primary atomic units

## Phases & Deliverables
| Phase | Key Deliverables |
|-------|------------------|
| 1 Skeleton | Scene segmentation, reveal extraction prototype, inventory report |
| 2 Opening Lab | Candidate scoring, spoiler heatmaps, context gap detection, edit burden calc |
| 3 Patch Packs | Anchored edits, bridge paragraphs, diffs, tension curves |
| 4 Export & Validate | Applied revisions, continuity checks, export bundle |

## Future Extensions (Explicitly Out of Scope Unless Re-Prioritized)
- Multi-manuscript library
- Real-time collaborative editing
- Cloud synchronization

## Open Questions (To Refine Later)
- Heuristic vs LLM weighting for tension curve? (hybrid likely)
- Granularity of bridge paragraph generation batching
- Confidence scoring calibration methodology
