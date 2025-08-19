import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import type { Manuscript, Scene } from "./types.js";

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

export type Delta = {
  added: string[];
  removed: string[];
  modified: string[]; // same id, different sha
  moved: string[];    // same id, same sha, different offset
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

export function diffCaches(prev: CacheFile | null, curr: CacheFile): Delta {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const moved: string[] = [];

  const prevScenes = prev?.scenes ?? {};
  const currScenes = curr.scenes;

  // Current → compare against prev
  for (const id of Object.keys(currScenes)) {
    const c = currScenes[id];           // SceneSnap | undefined (under noUncheckedIndexedAccess)
    if (!c) continue;                   // guard

    const p = prevScenes[id];           // SceneSnap | undefined
    if (!p) {
      added.push(id);
      continue;
    }

    if (p.sha !== c.sha) {
      modified.push(id);
    } else if (p.offset !== c.offset) {
      moved.push(id);
    }
  }

  // Previous → detect removed
  for (const id of Object.keys(prevScenes)) {
    const c = currScenes[id];           // SceneSnap | undefined
    if (!c) removed.push(id);
  }

  return { added, removed, modified, moved };
}


function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
