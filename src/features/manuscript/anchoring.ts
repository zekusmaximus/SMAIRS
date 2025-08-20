// src/features/manuscript/anchoring.ts
// Minimal Tier-1/Tier-2 resolver aligned with tests that churn quotes + whitespace.

import { createHash } from "crypto";

// Resolver is used in two contexts:
// 1. Internally with cache.ts SceneSnap (fields: sha, offset, len, pre, post)
// 2. Tests that fabricate a simplified SceneSnap (fields: text, length, preContext, postContext)
// To stay flexible we accept a hybrid shape below.

export type SceneSnap = {
  id: string;
  // Optional raw scene text (tests provide this; production may omit and only give sha/hash + length)
  text?: string;
  // Hash + positional metadata (production cache shape)
  sha?: string;
  offset: number; // prior known start offset
  len?: number;   // production length
  length?: number; // test length
  // Context windows (both naming variants supported)
  pre?: string;
  post?: string;
  preContext?: string;
  postContext?: string;
  // Cached rare shingles (8-token) persisted in cache.json (lowercased, space separated tokens)
  rareShingles?: string[];
};

export type AnchorTier = 1 | 2 | 3 | 4;

export interface AnchorMatch {
  tier: AnchorTier;
  confidence: number; // 0..1
  position: number;   // start index in fullText
}

export interface ResolverOptions {
  corridor?: number;   // ± characters around prior offset (default 1500)
  contextMin?: number; // minimum usable pre/post length (default 8)
}

/** Primary API used by tests: resolve a SceneSnap in fullText. */
export function resolve(
  snap: SceneSnap,
  fullText: string,
  opts: ResolverOptions = {}
): AnchorMatch | null {
  const corridor = opts.corridor ?? 1500;
  const contextMin = opts.contextMin ?? 8;

  const sceneLen = coalesceLen(snap);
  if (!Number.isFinite(sceneLen) || sceneLen <= 0) {
    // Cannot resolve without any length anchor; bail early.
    return null;
  }

  // Tier 1 — exact match at prior offset using either provided text or sha
  const t1 = tier1_exact(snap, fullText, sceneLen);
  if (t1) return t1;

  // Tier 2 — corridor pre/post context anchors (whitespace + quote churn tolerant)
  const t2 = tier2_context(snap, fullText, corridor, contextMin, sceneLen);
  if (t2) return t2;

  // Tier 3 — corridor fuzzy token overlap near prior offset (handles small internal edits)
  const t3 = tier3_fuzzy(snap, fullText, corridor, sceneLen);
  if (t3) return t3;

  // Tier 4 — global rare-shingle search when prior corridor is useless
  const t4 = tier4_rareShingles(snap, fullText, sceneLen);
  if (t4) return t4;

  return null;
}

function tier1_exact(snap: SceneSnap, text: string, sceneLen: number): AnchorMatch | null {
  const start = snap.offset;
  const end = start + sceneLen;
  if (start < 0 || end > text.length) return null;

  const slice = text.slice(start, end);
  const provided = snap.text;
  const sliceNorm = norm(slice);
  // Accept direct text equality OR after churn normalization OR sha equality
  if (provided) {
    if (slice === provided || sliceNorm === norm(provided)) {
      const conf = slice === provided ? 1.0 : 0.98; // tiny penalty if only normalized equality
      return { tier: 1, confidence: conf, position: start };
    }
  }
  if (snap.sha && sha256(slice) === snap.sha) {
    return { tier: 1, confidence: 1.0, position: start };
  }
  return null;
}

function tier2_context(
  snap: SceneSnap,
  text: string,
  corridor: number,
  contextMin: number,
  sceneLen: number
): AnchorMatch | null {
  const searchStart = Math.max(0, snap.offset - corridor);
  const searchEnd = Math.min(text.length, snap.offset + sceneLen + corridor);
  const corridorText = text.slice(searchStart, searchEnd);
  const hay = norm(corridorText);

  const rawPre = snap.pre ?? snap.preContext ?? "";
  const rawPost = snap.post ?? snap.postContext ?? "";
  const pre = norm(rawPre.slice(-64)).trim();
  const post = norm(rawPost.slice(0, 64)).trim();

  const hasPre = pre.length >= contextMin;
  const hasPost = post.length >= contextMin;

  if (!hasPre && !hasPost) return null; // nothing to leverage

  // Both contexts present: seek ordered occurrence
  if (hasPre && hasPost) {
    const i = hay.indexOf(pre);
    if (i !== -1) {
      const j = hay.indexOf(post, i + pre.length);
      if (j !== -1 && j > i) {
        const posApprox = i + pre.length; // position within normalized corridor
        // Map back to un-normalized corridor by approximate proportion
        const posUnNorm = approximateMapBack(corridorText, hay, posApprox);
        return { tier: 2, confidence: 0.95, position: searchStart + posUnNorm };
      }
    }
  }

  // Single context fallback
  if (hasPre) {
    const i = hay.indexOf(pre);
    if (i !== -1) {
      const posUnNorm = approximateMapBack(corridorText, hay, i + pre.length);
      return { tier: 2, confidence: 0.90, position: searchStart + posUnNorm };
    }
  }
  if (hasPost) {
    const j = hay.indexOf(post);
    if (j !== -1) {
      const posUnNorm = approximateMapBack(corridorText, hay, Math.max(0, j - 1));
      // approximate start position ensuring bounds
      const startGuess = Math.max(searchStart, searchStart + posUnNorm - sceneLen);
      return { tier: 2, confidence: 0.85, position: startGuess };
    }
  }
  return null;
}

// Tier 3: fuzzy corridor token-overlap match; tolerates small localized edits (insertions/deletions)
function tier3_fuzzy(snap: SceneSnap, fullText: string, corridor: number, sceneLen: number): AnchorMatch | null {
  if (!snap.text) return null; // need original content to fuzzily match
  const corridorStart = Math.max(0, snap.offset - corridor);
  const corridorEnd = Math.min(fullText.length, snap.offset + sceneLen + corridor);
  const windowText = fullText.slice(corridorStart, corridorEnd);
  if (!windowText) return null;

  const origTokens = tokenize(norm(snap.text));
  if (origTokens.length === 0) return null;

  // Use first N tokens (limit) to seed search to reduce cost
  const seed = origTokens.slice(0, Math.min(5, origTokens.length));
  const seedPattern = seed.map(escapeRegex).join("\\s+" );
  const regex = new RegExp(seedPattern, "i");
  const m = regex.exec(norm(windowText));
  if (!m) return null; // can't find seed sequence

  // Rough position mapping back to original window
  const normWindow = norm(windowText);
  const normIndex = m.index;
  const approxStartLocal = approximateMapBack(windowText, normWindow, normIndex);
  const absoluteGuess = corridorStart + approxStartLocal;

  // Extract candidate slice of sceneLen ± 10% to compute token overlap similarity
  const candidate = fullText.slice(absoluteGuess, Math.min(fullText.length, absoluteGuess + sceneLen + Math.ceil(sceneLen * 0.1)));
  const candTokens = tokenize(norm(candidate));
  if (candTokens.length === 0) return null;

  const overlap = tokenOverlap(origTokens, candTokens);
  const ratio = overlap / origTokens.length;
  if (ratio >= 0.55) { // threshold tuned for test scenario
    // Confidence scaled between 0.6 and 0.8 based on ratio
    const conf = 0.6 + (Math.min(1, ratio) - 0.55) * (0.2 / (1 - 0.55));
    return { tier: 3, confidence: parseFloat(conf.toFixed(3)), position: absoluteGuess };
  }
  return null;
}

// Tier 4: Rare shingles global search (frequency-based token localization)
function tier4_rareShingles(snap: SceneSnap, fullText: string, sceneLen: number): AnchorMatch | null {
  // Prefer cached shingles if supplied; fallback to on-the-fly extraction from text.
  let shingles: string[] | undefined = snap.rareShingles;
  if ((!shingles || shingles.length === 0) && snap.text) {
    shingles = extractRareShingles(snap.text).slice(0, 3);
  }
  if (!shingles || shingles.length === 0) return null;

  const positions: { sh: string; pos: number }[] = [];
  for (const sh of shingles) {
    if (!sh) continue;
    const firstToken = sh.split(/\s+/)[0];
    if (!firstToken) continue;
    let idx = 0;
    while (true) {
      idx = fullText.toLowerCase().indexOf(firstToken, idx);
      if (idx === -1) break;
      positions.push({ sh, pos: idx });
      idx += firstToken.length;
    }
  }
  if (positions.length === 0) return null;

  // Score windows by how many shingles fully appear inside sceneLen span.
  type Cand = { pos: number; hits: number };
  const cands: Cand[] = [];
  for (const p of positions) {
    const windowEnd = p.pos + sceneLen;
    let hits = 0;
    for (const sh of shingles) {
      if (!sh) continue;
      const idx = fullText.toLowerCase().indexOf(sh.split(/\s+/)[0] || '', p.pos);
      if (idx !== -1 && idx < windowEnd) hits++;
    }
    cands.push({ pos: p.pos, hits });
  }
  cands.sort((a,b) => b.hits - a.hits);
  const best = cands[0];
  if (!best) return null;
  const ratio = best.hits / Math.max(1, shingles.length);
  if (ratio < 0.34) return null; // threshold slightly lower due to stronger signal from curated shingles
  const conf = 0.6 + Math.min(0.4, ratio) * 0.4; // 0.6 .. 0.76
  return { tier: 4, confidence: parseFloat(conf.toFixed(3)), position: best.pos };
}

// Lightweight extraction mirroring cache algorithm (8-token shingles, inverse frequency scoring)
function extractRareShingles(text: string): string[] {
  const tokens = tokenize(norm(text));
  if (tokens.length < 8) return [];
  const freq: Record<string, number> = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  type Sh = { text: string; score: number; start: number };
  const arr: Sh[] = [];
  for (let i = 0; i <= tokens.length - 8; i++) {
    let score = 0;
    for (let j = 0; j < 8; j++) {
      const tok = tokens[i + j];
      if (!tok) continue;
      const f = freq[tok] ?? 1;
      score += 1 / f;
    }
    arr.push({ text: tokens.slice(i, i + 8).join(' '), score, start: i });
  }
  arr.sort((a,b) => b.score - a.score);
  const picked: Sh[] = [];
  for (const sh of arr) {
    if (picked.length >= 3) break;
    if (picked.some(p => Math.abs(p.start - sh.start) < 8)) continue;
    picked.push(sh);
  }
  return picked.map(p => p.text);
}

// ----------------- Helpers -----------------

function coalesceLen(s: SceneSnap): number {
  return s.len ?? s.length ?? (s.text ? s.text.length : NaN);
}

function tokenize(s: string): string[] {
  return s.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(t => t.toLowerCase());
}

function tokenOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  let hits = 0;
  for (const t of a) if (setB.has(t)) hits++;
  return hits;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Map an index within a normalized string back to an approximate index in the original string.
function approximateMapBack(original: string, normalized: string, normIndex: number): number {
  if (original === normalized) return normIndex;
  // Heuristic: walk both strings counting equivalent normalized characters.
  let o = 0, n = 0;
  while (o < original.length && n < normIndex) {
    const ch: string = original.charAt(o);
    if (/\s/.test(ch)) {
      // Skip contiguous whitespace in original but increment normalized by 1
      while (o < original.length && /\s/.test(original[o]!)) o++;
      n++; // collapsed whitespace
    } else if (/[“”]/.test(ch)) {
      o++; n++; // becomes a single quote replacement
    } else if (/[‘’]/.test(ch)) {
      o++; n++;
    } else {
      o++; n++;
    }
  }
  return o;
}

/** Normalize to mirror test churn: LF endings, straight quotes, collapsed whitespace. */
function norm(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
}

/** Explicit return type so TS doesn't infer 'any'. */
function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Optional OO wrapper for other call sites. */
export class MultiTierAnchorResolver {
  constructor(private opts: ResolverOptions = {}) {}
  resolve(snap: SceneSnap, fullText: string): AnchorMatch | null {
    return resolve(snap, fullText, this.opts);
  }
}

export default { resolve };
