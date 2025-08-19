import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import type { Manuscript, Scene } from "./types.js";
import { resolve as resolveAnchor } from "./anchoring.js"; // keep .js suffix (ESM)

export type SceneSnap = {
  id: string;
  sha: string;       // sha256 of scene text (normalized)
  offset: number;    // startOffset
  len: number;       // endOffset - startOffset
  pre: string;       // 64 chars before start (bounded at 0)
  post: string;      // 64 chars after end (bounded at text length)
};

export type CacheFile = {
  manuscript_sha: string;
  generated_at: string;
  scenes: Record<string, SceneSnap>;
};

// Delta detail types
export type MovedDelta = { id: string; from: number; to: number; tier: number; confidence: number };
export type ModifiedDelta = { id: string; to: number; tier: number; confidence: number };
export type UnresolvedDelta = { id: string; priorOffset: number; reason: string };

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
  for (const s of scenes) {
    const sha = sha256(s.text);
    const preStart = Math.max(0, s.startOffset - 64);
    const postEnd = Math.min(text.length, s.endOffset + 64);
    snaps[s.id] = {
      id: s.id,
      sha,
      offset: s.startOffset,
      len: s.endOffset - s.startOffset,
      pre: text.slice(preStart, s.startOffset),
      post: text.slice(s.endOffset, postEnd),
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
      const anchorInput = {
        id: p.id,
        sha: p.sha,
        offset: p.offset,
        preContext: p.pre,
        postContext: p.post,
        length: p.len,
      };
      const res = resolveAnchor(anchorInput, currentFullText);
      if (res) {
        if (sameSha) {
          moved.push({ id: p.id, from: p.offset, to: res.position, tier: res.tier, confidence: res.confidence });
        } else {
          modified.push({ id: p.id, to: res.position, tier: res.tier, confidence: res.confidence });
        }
      } else {
        unresolved.push({ id: p.id, priorOffset: p.offset, reason: 'anchor-resolution-failed' });
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
  return createHash("sha256").update(s).digest("hex");
}
