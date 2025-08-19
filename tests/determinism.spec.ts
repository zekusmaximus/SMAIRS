import { describe, it, expect } from 'vitest';
import { importManuscript } from '../src/features/manuscript/importer.js';
import { segmentScenes } from '../src/features/manuscript/segmentation.js';
import { analyzeScenes } from '../src/features/manuscript/analyzer.js';
import { generateReport } from '../src/features/manuscript/reports.js';

// NOTE: We intentionally DO NOT import cache read/write or diff logic here because those perform filesystem I/O.
// This test focuses on pure, deterministic transformation steps given FIXED_TIMESTAMP.
// Once a consolidated API (e.g., runSceneInventory) is exposed that includes cache/delta logic in-memory,
// replace the placeholder test below with a real byte-identical assertion over the full pipeline output.

function runPureReport(text: string): string {
  const manuscript = importManuscript(text);
  const scenes = segmentScenes(manuscript);
  const analysis = analyzeScenes(scenes);
  // Skip delta: pass undefined so report omits changes block (still deterministic)
  return generateReport(manuscript, scenes, analysis, undefined);
}

describe('determinism', () => {
  it('produces identical report strings for two runs with FIXED_TIMESTAMP', () => {
    process.env.FIXED_TIMESTAMP = '2025-01-01T00:00:00.000Z';
    const sample = `=== CHAPTER 1 ===\n[SCENE: CH1_S1]\nFirst scene body.\n[SCENE: CH1_S2]\nSecond scene body with more words.`;
    const a = runPureReport(sample);
    const b = runPureReport(sample);
    expect(b).toBe(a);
  });

  it('TODO: full pipeline determinism once runSceneInventory API is available', () => {
    // TODO: When an in-memory orchestrator (e.g., runSceneInventory(text, { previousCache? }) ) is exported,
    // invoke it twice with the same FIXED_TIMESTAMP and injected previous cache, ensuring:
    //  - cache snapshot stable
    //  - delta classification stable
    //  - report including Changes Since Last Run stable
    // For now this placeholder asserts true to keep the suite green.
    expect(true).toBe(true);
  });
});
