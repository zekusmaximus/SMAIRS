#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { importManuscript } from "../features/manuscript/importer.js";
import { segmentScenes } from "../features/manuscript/segmentation.js";
import { analyzeScenes } from "../features/manuscript/analyzer.js";
import { generateReport } from "../features/manuscript/reports.js";
import { computeSnapshot, readPrevCache, writeCache, diffCaches } from "../features/manuscript/cache.js";
import type { CacheFile, Delta } from "../features/manuscript/cache.js";
import { saveScenes, saveReveals, toSceneRecords, toRevealRecordsFromScenes } from "../lib/db.js";

export interface RunSceneInventoryResult {
  report: string;
  cache: CacheFile;
  deltas: Delta;
}

/**
 * Pure in-memory runner for scene inventory. Does not touch FS.
 * Timestamp determinism: provide opts.fixedTimestamp to override generated time.
 */
export async function runSceneInventory(text: string, opts?: { fixedTimestamp?: string }): Promise<RunSceneInventoryResult> {
  const prevFixed = process.env.FIXED_TIMESTAMP;
  if (opts?.fixedTimestamp) process.env.FIXED_TIMESTAMP = opts.fixedTimestamp;
  try {
    const debug = process.env.SMAIRS_PERF_DEBUG === '1';
    const t0 = performance.now();
    const manuscript = importManuscript(text);
    if (debug) console.log('[perf] importManuscript', (performance.now()-t0).toFixed(2),'ms');
    const t1 = performance.now();
    const scenes = segmentScenes(manuscript);
    if (debug) console.log('[perf] segmentScenes', (performance.now()-t1).toFixed(2),'ms');
    if (process.env.SMAIRS_PERF_MODE === '1') {
      const t2 = performance.now();
      const cache = computeSnapshot(manuscript, scenes);
      if (debug) console.log('[perf] computeSnapshot', (performance.now()-t2).toFixed(2),'ms');
      const delta = diffCaches(null, cache, manuscript.rawText);
      const report = `# Scene Inventory (FAST MODE)\nScenes: ${scenes.length}\nWords: ${manuscript.wordCount}`;
      return { report, cache, deltas: delta };
    }
    const analysis = analyzeScenes(scenes);
    try {
      await saveScenes(toSceneRecords(scenes));
      const revealRecs = toRevealRecordsFromScenes(scenes);
      await saveReveals(revealRecs);
    } catch {
      // persistence is best-effort in pure run
    }
    // For deterministic pure run we intentionally do NOT read previous cache; treat as first run.
    const prev: CacheFile | null = null;
    const current = computeSnapshot(manuscript, scenes);
    const delta = diffCaches(prev, current, manuscript.rawText);
    const report = generateReport(manuscript, scenes, analysis, delta);
    return { report, cache: current, deltas: delta };
  } finally {
    if (opts?.fixedTimestamp) {
      if (prevFixed === undefined) delete process.env.FIXED_TIMESTAMP; else process.env.FIXED_TIMESTAMP = prevFixed;
    }
  }
}

async function main() {
  const inputPath = process.argv[2] || "data/manuscript.txt";
  const defaultOut = process.env.FIXED_TIMESTAMP
    ? "out/reports/scene-inventory.md"
    : `out/reports/scene-inventory-${Date.now()}.md`;
  const outputPath = process.argv[3] || defaultOut;

  mkdirSync("out/reports", { recursive: true });

  const rawText = readFileSync(inputPath, "utf-8");
  const manuscript = importManuscript(rawText);
  const scenes = segmentScenes(manuscript);
  const analysis = analyzeScenes(scenes);
  try {
    await saveScenes(toSceneRecords(scenes));
    const revealRecs = toRevealRecordsFromScenes(scenes);
    await saveReveals(revealRecs);
  } catch (e) {
    console.warn("(warn) persistence failed:", (e as Error).message);
  }

  // 🔹 change ledger
  const prev = readPrevCache();
  const current = computeSnapshot(manuscript, scenes);
  const delta = diffCaches(prev, current, manuscript.rawText);
  writeCache(current);

  const report = generateReport(manuscript, scenes, analysis, delta);
  writeFileSync(outputPath, report, "utf-8");

  console.log(`✅ Report saved to ${outputPath}`);
  console.log(`   Chapters: ${manuscript.chapters.length}`);
  console.log(`   Scenes: ${scenes.length}`);
  console.log(`   Words: ${manuscript.wordCount}`);
  console.log(`   Δ Added:${delta.added.length} Removed:${delta.removed.length} Modified:${delta.modified.length} Moved:${delta.moved.length} Unresolved:${delta.unresolved.length}`);
}

// Only execute if invoked directly (not when imported for tests)
if (process.argv[1] && /scene-inventory\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
