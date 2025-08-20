import { describe, it, expect } from 'vitest';
import { runSceneInventory } from '../src/cli/scene-inventory.js';

// Performance / scalability benchmark (skipped by default)
// Enable manually when profiling: change it.skip to it.only / it

describe('performance', () => {
  it.skip('processes ~200MB manuscript under 3s', async () => {
    const targetBytes = 200 * 1024 * 1024; // ~200MB

    // Build a synthetic manuscript: repeated chapters with one scene each.
    // Keep each block reasonably sized to avoid huge string concatenation overhead per iteration.
    const chapterTemplate = (idx: number) => {
      const ch = String(idx + 1).padStart(2, '0');
      return `=== CHAPTER ${idx + 1} ===\n[SCENE: CH${ch}_S01]\nBody text with filler dialogue. "Some quoted text for ratio." More filler words to pad size.\n\n`;
    };

    const parts: string[] = [];
    let size = 0;
    let i = 0;
    while (size < targetBytes) {
      const block = chapterTemplate(i);
      parts.push(block);
      size += Buffer.byteLength(block, 'utf-8');
      i++;
    }
    const manuscript = parts.join('');
    // Sanity check size (allow a little overshoot)
    expect(manuscript.length).toBeGreaterThanOrEqual(targetBytes * 0.98);

    const fixedTimestamp = '2025-01-01T00:00:00Z';
    const t0 = performance.now();
    await runSceneInventory(manuscript, { fixedTimestamp });
    const dt = performance.now() - t0;

    expect(dt).toBeLessThan(3000); // < 3s
  });
});
