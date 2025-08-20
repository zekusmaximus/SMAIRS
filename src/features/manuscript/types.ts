export interface Chapter {
  id: string;          // ch01
  index: number;       // 1-based
  startOffset: number; // byte index in normalized text
}

export interface Manuscript {
  id: string;          // checksum prefix
  title: string;
  rawText: string;     // normalized LF text
  checksum: string;    // sha256 of normalized text
  wordCount: number;
  chapters: Chapter[];
}

export interface Scene {
  id: string;          // ch01_s01
  chapterId: string;   // ch01
  startOffset: number; // body start (after header line)
  endOffset: number;   // exclusive
  text: string;
  wordCount: number;
  dialogueRatio: number; // 0..1
}

// Snapshot (cache) representation persisted to .smairs/cache.json
// Kept separate from runtime Scene to avoid polluting core domain type with cache-only fields.
export interface SceneCacheSnap {
  id: string;
  sha: string;       // sha256 of scene text (normalized)
  offset: number;    // startOffset
  len: number;       // endOffset - startOffset
  pre: string;       // 64 chars before start (bounded at 0)
  post: string;      // 64 chars after end (bounded at text length)
  rareShingles?: string[]; // up to 3 rare 8-token shingles (lowercased) for Tier‑4 anchoring
}

// Lightweight Reveal domain primitive (Phase 1 scope)
export interface Reveal {
  id: string;         // sha256(description)
  description: string; // human-readable fact expression
}
