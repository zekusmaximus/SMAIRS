import { createHash } from "crypto";
import type { Manuscript, Chapter } from "./types.js";

const CHAPTER_RE = /^===\s*CHAPTER\s+(\d{1,3})(?:\s*:\s*(.+?))?\s*===\s*$/gim;

export function normalize(text: string): string {
  let t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  t = t.replace(/[ \t]+$/gm, "");
  t = t.replace(/\n+$/g, "\n");
  if (!t.endsWith("\n")) t += "\n";
  return t;
}

export function importManuscript(raw: string): Manuscript {
  const rawText = normalize(raw);
  const checksum = createHash("sha256").update(rawText).digest("hex");
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  const chapters: Chapter[] = [];
  for (const m of rawText.matchAll(CHAPTER_RE)) {
  const numStr = m[1]; // string | undefined (TS thinks this can be missing)
  if (!numStr) continue; // safety; shouldn't happen given the regex

  const chapterIndex = parseInt(numStr, 10);
  const n = String(chapterIndex).padStart(2, "0");

  chapters.push({
    id: `ch${n}`,
    index: chapterIndex,               // 1-based
    startOffset: m.index ?? 0,         // number
  });
}

  return {
    id: checksum.slice(0, 8),
    title: "Manuscript",
    rawText,
    checksum,
    wordCount,
    chapters,
  };
}
