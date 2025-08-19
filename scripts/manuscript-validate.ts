// scripts/manuscript-validate.ts
// Usage: npm run manuscript:validate -- data/manuscript.txt
// Validates chapter/scene headers, IDs, spacing, line-endings (LF), final newline, tabs, forbidden chars.

import { readFileSync } from "fs";

const CHAPTER_RE = /^===\s*CHAPTER\s+(\d{1,3})(?:\s*:\s*(.+?))?\s*===\s*$/i;
const SCENE_RE = /^\[SCENE:\s*(CH\d{1,3}_S\d{1,3})\s*(?:\|\s*POV:\s*([^\]|]+))?\s*(?:\|\s*Location:\s*([^\]|]+))?\s*\]\s*$/i;

const file = process.argv[2] || "data/manuscript.txt";
const raw = readFileSync(file, "utf-8");

// Basic newline checks
const hasCR = raw.includes("\r");
const endsWithLF = raw.endsWith("\n");

const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const lines = text.split("\n");

const errors: string[] = [];
const warnings: string[] = [];

if (hasCR) warnings.push("CR or CRLF line endings detected; importer will normalize to LF." );
if (!endsWithLF) warnings.push("File does not end with a final newline; importer will add one.");

const seenSceneIds = new Set<string>();
let chapterCount = 0;
let sceneCount = 0;
let lastNonBlank = -1;

function pad(n: number) { return String(n).padStart(2, "0"); }

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (/\t/.test(line)) warnings.push(`Line ${i+1}: tab character found.`);
  if (/[ \t]+$/.test(line)) warnings.push(`Line ${i+1}: trailing whitespace.`);

  const chap = CHAPTER_RE.exec(line);
  if (chap) {
    chapterCount++;
    const nRaw = parseInt(chap[1], 10);
    if (nRaw < 1 || nRaw > 999) errors.push(`Line ${i+1}: chapter number out of range.`);
    // Enforce one blank line after chapter header (if not EOF and next non-blank is immediately a header/scene)
    const next = lines[i+1] ?? "";
    if (next.trim() !== "") warnings.push(`Line ${i+1}: expected a blank line after chapter header.`);
    lastNonBlank = i;
    continue;
  }

  const scene = SCENE_RE.exec(line);
  if (scene) {
    sceneCount++;
    const id = scene[1]; // e.g., CH01_S01
    const idParts = /CH(\d{1,3})_S(\d{1,3})/i.exec(id)!;
    const ch = parseInt(idParts[1], 10);
    const sc = parseInt(idParts[2], 10);

    // Zero-padding recommendation
    if (idParts[1].length < 2 || idParts[2].length < 2) {
      warnings.push(`Line ${i+1}: scene ID "${id}" is not zero-padded (expected CH${pad(ch)}_S${pad(sc)}).`);
    }

    // Unique ID check
    const normId = `ch${pad(ch)}_s${pad(sc)}`;
    if (seenSceneIds.has(normId)) {
      errors.push(`Line ${i+1}: duplicate scene ID "${id}".`);
    } else {
      seenSceneIds.add(normId);
    }

    // Forbidden chars inside fields
    const pov = (scene[2] || "").trim();
    const loc = (scene[3] || "").trim();
    if (/[|\]]/.test(pov)) errors.push(`Line ${i+1}: POV contains forbidden '|' or ']' characters.`);
    if (/[|\]]/.test(loc)) errors.push(`Line ${i+1}: Location contains forbidden '|' or ']' characters.`);

    // Spacing recommendations
    const prev = lines[i-1] ?? "";
    if (prev.trim() !== "") warnings.push(`Line ${i+1}: expected a blank line before scene header.`);
    const next = lines[i+1] ?? "";
    if (next.trim() === "") {
      // OK – blank line after header
    } else {
      warnings.push(`Line ${i+1}: expected a blank line after scene header.`);
    }

    lastNonBlank = i;
    continue;
  }

  // Optional: flag multiple consecutive blank lines
  if (line.trim() === "" && lastNonBlank >= 0 && (i - lastNonBlank) > 2) {
    warnings.push(`Line ${i+1}: multiple consecutive blank lines.`);
  }
  if (line.trim() !== "") lastNonBlank = i;
}

// Basic manuscript presence checks
if (chapterCount === 0) errors.push("No chapter headers found.");
if (sceneCount === 0) errors.push("No scene headers found.");

// Report
const header = `Validated "${file}" — Chapters: ${chapterCount}, Scenes: ${sceneCount}`;
const divider = "-".repeat(header.length);
console.log(header);
console.log(divider);

if (errors.length) {
  console.error("\nERRORS:");
  for (const e of errors) console.error("  • " + e);
}
if (warnings.length) {
  console.warn("\nWARNINGS:");
  for (const w of warnings) console.warn("  • " + w);
}

if (errors.length) {
  console.error(`\n❌ Validation failed with ${errors.length} error(s).`);
  process.exit(1);
} else {
  console.log(`\n✅ Validation passed with ${warnings.length} warning(s).`);
  process.exit(0);
}
