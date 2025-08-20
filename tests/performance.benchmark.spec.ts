import { describe, it, expect } from 'vitest';
import { runSceneInventory } from '../src/cli/scene-inventory.js';

/**
 * Performance benchmark (skipped by default / local only).
 * Generates ~120k word synthetic manuscript and measures full pipeline time & memory.
 */

describe('performance benchmark (local)', () => {
  it.skip('pipeline processes 120k words under 3000ms and <200MB heap', async () => {
    // Build synthetic manuscript: 60 chapters * 20 scenes * ~100 words per scene ~120k words
    const chapters = 60;
    const scenesPerChapter = 20; // total scenes 1200
    const wordsPerScene = 100; // approximate

    const makeSceneBody = (ch: number, sc: number) => {
      const baseTokens: string[] = [];
      for (let i = 0; i < wordsPerScene; i++) {
        // deterministic pseudo-content with some variety
        baseTokens.push(`w${(i % 50).toString(36)}_${ch}_${sc}`);
      }
      // Add some quoted dialogue fragments to exercise dialogue ratio & hook scoring
      baseTokens.splice(10, 0, '"Hello"');
      baseTokens.splice(30, 0, '"Question?"');
      baseTokens.splice(50, 0, '"Exclaim!"');
      return baseTokens.join(' ') + '.';
    };

    let manuscript = '';
    for (let ch = 1; ch <= chapters; ch++) {
      manuscript += `=== CHAPTER ${String(ch).padStart(2,'0')} ===\n`;
      for (let sc = 1; sc <= scenesPerChapter; sc++) {
        manuscript += `[SCENE: CH${String(ch).padStart(2,'0')}_S${sc.toString().padStart(2,'0')}]\n`;
        manuscript += makeSceneBody(ch, sc) + '\n';
      }
    }

    // Quick word count sanity (~ chapters * scenesPerChapter * wordsPerScene )
    const wc = manuscript.trim().split(/\s+/).length;
    expect(wc).toBeGreaterThan(110_000);

    const start = performance.now();
    const beforeMem = process.memoryUsage().heapUsed;
    const run = await runSceneInventory(manuscript, { fixedTimestamp: '2025-01-01T00:00:00Z' });
    const elapsed = performance.now() - start;
    const afterMem = process.memoryUsage().heapUsed;
    const deltaMB = (afterMem - beforeMem) / (1024 * 1024);

    // Basic sanity on output
    expect(run.report).toMatch(/Scenes:/i); // header line

    // Performance assertions
    expect(elapsed).toBeLessThan(3000); // <3s
    expect(deltaMB).toBeLessThan(200); // <200MB heap growth
  });
});
