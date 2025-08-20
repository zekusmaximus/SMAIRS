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

/** Rough dialogue ratio: count content inside quotes after normalization. */
function calcDialogueRatio(text: string): number {
  const t = normalizeQuotesForAnalysis(text);

  // Count double-quoted spans (skip single-line mega-spans via newline guard)
  const dq = t.match(/"[^"\n]{2,}"/g) || [];
  let dlgLen = dq.reduce((acc, s) => acc + s.length, 0);

  // Optionally count single-quoted spans but avoid contractions (min 4 chars)
  const sq = t.match(/'[^'\n]{4,}'/g) || [];
  dlgLen += sq.reduce((acc, s) => acc + s.length, 0);

  const denom = t.length || 1;
  return Math.max(0, Math.min(1, dlgLen / denom));
}

/** Lightweight "hook" heuristic that isn't only dialogue-dependent. */
function computeHookScore(scene: Scene): number {
  // 1) Dialogue weight (after quote normalization)
  const dlg = calcDialogueRatio(scene.text); // 0..1

  // 2) Early tension markers in first ~250 chars
  const head = scene.text.slice(0, 250).toLowerCase();
  const exclam = (head.match(/!/g) || []).length;
  const quest  = (head.match(/\?/g) || []).length;

  // conflict tokens (keep small, domain-agnostic)
  const TOKENS = [
    "but", "however", "until", "suddenly", "alarm", "blood", "dead", "risk",
    "danger", "threat", "gun", "siren", "audit", "knock", "chase", "leak", "broke"
  ];
  let tokenHits = 0;
  for (const t of TOKENS) {
    if (head.includes(t)) tokenHits++;
  }
  const tokenScore = Math.min(1, tokenHits / 4); // saturate after a few hits

  // 3) Sentence length variance (short + long mix reads "pacey")
  const sentences = head.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  let varianceScore = 0;
  if (sentences.length >= 2) {
    const lens = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    const dev = Math.sqrt(lens.reduce((a, l) => a + Math.pow(l - avg, 2), 0) / lens.length);
    varianceScore = Math.max(0, Math.min(1, dev / 6)); // heuristic normalization
  }

  // Blend (weights sum to 1). Keep deterministic & lightweight.
  const score = 0.4 * dlg + 0.4 * tokenScore + 0.2 * (exclam + quest > 0 ? 0.5 : 0);
  // Nudge with variance a bit
  const final = Math.max(0, Math.min(1, score + 0.1 * varianceScore));

  return Number(final.toFixed(2));
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
