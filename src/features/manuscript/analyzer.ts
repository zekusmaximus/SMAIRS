import type { Scene } from "./types.js";

export interface Analysis {
  totalScenes: number;
  avgWordsPerScene: number;
  hookScores: Map<string, number>;
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

export function analyzeScenes(scenes: Scene[]): Analysis {
  const totalScenes = scenes.length;
  const totalWords = scenes.reduce((a, s) => a + s.wordCount, 0);
  const avgWordsPerScene = totalScenes ? totalWords / totalScenes : 0;

  const hookScores = new Map<string, number>();
  for (const s of scenes) {
    hookScores.set(s.id, computeHookScore(s));
  }

  return { totalScenes, avgWordsPerScene, hookScores };
}
