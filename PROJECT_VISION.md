# PROJECT VISION - Single Manuscript AI Revision System (v2.0)

## 🎯 SINGLE OVERRIDING GOAL

**Transform ONE professionally-edited manuscript into its optimal form for agent submission by using AI to identify the best opening (scene or composite) and generate all required revisions with minimal edit burden.**

This is a SINGLE-USE, BESPOKE application for ONE AUTHOR, ONE MANUSCRIPT, ONE SUBMISSION CYCLE.

---

## 📖 THE MANUSCRIPT

- **Status**: Professionally edited, well-written prose
- **Need**: Strategic opening selection for maximum market impact
- **Strategy**: Start in medias res with high-impact scene(s)
- **Challenge**: Maintaining narrative coherence with minimal revisions

---

## 🚀 CORE FUNCTIONALITY - THE OPENING LAB

### 1. Scene-Level Analysis (Not Chapter-Level)

**Purpose**: Find the best opening at the right granularity

**Implementation**:

```typescript
interface Scene {
  id: string;
  chapterId: string;
  text: string;
  summary: string;
  anchorHash: string; // First/last 12 chars for stable reference

  // Scoring (calibrated with exemplars)
  hookScore: number; // Based on rubric + examples
  tensionScore: number; // Conflict density + stakes
  clarityScore: number; // Understandable without context

  // Content tracking
  characters: string[];
  reveals: RevealRef[]; // What facts are exposed
  requires: string[]; // What reader must know first

  // Metadata
  beats: StoryBeat[];
  location?: string;
  timeRef?: string; // Absolute or relative
}
```

**Scene Segmentation**:

- Break chapters into scenes (rule-based + AI assist)
- Detect natural breaks: location changes, time jumps, POV shifts
- Each scene gets unique anchor hash for stable reference

### 2. Reveal Graph & Spoiler Detection

**Purpose**: Track what the reader knows when

**Implementation**:

```typescript
interface Reveal {
  id: string;
  description: string; // "Sarah is the mole"
  firstExposureSceneId: string; // Where first revealed
  preReqs: string[]; // Other reveals needed first
  type: 'plot' | 'character' | 'world' | 'backstory';
}

interface SpoilerViolation {
  revealId: string;
  mentionedIn: TextAnchor; // Quoted span + hash
  shouldAppearIn: string; // Scene where it's properly revealed
  severity: 'critical' | 'moderate' | 'minor';
  fix: AnchoredEdit;
}
```

**Spoiler Heatmap**: Visual/textual map showing violations when scene X opens

### 3. Opening Lab - Decision Support

**Purpose**: Compare up to 5 opening candidates side-by-side

**Candidates Can Be**:

- Single scene
- Composite (Scene 23a → micro-flashback → Scene 23b)
- Multi-scene sequence

**For Each Candidate, Calculate**:

```typescript
interface OpeningAnalysis {
  candidate: OpeningCandidate;

  // Scores (calibrated)
  hookStrength: number;
  clarityUnderColdStart: number;
  marketAppeal: number;

  // Problems
  spoilerViolations: SpoilerViolation[];
  missingContext: ContextGap[];

  // Solutions
  editBurden: {
    newWords: number;
    changedSpans: number;
    percentOfText: number;
  };
  requiredPatches: AnchoredEdit[];
  bridgeParagraphs: BridgeDraft[];

  // Visualization
  tensionCurve: number[]; // Before/after
}
```

### 4. Anchored Recommendations (Not Line Numbers)

**Purpose**: Recommendations that survive editing

**Every Edit References**:

```typescript
interface AnchoredEdit {
  anchor: TextAnchor; // Quoted text + hash
  sceneId: string;

  original: string; // "Sarah's voice, guilty and thin"
  suggested: string; // "Sarah's voice, low and thin"
  reason: string; // "Removes premature reveal of guilt"

  type: 'replace' | 'insert' | 'delete';
  priority: 'critical' | 'important' | 'optional';
}

interface TextAnchor {
  quotedSpan: string; // Actual text (15-30 chars)
  hash: string; // Stable identifier
  context: string; // Surrounding text for verification
}
```

### 5. Lightweight Retrieval (Not Full RAG)

**Purpose**: Precise lookups without complexity

**Implementation**:

- Local index of scenes, reveals, dependencies
- Quick search: "Where is X first mentioned?"
- Cross-reference validation
- No external services, no vector DB overhead

**Use Cases**:

- Find all mentions of a character
- Locate first reveal of plot point
- Verify timeline references
- Check for contradiction

---

## 🛠️ IMPLEMENTATION PLAN - LEAN & FOCUSED

### Phase 1: Skeleton (Days 1-3)

```bash
# Core functionality, no UI
- Scene segmentation from chapters
- Extract reveals, characters, timeline
- Build reveal graph
- Generate scene inventory report
```

**Deliverable**: Scene inventory with initial scores

### Phase 2: Opening Lab (Days 4-7)

```bash
# Decision support system
- Score potential openings (3-5 candidates)
- Generate spoiler heatmaps
- Calculate missing context
- Compute edit burden
- Export comparison report (Markdown/PDF)
```

**Deliverable**: Opening comparison report with recommendations

### Phase 3: Patch Packs (Days 8-11)

```bash
# Specific revision guidance
- Generate anchored micro-edits
- Draft bridge paragraphs
- Create side-by-side diffs
- Overlay tension curves
```

**Deliverable**: Detailed revision instructions with anchored edits

### Phase 4: Export & Validate (Days 12-14)

```bash
# Submission-ready output
- Apply selected revisions
- Run continuity checks
- Generate DOCX with/without Track Changes
- Create synopsis (1-2 pages)
- Write "Why this opening" memo
```

**Deliverable**: Agent submission bundle

---

## 📊 SUCCESS METRICS - OUTCOME FOCUSED

### Must-Have Metrics

1. **Opening decision confidence ≥ 80%** (you're certain it's the right choice)
2. **Zero spoiler violations** in final version
3. **Edit burden ≤ 10%** of opening pages
4. **Cold-reader retention**: 2 of 3 readers continue past page 5

### Nice-to-Have Metrics

5. **Continuity score**: 100% (no timeline/fact contradictions)
6. **Submission bundle complete** in under 2 weeks
7. **Version comparison clarity** (can see exactly what changed)

---

## 💡 CRITICAL DECISIONS

### What We're Building

✅ **Opening Lab** - Compare 3-5 scene-based openings  
✅ **Reveal Graph** - Track what reader knows when  
✅ **Spoiler Heatmap** - Visual violation detection  
✅ **Anchored Edits** - Survive text changes  
✅ **Bridge Paragraphs** - AI-drafted transitions  
✅ **Export Bundle** - DOCX + synopsis + memo

### What We're NOT Building

❌ Full manuscript reordering (just opening)  
❌ Complex UI (reports + exports are enough)  
❌ Real-time editing (batch revisions)  
❌ Multiple manuscripts  
❌ Publishing workflow beyond submission

### Technology Choices

- **AI**: Claude 3.5 Sonnet (primary), GPT-4 Turbo (backup)
- **Retrieval**: Local index, no external DB
- **Anchoring**: Quoted spans + hashes, not line numbers
- **Versions**: Diffs + patches, not just snapshots
- **Privacy**: Local-only processing, no external retention

---

## ⚡ EXAMPLE OUTPUT - ANCHORED RECOMMENDATION

```markdown
OPENING CANDIDATE: Scene 23a (Warehouse Raid)

SPOILER VIOLATIONS: 2 found

1. REVEAL S-014: "Sarah is the mole"
   FOUND IN: "Sarah's voice, guilty and thin" [Scene 23a, anchor d3fa...a9]
   FIX: Replace "guilty" with "low"
   REASON: Premature reveal of Sarah's betrayal (properly revealed Scene 47)

2. REVEAL S-007: "Virus is engineered"  
   FOUND IN: "a lab-born heat that licks" [Scene 23a, anchor 8b21...33]
   FIX: Replace "lab-born" with "unnatural"
   REASON: Reveals artificial origin too early

MISSING CONTEXT: 3 items

1. WHO IS MARCUS?
   INSERT AFTER: "Marcus checked his watch" [anchor c2e9...15]
   DRAFT: "Marcus, fifteen years of field ops etched in his movements"

2. RAID OBJECTIVE?
   INSERT AFTER: "We moved toward the door" [anchor a411...22]
   DRAFT: "The coolant keys had to be here—Jensen's last intel was never wrong"

3. WHERE/WHEN?
   INSERT AT: Opening of scene [anchor 0000...00]
   DRAFT: "Dockside. 03:12. Rain hammered the tin roof like accusations"

EDIT BURDEN: 7.3% of text (acceptable)
```

---

## 🚨 CORE PRINCIPLES

1. **Scenes are atoms**, not chapters
2. **Anchors are references**, not line numbers
3. **Reveals are tracked**, creating spoiler detection
4. **Edit burden is measured**, keeping changes minimal
5. **Cold-reader clarity** is the north star

---

## 📝 CURRENT STATUS

- [ ] Manuscript loaded and segmented into scenes
- [ ] Reveal graph built and validated
- [ ] Opening candidates identified (3-5 scenes)
- [ ] Spoiler heatmaps generated
- [ ] Edit burden calculated for each
- [ ] Opening selected with confidence
- [ ] Anchored edits generated
- [ ] Bridge paragraphs drafted
- [ ] Revisions applied
- [ ] Continuity validated
- [ ] Export bundle created
- [ ] Cold-reader test passed

---

## 🎯 NORTH STAR - OUTCOME

When complete, you can say:

> "The Opening Lab analyzed my manuscript at the scene level and showed me exactly how starting with Scene 23a would work—including a spoiler heatmap showing two reveals that needed fixing, three pieces of missing context to add, and the exact 7% edit burden. Every recommendation was anchored to quoted text that survived my edits. I applied the changes, validated continuity, and exported a submission bundle with the new opening, updated synopsis, and a one-page 'Why this opening' memo for agents."

**THAT'S THE DELIVERABLE. A SUBMISSION-READY OPENING WITH MINIMAL, PRECISE REVISIONS.**
