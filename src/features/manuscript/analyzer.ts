import type { Scene } from "./types.js";

export interface Analysis {
  totalScenes: number;
  avgWordsPerScene: number;
  hookScores: Map<string, number>;
  charactersPerScene: Map<string, Set<string>>; // scene.id -> character set
  allCharacters: Set<string>; // union of all characters
}

/** Normalize quotes for analysis only (does not mutate manuscript text). */
function normalizeQuotesForAnalysis(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

// (Note) Dialogue ratio calculation lives in segmentation.ts for scenes.

/**
 * Calculate a hook score based on early text signals.
 * - Scans first 500 chars (lowercased, quotes normalized).
 * - Weighted categories (each capped at 3 matches, scaled to full weight):
 *   high-impact (0.3), action (0.2), mystery/tension (0.15), emotional (0.1), dialogue start (0.2)
 * - Bonuses: opening line is dialogue with ! or ? (+0.1), first sentence < 50 chars (+0.05)
 * - Deterministic and lightweight; clamped to [0,1].
 */
function calculateHookScore(text: string): number {
  const norm = normalizeQuotesForAnalysis(text || "");
  const head = norm.slice(0, 500).toLowerCase();

  // helper: count non-overlapping matches
  const count = (re: RegExp): number => {
    let c = 0;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    while (r.exec(head) !== null) c++;
    return c;
  };

  // Category patterns (keep concise for performance)
  const highImpactTokens = /\b(sudden(?:ly)?|bang|crash|scream|blood|gunshot|explode(?:d|s|r)?|blast|siren|alarm|panic)\b/g;
  const actionTokens = /\b(run|ran|sprint|chase|flee|bolt|grab|shove|kick|punch|fight|shot|shoot|stab|attack|escape|dash|rush|slam|strike|charge|lunge)\b/g;
  const mysteryTokens = /\b(why|how|who|where|secret|myster(?:y|ious)|hidden|unknown|missing|vanish(?:ed|es)?|threat|danger|risk|conspiracy|cover[- ]?up|blackmail)\b/g;
  const emotionalTokens = /\b(love|hate|fear|afraid|terrified|nervous|anxious|panic|desperate|heart\s+raced|cry|cried|sob|tears?|grief|angry|furious|relief)\b/g;

  const highImpactCount = Math.min(3, count(highImpactTokens));
  const actionCount = Math.min(3, count(actionTokens));
  // Include question marks as tension signals as well
  const qMarks = Math.min(3, (head.match(/\?/g) || []).length);
  const mysteryCount = Math.min(3, count(mysteryTokens) + qMarks);
  const emotionalCount = Math.min(3, count(emotionalTokens));

  // Dialogue start: if first non-space is a quote, grant full weight; else count early quoted spans
  const firstNonWs = head.match(/\S/);
  const beginsWithQuote = firstNonWs ? /["']/.test(firstNonWs[0]!) : false;
  let dialogueCount = 0;
  if (beginsWithQuote) dialogueCount = 3;
  else {
    const early = head.slice(0, 200);
    const spans = (early.match(/"[^"\n]{2,}"/g) || []).length + (early.match(/'[^'\n]{2,}'/g) || []).length;
    dialogueCount = Math.min(3, spans);
  }

  // Convert capped counts to weighted contributions
  const contrib = (weight: number, cappedCount: number) => weight * (cappedCount / 3);
  let score = 0;
  score += contrib(0.3, highImpactCount);
  score += contrib(0.2, actionCount);
  score += contrib(0.15, mysteryCount);
  score += contrib(0.1, emotionalCount);
  score += contrib(0.2, dialogueCount);

  // Bonuses
  const firstLine = head.split(/\n/)[0] || "";
  if (/^[\s]*["']/.test(firstLine) && /[!?]/.test(firstLine)) {
    score += 0.1;
  }
  const sentenceEnd = head.search(/[.!?]/);
  if (sentenceEnd > 0 && sentenceEnd < 50) {
    score += 0.05;
  }

  const final = Math.max(0, Math.min(1, score));
  return Number(final.toFixed(2));
}

/** Lightweight wrapper to compute scene hook score using early-text heuristics. */
function computeHookScore(scene: Scene): number {
  return calculateHookScore(scene.text);
}

/** Strip honorific / title prefixes from a candidate name. */
function stripTitle(name: string): string {
  const titles = /^(Mr|Mrs|Ms|Miss|Dr|Prof|Professor|Sir|Lady|Lord|Madam|Madame)\.?\s+/i;
  return name.replace(titles, '').trim();
}

/**
 * Extract character name candidates from a scene.
 * Strategies (Phase 1 heuristic):
 *  1. Dialogue attribution patterns ("Name said" | "said Name" etc.) using verbs: said|asked|replied|whispered|shouted
 *  2. Proper noun sequences (Capitalized tokens) appearing in non‑initial positions of sentences.
 * Titles (Mr./Mrs./Dr./etc) are stripped before insertion.
 * Returns a Set of distinct canonical names (original casing minus stripped titles).
 */
export function extractCharacters(scene: Scene): Set<string> {
  const text = scene.text || '';
  const chars = new Set<string>();
  if (!text) return chars;

  // 1. Dialogue attribution patterns
  const verbGroup = '(said|asked|replied|whispered|shouted)';
  // Name (1-3 capitalized tokens) possibly preceded by title; capture the name portion separately to allow stripping.
  const titleRegex = '(?:Mr|Mrs|Ms|Miss|Dr|Prof|Professor|Sir|Lady|Lord|Madam|Madame)\\.?';
  const nameToken = '[A-Z][a-z]+'; // simple token (we keep heuristic light for Phase 1)
  const nameSeq = `(?:${titleRegex}\\s+)?${nameToken}(?:\\s+${nameToken}){0,2}`;

  // Pattern A: Name verb (John Smith said)
  const pattA = new RegExp(`\\b(${nameSeq})\\s+${verbGroup}\\b`, 'g');
  // Pattern B: verb Name (said John Smith)
  const pattB = new RegExp(`\\b${verbGroup}\\s+(${nameSeq})\\b`, 'g');

  let m: RegExpExecArray | null;
  while ((m = pattA.exec(text)) !== null) {
    const raw = m[1];
    if (raw) {
      const norm = stripTitle(raw);
      if (norm && /[A-Z]/.test(norm)) chars.add(norm);
    }
  }
  while ((m = pattB.exec(text)) !== null) {
    const raw = m[2]; // group 2 holds name since group1 is verb
    if (raw) {
      const norm = stripTitle(raw);
      if (norm && /[A-Z]/.test(norm)) chars.add(norm);
    }
  }

  // 2. Proper noun sequences in non-initial sentence positions
  // Simple sentence split (retain last segment):
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    if (!s) continue;
    // Tokenize, strip leading/trailing punctuation for each token.
    const rawTokens = s.split(/\s+/).filter(Boolean);
    if (rawTokens.length < 2) continue; // need at least one non-initial token
    const clean = (tok: string | undefined) => tok ? tok.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z]+$/, '') : '';
    for (let i = 1; i < rawTokens.length; i++) {
      const first = clean(rawTokens[i]);
      if (!first || !/^[A-Z][a-z]+$/.test(first)) continue;
      let j = i;
      const seq: string[] = [first];
      while (j + 1 < rawTokens.length) {
        const nextRaw = clean(rawTokens[j + 1]);
        if (!nextRaw) break;
        if (/^(?:and|or|the|of|in|on|at|for)$/i.test(nextRaw)) {
          const after = clean(rawTokens[j + 2]);
            if (after && /^[A-Z][a-z]+$/.test(after)) {
              seq.push(nextRaw.toLowerCase());
              j += 2;
              seq.push(after);
              continue;
            }
            break;
        }
        if (/^[A-Z][a-z]+$/.test(nextRaw)) {
          seq.push(nextRaw);
          j++;
        } else break;
      }
      i = j;
      const candidate = stripTitle(seq.join(' ')).trim();
      if (candidate) chars.add(candidate);
    }
  }

  return chars;
}

export function analyzeScenes(scenes: Scene[]): Analysis {
  const totalScenes = scenes.length;
  const totalWords = scenes.reduce((a, s) => a + s.wordCount, 0);
  const avgWordsPerScene = totalScenes ? totalWords / totalScenes : 0;

  const hookScores = new Map<string, number>();
  const charactersPerScene = new Map<string, Set<string>>();
  const allCharacters = new Set<string>();
  for (const s of scenes) {
    hookScores.set(s.id, computeHookScore(s));
    const chars = extractCharacters(s);
    charactersPerScene.set(s.id, chars);
    for (const c of chars) allCharacters.add(c);
  }

  return { totalScenes, avgWordsPerScene, hookScores, charactersPerScene, allCharacters };
}
