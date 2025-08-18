# Data Contracts & Invariants

All interfaces are illustrative TypeScript shapes (final code may refine). Invariants listed beneath related entities.

```ts
// Core Scene Entity
export interface Scene {
  id: string;
  chapterId: string;
  text: string; // Plain text body
  summary: string; // LLM or heuristic summary
  anchorHash: string; // Stable hash (e.g., first+last N chars hashed)
  hookScore?: number;
  tensionScore?: number;
  clarityScore?: number;
  characters: string[];
  reveals: RevealRef[]; // IDs + role
  requires: string[]; // Reveal IDs required for clarity
  beats: StoryBeat[];
  location?: string;
  timeRef?: string;
}

export interface RevealRef {
  id: string;
  role?: string;
}
export interface StoryBeat {
  tag: string;
  offset: number;
  note?: string;
}

// Reveal Graph
export interface Reveal {
  id: string;
  description: string; // e.g. "Sarah is the mole"
  firstExposureSceneId: string; // Scene where canonically revealed
  preReqs: string[]; // Ordered dependencies
  type: 'plot' | 'character' | 'world' | 'backstory';
}

export interface SpoilerViolation {
  revealId: string;
  mentionedIn: TextAnchor; // Where leak occurred
  shouldAppearIn: string; // Intended reveal scene
  severity: 'critical' | 'moderate' | 'minor';
  fix: AnchoredEdit; // Proposed adjustment
}

// Anchoring
export interface TextAnchor {
  quotedSpan: string; // 15–30 chars
  hash: string; // Stable identifier (hash of normalized span + context)
  context: string; // Surrounding text window
}

export interface Anchor {
  // Internal richer anchor for engine
  id: string; // UUID
  chapterId: string;
  start: number; // char offset
  end: number; // char offset
  contextPrefix: string; // ≤64 chars
  contextSuffix: string; // ≤64 chars
  checksum: string; // sha256 of slice
  lastResolvedAt: string; // ISO timestamp
}

// Edits & Patch Packs
export interface AnchoredEdit {
  anchor: TextAnchor;
  sceneId: string;
  original: string; // Original snippet
  suggested: string; // Replacement / insertion
  reason: string; // Justification
  type: 'replace' | 'insert' | 'delete';
  priority: 'critical' | 'important' | 'optional';
}

export interface BridgeDraft {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  text: string; // Draft bridging paragraph(s)
  rationale: string; // Why needed (context gap / continuity)
}

export interface PatchPack {
  id: string;
  candidateId: string; // Opening candidate context
  edits: AnchoredEdit[];
  bridges: BridgeDraft[];
  tensionCurveBefore?: number[];
  tensionCurveAfter?: number[];
  editBurden: EditBurden;
}

export interface EditBurden {
  newWords: number;
  changedSpans: number;
  percentOfText: number; // (changed / opening length) * 100
}

// Opening Analysis
export interface OpeningCandidate {
  id: string;
  scenes: string[]; // Ordered scene IDs (allow composites)
  label?: string; // Human-readable label
  description?: string; // Rationale
}

export interface OpeningAnalysis {
  candidate: OpeningCandidate;
  hookStrength: number; // Calibrated score
  clarityUnderColdStart: number; // Cold-reader comprehension
  marketAppeal: number; // Market resonance proxy
  spoilerViolations: SpoilerViolation[];
  missingContext: ContextGap[];
  editBurden: EditBurden;
  requiredPatches: AnchoredEdit[];
  bridgeParagraphs: BridgeDraft[];
  tensionCurve: number[]; // Quantized intensity values
}

export interface ContextGap {
  id: string;
  description: string; // What the reader lacks
  insertAfter?: TextAnchor; // Placement anchor
  draft?: string; // Proposed insertion (bridge)
}

// LLM Request/Response (abstract)
export interface LLMRequest {
  system: string;
  user: string;
  stream?: boolean;
}
export type LLMResponse = AsyncIterable<string> | { text: string };

// Job Ledger (simplified)
export interface LLMJob {
  id: string;
  type: 'structure-pass' | 'micro-pass' | 'bridge-draft';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}
```

## Invariants

- Scenes are indivisible atoms for analysis; composites reference original IDs, not copies.
- Reveals have exactly one canonical `firstExposureSceneId`.
- No spoiler violation may exist where `mentionedIn` offset ≥ intended reveal after finalization.
- Anchor resolution strives for ≥90% stability through typical revision cycles.
- Edit burden target ≤10% of opening text.
- Quoted spans in anchors are stored verbatim (no normalization beyond newline standardization) to maximize match fidelity.

## Derived Metrics

- HookStrength / TensionCurve calibration TBD (document methodology later).
- Confidence score (not yet formalized) will synthesize clarity + spoiler cleanliness + burden.

## Open Items

- Final hashing strategy (sha256 vs truncated) balancing collision risk & readability.
- Tension curve sampling interval (paragraph vs beat).
