#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { importManuscript } from "../features/manuscript/importer.js";
import { segmentScenes } from "../features/manuscript/segmentation.js";
import { analyzeScenes } from "../features/manuscript/analyzer.js";
import { generateReport } from "../features/manuscript/reports.js";
import { computeSnapshot, readPrevCache, writeCache, diffCaches } from "../features/manuscript/cache.js";

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

  // 🔹 change ledger
  const prev = readPrevCache();
  const current = computeSnapshot(manuscript, scenes);
  const delta = diffCaches(prev, current);
  writeCache(current);

  const report = generateReport(manuscript, scenes, analysis, delta);
  writeFileSync(outputPath, report, "utf-8");

  console.log(`✅ Report saved to ${outputPath}`);
  console.log(`   Chapters: ${manuscript.chapters.length}`);
  console.log(`   Scenes: ${scenes.length}`);
  console.log(`   Words: ${manuscript.wordCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
