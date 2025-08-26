import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fnv1a64Hex } from "@/lib/hash";
import type { Manuscript, Scene, SceneCacheSnap } from "./types.js";
import { resolveTrace as resolveAnchorTrace } from "./anchoring.js"; // keep .js suffix (ESM)

export type SceneSnap = SceneCacheSnap; // re-export legacy name for anchoring.ts compatibility

export type CacheFile = {
  manuscript_sha: string;
  generated_at: string;
  scenes: Record<string, SceneSnap>;
};

// Delta detail types
export type MovedDelta = { id: string; from: number; to: number; tier: number; confidence: number };
export type ModifiedDelta = { id: string; to: number; tier: number; confidence: number };
export type UnresolvedDelta = { id: string; priorOffset: number; reason: string; tier?: number; confidence?: number };

export type Delta = {
  added: string[];          // newly appeared scene ids
  removed: string[];        // disappeared scene ids
  modified: ModifiedDelta[];// same id, different sha (content changed)
  moved: MovedDelta[];      // same id, same sha, different offset
  unresolved: UnresolvedDelta[]; // scenes we attempted to re-anchor but failed
};

export function computeSnapshot(ms: Manuscript, scenes: Scene[]): CacheFile {
  const text = ms.rawText;
  const snaps: Record<string, SceneSnap> = {};
  const perf = process.env.SMAIRS_PERF_MODE === '1';
  const cheapHash = (s: string): string => {
    // Fowler–Noll–Vo style 32-bit then hex (deterministic, fast)
    let h = 2166136261 >>> 0;
    for (let i=0;i<s.length;i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h>>>0).toString(16).padStart(8,'0');
  };
  for (const s of scenes) {
    const sha = perf ? cheapHash(s.text) : sha256(s.text);
    const preStart = Math.max(0, s.startOffset - 64);
    const postEnd = Math.min(text.length, s.endOffset + 64);
    snaps[s.id] = {
      id: s.id,
      sha,
      offset: s.startOffset,
      len: s.endOffset - s.startOffset,
      pre: text.slice(preStart, s.startOffset),
      post: text.slice(s.endOffset, postEnd),
      rareShingles: perf ? [] : computeRareShingles(s.text),
    };
  }
  return {
    manuscript_sha: ms.checksum,
    generated_at: new Date().toISOString(),
    scenes: snaps,
  };
}

export function readPrevCache(path = ".smairs/cache.json"): CacheFile | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

export function writeCache(curr: CacheFile, path = ".smairs/cache.json") {
  mkdirSync(".smairs", { recursive: true });
  writeFileSync(path, JSON.stringify(curr, null, 2), "utf-8");
}

export function diffCaches(prev: CacheFile | null, curr: CacheFile, currentFullText?: string): Delta {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: ModifiedDelta[] = [];
  const moved: MovedDelta[] = [];
  const unresolved: UnresolvedDelta[] = [];

  const prevScenes = prev?.scenes ?? {};
  const currScenes = curr.scenes;

  // Track current scene ids to mark additions
  for (const id of Object.keys(currScenes)) {
    const c = currScenes[id]; // guard (noUncheckedIndexedAccess)
    if (!c) continue;
    const p = prevScenes[id];
    if (!p) {
      added.push(id);
      continue;
    }

    const sameSha = p.sha === c.sha;
    const sameOffset = p.offset === c.offset;
    if (sameSha && sameOffset) continue; // unchanged

    // Need manuscript text to attempt anchor resolution; if missing, fallback to simple classification.
    if (!currentFullText) {
      if (sameSha) {
        moved.push({ id, from: p.offset, to: c.offset, tier: 0, confidence: 0 });
      } else {
        modified.push({ id, to: c.offset, tier: 0, confidence: 0 });
      }
      continue;
    }

    try {
      // Bridge prev snapshot to anchoring SceneSnap shape (naming per anchoring.ts)
      const anchorInput: {
        id: string; sha: string; offset: number; preContext: string; postContext: string; length: number; rareShingles?: string[];
      } = {
        id: p.id,
        sha: p.sha,
        offset: p.offset,
        preContext: p.pre,
        postContext: p.post,
        length: p.len,
        rareShingles: p.rareShingles && p.rareShingles.length ? p.rareShingles : undefined,
      };
      // Use trace variant so we can surface tier/confidence for unresolved attempts
      const trace = resolveAnchorTrace(anchorInput, currentFullText);
      const res = trace.match;
      if (res) {
        if (sameSha) {
          moved.push({ id: p.id, from: p.offset, to: res.position, tier: res.tier, confidence: res.confidence });
        } else {
          modified.push({ id: p.id, to: res.position, tier: res.tier, confidence: res.confidence });
        }
      } else {
        unresolved.push({ id: p.id, priorOffset: p.offset, reason: 'anchor-resolution-failed', tier: trace.lastTier, confidence: trace.lastConfidence });
      }
    } catch {
      // Do not crash on malformed rows; categorize as unresolved silently (debug log could go here)
      unresolved.push({ id: p.id, priorOffset: p.offset, reason: 'anchor-exception' });
    }
  }

  // Detect removed scenes (present in prev but not in curr)
  for (const id of Object.keys(prevScenes)) {
    const c = currScenes[id];
    if (!c) removed.push(id);
  }

  return { added, removed, modified, moved, unresolved };
}


function sha256(s: string): string {
  return fnv1a64Hex(s);
}

// --- Rare Shingles Extraction (8-token shingles) ---
// Strategy: tokenize to lowercase word tokens; compute frequency; build all 8-length shingles;
// score each shingle by sum of inverse token frequency; pick top 2-3 distinct non-overlapping.
function computeRareShingles(sceneText: string): string[] {
  const tokens = sceneText
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(t => t.toLowerCase());
  if (tokens.length < 8) return [];

  const freq: Record<string, number> = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;

  type Sh = { text: string; start: number; score: number };
  const shingles: Sh[] = [];
  for (let i = 0; i <= tokens.length - 8; i++) {
    let score = 0;
    for (let j = 0; j < 8; j++) {
      const tok = tokens[i + j];
      if (!tok) continue; // safety
      const f = freq[tok] ?? 1;
      score += 1 / f; // inverse frequency
    }
    const text = tokens.slice(i, i + 8).join(" ");
    shingles.push({ text, start: i, score });
  }
  shingles.sort((a, b) => b.score - a.score);

  const picked: Sh[] = [];
  for (const sh of shingles) {
    if (picked.length >= 3) break;
    if (picked.some(p => Math.abs(p.start - sh.start) < 8)) continue; // avoid overlapping/near duplicates
    picked.push(sh);
  }
  return picked.map(p => p.text);
}
