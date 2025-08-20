# Phase Two Implementation Plan

## Overview
Phase Two transforms the manuscript analysis foundation from Phase One into an intelligent **Opening Lab** that evaluates **3–5** candidate openings through automated scoring, spoiler detection, and edit‑burden calculation. This phase directly supports the project’s singular goal: **selecting the optimal opening scene(s) for agent submission with ≥80% confidence while keeping edit burden ≤10%**.

Building on Phase One’s scene segmentation, anchoring system, and character extraction, Phase Two introduces the **reveal graph** infrastructure, **spoiler‑violation detection**, and **comparative analysis** capabilities that enable authors to make informed decisions about manuscript openings with minimal revision overhead.

## Objectives
1. **Build Reveal Graph Infrastructure** — Implement comprehensive reveal extraction and dependency tracking to map what readers know at each point in the manuscript.
2. **Create Opening Candidate Selection** — Develop a system to identify and compose 3–5 viable opening scenarios (single scenes, composites, or sequences).
3. **Implement Spoiler Detection Engine** — Calculate violations when scenes are reordered, identifying premature reveals and missing prerequisites.
4. **Design Context Gap Analysis** — Identify missing information readers need when starting at alternate openings.
5. **Calculate Edit Burden Metrics** — Quantify revision effort (word count, span changes, percentage) for each candidate.
6. **Generate Comparative Reports** — Produce side‑by‑side analysis with scores, heatmaps, and recommendations in Markdown/PDF.
7. **Integrate LLM Scoring** — Wire capability profiles (**STRUCTURE_LONGCTX**, **FAST_ITERATE**, **JUDGE_SCORER**) for hook strength and market appeal assessment.

## Technical Approach

### 1) Reveal Graph Construction
**File:** `src/features/manuscript/reveal-graph.ts` *(enhance existing)*
- Extend `extractReveals()` patterns beyond current “_X is Y_” format.
- Add temporal reveals, location changes, and relationship dynamics.
- Build dependency chains using scene ordering.
- Calculate transitive closure for full prerequisite sets.
- Store in an efficient graph structure with **O(1)** lookups for common queries.

---

### 2) Opening Candidate Generation
**File:** `src/features/manuscript/opening-candidates.ts` *(new)*
- Scan first 10 scenes for high hook scores (**> 0.6**).
- Identify natural entry points (new POV, time jump, location shift).
- Compose multi‑scene sequences (2–3 consecutive scenes).
- Create flashback composites (scene + micro‑flashback + continuation).
- Filter by minimum word count (**> 500**) and dialogue presence.

---

### 3) Spoiler Detection Implementation
**File:** `src/features/manuscript/spoiler-detector.ts` *(new)*

```typescript
export interface SpoilerViolation {
  revealId: string;
  mentionedIn: TextAnchor;   // Use Phase One anchoring
  shouldAppearIn: string;
  severity: 'critical' | 'moderate' | 'minor';
  fix: AnchoredEdit;
}
```

- For each candidate opening, traverse subsequent scenes.
- Check reveals against the prerequisite graph.
- Flag violations with anchored text spans.
- Calculate severity based on plot criticality.
- Generate fix suggestions (word replacements, deletions).

---

### 4) Context Gap Analysis
**File:** `src/features/manuscript/context-analyzer.ts` *(new)*
- Extract entity references (characters, locations, objects).
- Compare against established context from original opening.
- Identify undefined references when starting at candidate.
- Generate bridge‑paragraph suggestions for missing context.
- Calculate insertion points using Phase One anchoring.

---

### 5) Edit Burden Calculator
**File:** `src/features/manuscript/edit-burden.ts` *(new)*
- Count new words needed for context bridges.
- Count modified spans for spoiler fixes.
- Calculate percentage of opening text affected.
- Factor in priority levels (critical vs. optional).
- Generate consolidated patch data structures.

---

### 6) LLM Integration Layer
**File:** `src/features/llm/opening-scorer.ts` *(new)*
- Implement capability‑profile abstraction.
  - **STRUCTURE_LONGCTX**: Full‑manuscript structural analysis.
  - **FAST_ITERATE**: Hook scoring per candidate.
  - **JUDGE_SCORER**: Comparative market‑appeal ranking.
- Add **mock mode** using fixtures for offline development.
- Implement **prompt caching** for cost optimization.

---

### 7) Report Generation Enhancement
**File:** `src/features/manuscript/opening-report.ts` *(new)*
- Extend existing `reports.ts` with an `OpeningAnalysis` interface.
- Generate **comparison matrix** (candidates × metrics).
- Create ASCII/Unicode **spoiler heatmap** visualizations.
- Include **tension curves** (before/after edits).
- Export to **Markdown** with embedded recommendations.
- Add **PDF** generation via a Pandoc pipeline (fallback to Markdown if unavailable).

## Milestones & Deliverables

| Day | Milestone                 | Deliverables                                                            | Success Criteria |
|-----|---------------------------|-------------------------------------------------------------------------|------------------|
| 4   | Reveal Graph Complete     | Enhanced reveal extraction, dependency graph, prereq calculation        | Graph contains >50 reveals with accurate dependencies |
| 5   | Candidate Generation      | Opening selector, composite builder, filtering logic                    | Identifies 3–5 viable candidates from test manuscript |
| 6   | Spoiler Detection         | Violation scanner, severity classification, fix generation              | Detects **100% of critical** spoilers; generates anchored fixes |
| 6.5 | Context Analysis          | Gap identifier, bridge‑paragraph drafter                                | Identifies missing entities; drafts insertions **< 100 words** |
| 7   | Edit Burden & Reports     | Burden calculator, comparative report, heatmap visualization            | Report shows all candidates with metrics; burden **≤ 10%** |
| 7   | LLM Integration           | Scoring endpoints, mock mode, prompt templates                          | Hook scores align with manual assessment **±15%** |

## Dependencies & Risks

### Internal Dependencies
- **Phase One completion** ✅ — Anchoring system, scene segmentation, and character extraction must be stable.
- **Test manuscript** — Provide an 80–120k‑word manuscript at `data/manuscript.txt` for realistic testing.
- **Performance baseline** — Maintain current **< 2s** processing despite added complexity.

### External Dependencies
- **LLM API keys** — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` for scoring features.
- **Pandoc installation** — Required for PDF export (fallback to Markdown if unavailable).

### Major Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Reveal extraction accuracy **< 70%** | Poor spoiler detection | Implement pattern library; add manual review UI |
| LLM costs exceed budget | Feature disabled | Aggressive caching; **mock mode** default |
| Edit burden consistently **> 10%** | Unusable recommendations | Tune context insertion; allow manual overrides |
| Performance degrades **> 3s** | Poor UX | Profile bottlenecks; incremental processing |
| Complex reveal dependencies | Graph cycles, incorrect prereqs | Add cycle detection; limit dependency depth to **3** |

## Technical Debt Considerations
- Current reveal extraction uses basic regex patterns — consider NLP enhancement in **Phase 3**.
- Character extraction may miss nicknames/aliases — add **coreference resolution** later.
- No UI for manual candidate selection — **CLI‑only** for Phase Two; GUI in a future iteration.

## Validation Strategy
- Create a test suite with **known spoiler violations** for regression testing.
- Generate **synthetic manuscripts** with controlled reveal patterns.
- **A/B test** LLM scores against human beta readers (post‑Phase Two).
- Benchmark against **professional editor feedback** on opening selection.

## Phase Two Exit Criteria
- ✅ Opening Lab generates **3–5 scored candidates** from any manuscript.
- ✅ Spoiler violations detected with **> 90% accuracy** on test cases.
- ✅ Edit burden calculated and verified **≤ 10%** for a majority of candidates.
- ✅ Comparative report generated in **< 3 seconds** for **120k** words.
- ✅ LLM scoring integration functional (**or mock mode active**).
- ✅ All Phase One tests still passing (**no regressions**).
- ✅ Documentation updated with Opening Lab usage instructions.

> Upon completion, the system will provide authors with data‑driven opening recommendations backed by quantifiable metrics, enabling confident submission decisions within the target two‑week timeline.
