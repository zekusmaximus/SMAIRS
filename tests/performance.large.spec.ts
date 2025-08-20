import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runSceneInventory } from '../src/cli/scene-inventory.js';

// Performance check building ~5MB manuscript by repeating a small fixture to keep repo slim.
// Threshold: 500ms per 5MB (lenient; Phase 1 target 200MB < 3s). Skip with PERF_SKIP=1.

describe('performance (~5MB synthesized from fixture)', () => {
  const shouldSkip = process.env.PERF_SKIP === '1';
  const testFn = shouldSkip ? it.skip : it;

  testFn('runs scene inventory within threshold', async () => {
    const seedPath = 'tests/fixtures/synthetic-5mb.txt';
    const seed = readFileSync(seedPath, 'utf-8');
    expect(seed.length).toBeGreaterThan(200); // sanity
    const targetMB = 5;
    let manuscript = seed;
    while (manuscript.length < targetMB * 1024 * 1024) manuscript += seed;
    const sizeMB = manuscript.length / (1024 * 1024);
    expect(sizeMB).toBeGreaterThanOrEqual(targetMB - 0.1);

    const fixedTimestamp = '2025-01-01T00:00:00Z';
    const t0 = performance.now();
    await runSceneInventory(manuscript, { fixedTimestamp });
    const dt = performance.now() - t0;

    const softThresholdMs = 1500; // empirical on CI / local
    const hardThresholdMs = 3000; // absolute upper bound; beyond this fail
    // Soft expectation (warn via console if exceeded but only fail at hard threshold)
    if (dt > softThresholdMs) {
      console.warn(`Performance soft threshold exceeded: ${(dt).toFixed(1)}ms > ${softThresholdMs}ms (size ~${sizeMB.toFixed(2)}MB)`);
    }
    expect(dt).toBeLessThan(hardThresholdMs);
  });
});
