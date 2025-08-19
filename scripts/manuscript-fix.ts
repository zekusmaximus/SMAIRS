// scripts/manuscript-fix.ts
// Usage: npm run manuscript:fix -- data/manuscript.txt
import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { basename } from "path";

const file = process.argv[2] || "data/manuscript.txt";
const raw = readFileSync(file, "utf-8");

// 1) Normalize EOLs/BOM, remove tabs, trim trailing spaces
let t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
t = t.replace(/\t/g, " "); // spec says no tabs
t = t
  .split("\n")
  .map((line) => line.replace(/[ \t]+$/g, "")) // trim trailing whitespace
  .join("\n");

// 2) Zero-pad chapter numbers and ensure chapter header format
t = t.replace(
  /^===\s*CHAPTER\s+(\d{1,3})(\s*:\s*.+?)?\s*===\s*$/gim,
  (_m, n, title = "") => {
    const pad = String(parseInt(n, 10)).padStart(2, "0");
    return `=== CHAPTER ${pad}${title || ""} ===`;
  }
);

// 3) Normalize scene headers: zero-pad IDs, ensure spacing, strip trailing spaces after ]
t = t.replace(
  /^\[SCENE:\s*CH(\d{1,3})_S(\d{1,3})\s*(?:\|\s*POV:\s*([^\]|]+))?\s*(?:\|\s*Location:\s*([^\]|]+))?\s*\]\s*$/gim,
  (_m, ch, sc, pov = "", loc = "") => {
    const pad2 = (n: string) => String(parseInt(n, 10)).padStart(2, "0");
    const parts = [`SCENE: CH${pad2(ch)}_S${pad2(sc)}`];
    if (pov.trim()) parts.push(`POV: ${pov.trim()}`);
    if (loc.trim()) parts.push(`Location: ${loc.trim()}`);
    return `[${parts.join(" | ")}]`;
  }
);

// 4) Ensure exactly one blank line before/after headers; collapse >1 consecutive blank lines
const lines = t.split("\n");
const CHAPTER_RE = /^===\s*CHAPTER\s+\d{2}(?:\s*:\s*.+?)?\s*===\s*$/i;
const SCENE_RE = /^\[SCENE:\s*CH\d{2}_S\d{2}(?:\s*\|\s*POV:\s*[^\]|]+)?(?:\s*\|\s*Location:\s*[^\]|]+)?\]$/i;

function ensureBlankAroundHeader(idx: number) {
  // before
  if (idx > 0 && lines[idx - 1].trim() !== "") lines.splice(idx, 0, "");
  // after
  const afterIdx = idx + 1;
  if (afterIdx < lines.length && lines[afterIdx].trim() !== "") lines.splice(afterIdx, 0, "");
}

for (let i = 0; i < lines.length; i++) {
  if (CHAPTER_RE.test(lines[i]) || SCENE_RE.test(lines[i])) {
    ensureBlankAroundHeader(i);
    i++; // skip the blank line we may have inserted after
  }
}

// Collapse 3+ blank lines to a single blank line
let out = lines.join("\n").replace(/\n{3,}/g, "\n\n");

// 5) Ensure single final newline
if (!out.endsWith("\n")) out += "\n";

// Backup, then write in place
copyFileSync(file, `${file}.bak.${Date.now()}`);
writeFileSync(file, out, "utf-8");

console.log(
  `✅ Normalized ${basename(file)}. A backup was saved as ${basename(file)}.bak.<timestamp>`
);
