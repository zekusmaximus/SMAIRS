// Opening candidate generation heuristics
// Phase 1 lightweight rule engine (no ML) – deterministic & inexpensive.

import type { Scene } from "./types.js";
import { analyzeScenes, extractCharacters } from "./analyzer.js";

export interface OpeningCandidate {
  id: string; // "single:ch01_s01" or "composite:ch02_s01-s02"
  type: 'single' | 'composite' | 'sequence';
  scenes: string[]; // scene IDs involved
  startOffset: number;
  endOffset: number; // exclusive
  totalWords: number;

  // Rule-based scores (0-1)
  hookScore: number; // aggregated from analyzer hook scores
  actionDensity: number; // verb-ish action tokens per 1000 chars (capped 1)
  mysteryQuotient: number; // questions / sentences
  characterIntros: number; // new characters introduced in candidate span
  dialogueRatio: number; // weighted by scene length

  // Optional pattern tag (for debugging / UI labeling)
  pattern?: string;
}

// --- Scoring helpers ------------------------------------------------------

const ACTION_VERBS = /\b(ran|run|jumped|leaped|grabbed|shot|kicked|threw|smashed|burst|fled|struck|charged|slammed|fired|stabbed|chased|swung|dived|dove|lunged)\b/gi;

export function calculateActionDensity(text: string): number {
  if (!text) return 0;
  const matches = text.match(ACTION_VERBS) || [];
  return Math.min(matches.length / (Math.max(text.length, 1) / 1000), 1);
}

export function calculateMysteryQuotient(text: string): number {
  if (!text) return 0;
  const questions = text.match(/\?/g) || [];
  const sentences = text.match(/[.!?]+/g) || [];
  return sentences.length > 0 ? Math.min(questions.length / sentences.length, 1) : 0;
}

function countCharacterIntrosForScenes(scenes: Scene[], priorGlobal: Set<string>): number {
  let count = 0;
  const seen = new Set(priorGlobal);
  for (const s of scenes) {
    const chars = extractCharacters(s);
    for (const c of chars) {
      if (!seen.has(c)) {
        count++;
        seen.add(c);
      }
    }
  }
  return count;
}

// --- Composite utilities --------------------------------------------------

function aggregateText(scenes: Scene[]): string {
  return scenes.map(s => s.text).join('\n');
}

function aggregateDialogueRatio(scenes: Scene[]): number {
  const total = scenes.reduce((a, s) => a + s.wordCount, 0) || 1;
  return scenes.reduce((a, s) => a + s.dialogueRatio * s.wordCount, 0) / total;
}

function createCandidate(kind: OpeningCandidate['type'], pattern: string|undefined, scenes: Scene[], hookScores: Map<string, number>, priorChars: Set<string>): OpeningCandidate {
  const ids = scenes.map(s => s.id);
  const startOffset = scenes[0]!.startOffset; // definite
  const endOffset = scenes[scenes.length - 1]!.endOffset; // definite
  const totalWords = scenes.reduce((a, s) => a + s.wordCount, 0);
  const hookScore = Number((scenes.reduce((a, s) => a + (hookScores.get(s.id) || 0), 0) / scenes.length).toFixed(3));
  const text = aggregateText(scenes);
  return {
    id: `${kind}:${ids[0]}${ids.length > 1 ? '-' + ids[ids.length - 1] : ''}`,
    type: kind,
    pattern,
    scenes: ids,
    startOffset,
    endOffset,
    totalWords,
    hookScore,
    actionDensity: Number(calculateActionDensity(text).toFixed(3)),
    mysteryQuotient: Number(calculateMysteryQuotient(text).toFixed(3)),
    characterIntros: countCharacterIntrosForScenes(scenes, priorChars),
    dialogueRatio: Number(aggregateDialogueRatio(scenes).toFixed(3)),
  };
}

// POV shift heuristic: dominant (most frequent) character token changes.
function dominantCharacter(charSet: Set<string>): string | null {
  // With only a set (no counts), use lexicographically first to keep deterministic.
  if (!charSet || charSet.size === 0) return null;
  return Array.from(charSet).sort()[0] || null;
}

// --- Public generation ----------------------------------------------------

export function generateCandidates(scenes: Scene[]): OpeningCandidate[] {
  if (!scenes.length) return [];

  // Analyze first for hook scores + character extraction map.
  const analysis = analyzeScenes(scenes);
  const hookScores = analysis.hookScores;

  const candidates: OpeningCandidate[] = [];
  const globalPriorChars = new Set<string>(); // track intros up to candidate start

  // Strategy 1: Single high-hook scenes from first 10 (top 3 by hook among first 10)
  const firstTen = scenes.slice(0, 10);
  firstTen
    .slice() // copy for sort
    .sort((a, b) => (hookScores.get(b.id)! - hookScores.get(a.id)!))
    .slice(0, 3)
    .forEach(s => {
      candidates.push(createCandidate('single', 'high-hook-in-first10', [s], hookScores, globalPriorChars));
    });

  // Strategy 2: First scene after each POV (dominant character) shift (within first 20 scenes to bound cost)
  const firstScene = scenes[0];
  const firstChars = firstScene ? (analysis.charactersPerScene.get(firstScene.id) || new Set()) : new Set<string>();
  let lastDom: string | null = dominantCharacter(firstChars);
  for (let i = 1; i < Math.min(scenes.length, 20); i++) {
    const sc = scenes[i];
    if (!sc) continue; // defensive under noUncheckedIndexedAccess
    const cs = analysis.charactersPerScene.get(sc.id) || new Set();
    const dom = dominantCharacter(cs);
    if (dom && dom !== lastDom) {
      candidates.push(createCandidate('single', 'pov-shift', [sc], hookScores, globalPriorChars));
    }
    if (dom) lastDom = dom || lastDom;
  }

  // Strategy 3: Composite of action + dialogue scenes (pattern window in first 10)
  for (let i = 0; i < Math.min(scenes.length - 1, 10); i++) {
    const s1 = scenes[i];
    const s2 = scenes[i + 1];
    if (!s1 || !s2) continue;
    if (s1.dialogueRatio < 0.3 && s2.dialogueRatio > 0.6) {
      candidates.push(createCandidate('composite', 'action+dialogue', [s1, s2], hookScores, globalPriorChars));
    }
  }

  // Additional composite patterns (heuristic, bounded to first 12 scenes)
  const windowLimit = Math.min(scenes.length - 1, 12);
  const seenCharsCumulative = new Set<string>();
  for (let i = 0; i <= windowLimit; i++) {
    const sc = scenes[i];
    if (!sc) continue;
    const chars = extractCharacters(sc);
    for (const c of chars) seenCharsCumulative.add(c);
  }
  for (let i = 0; i < windowLimit; i++) {
    const a = scenes[i];
    const b = scenes[i + 1];
    if (!a || !b) continue;
    const textA = a.text;
    const mysteryA = calculateMysteryQuotient(textA) > 0.25; // many questions
    const charsB = extractCharacters(b);
    const introCountB = Array.from(charsB).filter(c => !seenCharsCumulative.has(c)).length;
    if (mysteryA && introCountB >= 1) {
      candidates.push(createCandidate('composite', 'mystery+intro', [a, b], hookScores, globalPriorChars));
    }

    // location establish (low action + low dialogue) then conflict (higher action density or hook jump)
    const actionA = calculateActionDensity(textA);
    const actionB = calculateActionDensity(b.text);
    if (actionA < 0.1 && a.dialogueRatio < 0.4 && actionB >= 0.25) {
      candidates.push(createCandidate('composite', 'location+conflict', [a, b], hookScores, globalPriorChars));
    }
  }

  // Strategy 4: Skip prologue (chapterId ch00) start at first ch01 scene
  const hasPrologue = scenes.some(s => s.chapterId.toLowerCase() === 'ch00');
  if (hasPrologue) {
    const firstMain = scenes.find(s => s.chapterId.toLowerCase() === 'ch01');
    if (firstMain) {
      candidates.push(createCandidate('single', 'skip-prologue', [firstMain], hookScores, globalPriorChars));
    }
  }

  // Strategy 5: First scene with 3+ characters introduced (within first 15)
  for (let i = 0; i < Math.min(scenes.length, 15); i++) {
    const scene = scenes[i];
    if (!scene) continue;
    const charsSet = analysis.charactersPerScene.get(scene.id) || new Set();
    if (charsSet.size >= 3) {
      candidates.push(createCandidate('single', 'multi-character-intro', [scene], hookScores, globalPriorChars));
      break; // only first such scene
    }
  }

  // Strategy 6: Always consider baseline first scene if it wasn't captured and is long enough
  const first = scenes[0];
  if (first && first.wordCount >= 500) {
    const idCheck = `single:${first.id}`;
    if (!candidates.some(c => c.id === idCheck || c.scenes[0] === first.id)) {
      candidates.push(createCandidate('single', 'baseline-first', [first], hookScores, globalPriorChars));
    }
  }

  // Deduplicate by id (some strategies might target same scene)
  const byId = new Map<string, OpeningCandidate>();
  for (const c of candidates) {
    if (!byId.has(c.id)) byId.set(c.id, c);
  }
  let deduped = Array.from(byId.values());

  // Filter by hook strength threshold
  deduped = deduped.filter(c => c.hookScore >= 0.6);

  // Filter: minimum words 500
  deduped = deduped.filter(c => c.totalWords >= 500);

  // Require dialogue presence for engagement
  deduped = deduped.filter(c => c.dialogueRatio > 0);

  // Log filtered count
  console.log(`Filtered to ${deduped.length} candidates (hook >= 0.6, has dialogue)`);

  // Ranking: primarily hookScore, then actionDensity, then mysteryQuotient
  deduped.sort((a, b) => {
    if (b.hookScore !== a.hookScore) return b.hookScore - a.hookScore;
    if (b.actionDensity !== a.actionDensity) return b.actionDensity - a.actionDensity;
    return b.mysteryQuotient - a.mysteryQuotient;
  });

  // Limit top 5
  return deduped.slice(0, 5);
}

export default generateCandidates;
