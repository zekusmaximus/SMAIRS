import { describe, it, expect } from 'vitest';
import { runSceneInventory } from '../src/cli/scene-inventory.js';

describe('determinism', () => {
  it('produces identical full pipeline reports (including delta section) for two runs with fixed timestamp', async () => {
    const fixed = '2025-01-01T00:00:00Z';
    const sample = [
      '=== CHAPTER 1 ===',
      '[SCENE: CH1_S1]',
      'First scene body with some unique tokens AlphaBetaGamma.',
      '[SCENE: CH1_S2]',
      'Second scene body with more words and AlphaBetaGamma reused once.',
    ].join('\n');

    const t0 = Date.now();
    const run1 = await runSceneInventory(sample, { fixedTimestamp: fixed });
    const run2 = await runSceneInventory(sample, { fixedTimestamp: fixed });
    const elapsed = Date.now() - t0;

    expect(run1.report).toBe(run2.report);
    expect(elapsed).toBeLessThan(200); // performance guard for small sample

    // Spot-check that delta section lists expected added scenes (both runs treat as first run)
    expect(run1.report).toMatch(/Added: 2/);
    expect(run1.report).toMatch(/ch01_s01/i);
    expect(run1.report).toMatch(/ch01_s02/i);
  });
});
