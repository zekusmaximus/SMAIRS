// src/features/manuscript/anchoring.ts
// ESM note: keep .js suffixes when importing local modules elsewhere in repo.
//
// Strategy:
//  - Tier 1: Exact slice equality at prior offset if we have stored scene text.
//  - Tier 2: Pre/Post context window match (±64 chars) near prior offset.
//  - Tier 3: Fuzzy corridor search (±1000 chars) on first ~200 chars using fastest-levenshtein.
//  - Tier 4: Rare shingle search (2–3 8-token shingles near scene start) across full text.
//
// Returns: { tier, confidence, position } | null
//
// Edge cases handled:
//  - Out-of-bounds offsets
//  - Missing text/pre/post fields
//  - Very short scenes
//  - Ambiguous multi-matches (we pick the best-scoring candidate or bail if conflict)
//
// Dependencies:
//   "fastest-levenshtein" in package.json

import { distance as levenshtein } from 'fastest-levenshtein';

export interface SceneSnap {
  id: string;
  sha: string;
  /** Previous byte/char offset in the manuscript (we assume JS string index) */
  offset: number;
  /** Stored scene text if available (optional per ledger) */
  text?: string;
  /** Stored pre/post contexts (~64 chars each) around previous position */
  preContext?: string;
  postContext?: string;
  /** Optional cached length; if absent and text present, length = text.length */
  length?: number;
}

/** Result of a successful resolution */
export interface Resolution {
  tier: 1 | 2 | 3 | 4;
  /** 0..1 heuristic */
  confidence: number;
  /** new absolute position (string index) where scene starts in currentFullText */
  position: number;
}

/**
 * Resolve the current position of a scene snapshot within the given manuscript text.
 *
 * Tiers:
 *  1) Exact offset slice equals stored text (fast path, 1.0 confidence).
 *  2) Pre/post context (±64) window match around prior offset (0.92–0.99 confidence).
 *  3) Corridor fuzzy match (±1000) on first ~200 chars using Levenshtein (0.6–0.95 confidence).
 *  4) Rare shingle search (2–3 8-token shingles from scene start) over entire manuscript (0.55–0.9 confidence).
 *
 * Returns null if not confidently resolved.
 */
export function resolve(sceneSnap: SceneSnap, currentFullText: string): Resolution | null {
  const prior = clamp(sceneSnap.offset ?? 0, 0, Math.max(0, currentFullText.length - 1));
  const sceneText = sceneSnap.text ?? '';
  const sceneLen = sceneSnap.length ?? (sceneText ? sceneText.length : undefined);

  // Tier 1: exact slice at stored offset equals stored text
  if (sceneText && sceneLen && inBounds(prior, prior + sceneLen, currentFullText.length)) {
    const slice = currentFullText.slice(prior, prior + sceneLen);
    if (slice === sceneText) {
      return { tier: 1, confidence: 1.0, position: prior };
    }
  }

  // Tier 2: pre/post context (±64) around prior offset
  {
    const res = tier2_contextWindow(sceneSnap, currentFullText, prior);
    if (res) return res;
  }

  // Tier 3: corridor fuzzy match (±1000) on first ~200 chars
  if (sceneText && sceneText.length >= 24) {
    const res = tier3_corridorFuzzy(sceneText, currentFullText, prior);
    if (res) return res;
  }

  // Tier 4: rare shingle search (2–3 8-token shingles near scene start)
  {
    const res = tier4_rareShingles(sceneText, currentFullText);
    if (res) return res;
  }

  return null;
}

/* ===========================
 * Tier 2 — Context Window
 * =========================== */

/**
 * Tier 2: Try to reattach using pre/post context windows within ±64 chars.
 * We look for a position p such that:
 *   currentFullText.slice(p - pre.length, p)   == preContext
 *   currentFullText.slice(p + sceneLen, p + sceneLen + post.length) == postContext
 * If sceneLen is unknown, we try to infer it from available data (prefer stored text length).
 */
function tier2_contextWindow(scene: SceneSnap, text: string, prior: number): Resolution | null {
  const pre = scene.preContext ?? '';
  const post = scene.postContext ?? '';
  const span = 64;

  // Without at least one context, Tier 2 is weak; bail early.
  if (!pre && !post) return null;

  const sceneLen = scene.length ?? (scene.text ? scene.text.length : undefined);
  // We need a plausible scene length to check postContext; if absent, try to use preContext-only anchoring.
  const hasLen = typeof sceneLen === 'number' && sceneLen > 0;
  const startMin = clamp(prior - span, 0, text.length);
  const startMax = clamp(prior + span, 0, text.length);

  let best: { pos: number; score: number } | null = null;

  for (let p = startMin; p <= startMax; p++) {
    // Check pre context
    if (pre) {
      const preStart = p - pre.length;
      if (!inBounds(preStart, p, text.length)) continue;
      if (text.slice(preStart, p) !== pre) continue;
    }
    // If we know length and have post, check it too
    if (hasLen && post) {
      const postStart = p + (sceneLen as number);
      const postEnd = postStart + post.length;
      if (!inBounds(postStart, postEnd, text.length)) continue;
      if (text.slice(postStart, postEnd) !== post) continue;
    }

    // Scoring: reward having both pre & post, proximity to prior, and availability of scene length
    const proximity = 1 - Math.min(Math.abs(p - prior) / 64, 1);
    const contexts = (pre ? 0.45 : 0) + (post && hasLen ? 0.45 : 0);
    const score = 0.1 + contexts + 0.35 * proximity; // range roughly ~0.5..0.99

    if (!best || score > best.score) {
      best = { pos: p, score };
    }
  }

  if (best) {
    const confidence = clampNum(best.score, 0.5, 0.99);
    return { tier: 2, confidence, position: best.pos };
  }
  return null;
}

/* ===========================
 * Tier 3 — Corridor Fuzzy
 * =========================== */

function tier3_corridorFuzzy(sceneText: string, text: string, prior: number): Resolution | null {
  const corridorSpan = 1000;
  const start = clamp(prior - corridorSpan, 0, text.length);
  const end = clamp(prior + corridorSpan, 0, text.length);
  if (end <= start) return null;

  // Use first ~200 chars of sceneText (normalized lightly) to match against corridor windows.
  const targetRaw = sceneText.slice(0, Math.min(200, sceneText.length));
  const target = normalizeForFuzzy(targetRaw);
  if (target.length < 16) return null;

  const corridor = text.slice(start, end);
  // Slide a window roughly the length of the target across the corridor with step >1 for speed.
  // We do a two-phase scan: coarse step, then refine around best.
  const step = Math.max(4, Math.floor(target.length / 8));
  let best: { idx: number; d: number } | null = null;

  for (let i = 0; i + target.length <= corridor.length; i += step) {
    const window = normalizeForFuzzy(corridor.slice(i, i + target.length));
    const d = levenshtein(target, window);
    if (!best || d < best.d) best = { idx: i, d };
  }
  if (!best) return null;

  // Local refinement around best match
  const refineRadius = Math.max(8, Math.floor(target.length / 6));
  const refineStart = Math.max(0, best.idx - refineRadius);
  const refineEnd = Math.min(corridor.length - target.length, best.idx + refineRadius);
  for (let i = refineStart; i <= refineEnd; i++) {
    const window = normalizeForFuzzy(corridor.slice(i, i + target.length));
    const d = levenshtein(target, window);
    if (d < best.d) best = { idx: i, d };
  }

  // Confidence: 1 - (d / maxLen), scaled and clamped.
  const maxLen = Math.max(target.length, 1);
  const raw = 1 - best.d / maxLen; // 0..1
  const confidence = clampNum(0.55 + 0.45 * raw, 0.6, 0.95);
  const absolutePos = start + best.idx;

  return { tier: 3, confidence, position: absolutePos };
}

/* ===========================
 * Tier 4 — Rare Shingles
 * =========================== */

/**
 * Choose 2–3 "rare" 8-token shingles from the scene start and scan the full text.
 * "Rare" is approximated within the scene by picking shingles that include at least
 * one low-frequency token (by scene-internal frequency).
 */
function tier4_rareShingles(sceneText: string, text: string): Resolution | null {
  if (!sceneText || sceneText.length < 32) return null;

  const tokens = tokenize(sceneText);
  if (tokens.length < 8) return null;

  const shingles = buildShingles(tokens, 8);
  if (shingles.length === 0) return null;

  const freq = tokenFrequency(tokens);
  // Score shingles by min token frequency (rarer is better), and prefer early shingles
  const scored = shingles
    .map((sh, idx) => {
      const minFreq = Math.min(...sh.map(t => freq.get(t) ?? 0));
      return { idx, sh, minFreq };
    })
    .sort((a, b) => (a.minFreq - b.minFreq) || (a.idx - b.idx));

  const chosen = scored.slice(0, Math.min(3, scored.length)); // pick top 2–3
  if (chosen.length === 0) return null;

  // Search all chosen shingles in entire text; gather candidate start indices.
  // We convert shingles back to a plain-space string for substring search.
  const candidates: Map<number, number> = new Map(); // pos -> hits
  for (const c of chosen) {
    const needle = c.sh.join(' ');
    const hits = findAllSubstr(text, needle);
    for (const pos of hits) {
      candidates.set(pos, (candidates.get(pos) ?? 0) + 1);
    }
  }
  if (candidates.size === 0) return null;

  // Pick the candidate with the most hits (number of shingles matched), break ties by earliest pos.
  const sorted = Array.from(candidates.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] - b[0];
  });
  if (sorted.length === 0) return null;
  const top = sorted[0];
  if (!top) return null; // type guard (should be unreachable due to earlier checks)
  const [bestPos, hits] = top;

  // Confidence: base on number of shingles that hit plus scene length heuristic
  const base = 0.55 + 0.15 * (hits - 1); // 1 hit → 0.55, 2 hits → 0.70, 3 hits → 0.85
  const lengthBoost = Math.min(tokens.length / 400, 0.05); // tiny boost for longer scenes
  const confidence = clampNum(base + lengthBoost, 0.55, 0.9);

  return { tier: 4, confidence, position: bestPos };
}

/* ===========================
 * Helpers
 * =========================== */

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
function clampNum(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
function inBounds(start: number, end: number, total: number): boolean {
  return start >= 0 && end <= total && start <= end;
}

function normalizeForFuzzy(s: string): string {
  // Light normalization for fuzzy match: collapse whitespace and normalize quotes
  return s
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  // Lowercase, strip most punctuation but keep apostrophes inside words.
  return s
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildShingles(tokens: string[], k: number): string[][] {
  if (tokens.length < k) return [];
  const res: string[][] = [];
  for (let i = 0; i + k <= tokens.length && i < 64; i++) { // limit to first ~64 tokens
    res.push(tokens.slice(i, i + k));
  }
  return res;
}

function tokenFrequency(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function findAllSubstr(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let idx = 0;
  while (true) {
    idx = haystack.indexOf(needle, idx);
    if (idx === -1) break;
    out.push(idx);
    idx = idx + 1;
  }
  return out;
}

export default { resolve };
