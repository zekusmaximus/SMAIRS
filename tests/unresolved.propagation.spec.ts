import { describe, it, expect } from 'vitest';
import { importManuscript } from '../src/features/manuscript/importer.js';
import { segmentScenes } from '../src/features/manuscript/segmentation.js';
import { analyzeScenes } from '../src/features/manuscript/analyzer.js';
import { computeSnapshot, diffCaches, CacheFile } from '../src/features/manuscript/cache.js';
import { generateReport } from '../src/features/manuscript/reports.js';

/**
 * This test ensures that when anchoring fails for a scene between two cache snapshots,
 * the unresolved delta surfaces the last attempted tier & confidence in the report.
 */

describe('unresolved propagation: tier & confidence', () => {
  it('carries tier/confidence into unresolved report list', () => {
    // Build an initial manuscript with one scene; snapshot it.
    const base = [
      '=== CHAPTER 1 ===',
      '[SCENE: CH01_S01]',
      'Unique alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.',
      ''
    ].join('\n');
    const ms1 = importManuscript(base);
    const scenes1 = segmentScenes(ms1);
    const snap1 = computeSnapshot(ms1, scenes1);

    // Create a mutated manuscript where the scene text is heavily changed so anchoring fails entirely.
    // We also shift content so prior offset doesn't help and remove distinctive tokens.
    const mutated = [
      '=== chapter 1 ===', // changed case so previous preContext (uppercase) won't match
      '[scene: ch01_s01]', // lowercase header; segmentation regex is case-insensitive
      'Completely rewritten content wholly different words here with no overlap.',
      ''
    ].join('\n');
    const ms2 = importManuscript(mutated);
    const scenes2 = segmentScenes(ms2);
    const snap2 = computeSnapshot(ms2, scenes2);

    // Diff with full text so anchoring tiers attempt.
  const delta = diffCaches(snap1 as CacheFile, snap2, ms2.rawText);
  expect(delta.unresolved.length).toBe(1); // unresolved since content changed drastically
  const unresolved = delta.unresolved[0];
  expect(unresolved, 'expected unresolved delta entry').toBeDefined();
  if (!unresolved) return; // TS narrowing for strict noUncheckedIndexedAccess
  // Tier should be present (last attempted tier — expected 4 after exhausting strategies)
  expect(unresolved.tier).toBeDefined();
  expect(unresolved.tier).toBeGreaterThanOrEqual(1);
  expect(unresolved.confidence).toBeDefined(); // currently 0 placeholder from trace when failing

    // Ensure report surfaces the numeric tier instead of n/a
    const analysis = analyzeScenes(scenes2);
    const report = generateReport(ms2, scenes2, analysis, delta);
    const line = report.split('\n').find(l => l.includes('Unresolved Scenes'));
    expect(line).toBeDefined();
    // Find the unresolved detail line containing last tier value
    const detail = report.split('\n').find(l => l.includes('(prior') && l.includes('last tier'));
    expect(detail).toBeDefined();
    if (detail) {
      expect(detail).not.toContain('last tier n/a');
    }
  });
});
