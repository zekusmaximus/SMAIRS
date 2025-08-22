import { describe, it, expect, beforeAll } from 'vitest';
import { performance } from 'perf_hooks';
import { importManuscript } from '../../src/features/manuscript/importer.js';
import { segmentScenes } from '../../src/features/manuscript/segmentation.js';
import { generateCandidates } from '../../src/features/manuscript/opening-candidates.js';
import { OpeningLabOrchestrator } from '../../src/features/manuscript/opening-lab-orchestrator.js';
import type { Manuscript } from '../../src/features/manuscript/types.js';

function generateLargeManuscript(words: number): string {
  const perScene = 800; // ~words per scene
  const scenesNeeded = Math.ceil(words / perScene);
  const blocks: string[] = ['=== CHAPTER 1 ==='];
  for (let i = 1; i <= scenesNeeded; i++) {
    blocks.push(`[SCENE: CH01_S${String(i).padStart(2,'0')}]`);
    const lines: string[] = [];
    const sentence = i % 2 === 0 ? '"Dialog line," she said. ' : 'He ran toward the alley. ';
    const repeat = Math.ceil(perScene / 6);
    lines.push(sentence.repeat(repeat));
    blocks.push(lines.join(' ').trim());
  }
  return blocks.join('\n');
}

describe('Performance Benchmarks', () => {
  beforeAll(() => {
    process.env.LLM_OFFLINE = '1';
  });

  it('completes full analysis under 3 seconds for 120k words', async () => {
    const manuscriptText = generateLargeManuscript(120000);

    const start = performance.now();

    const ms = importManuscript(manuscriptText);
    const scenes = segmentScenes(ms);
    const candidates = generateCandidates(scenes);
    const orchestrator = new OpeningLabOrchestrator();
    await orchestrator.analyzeOpenings(ms as Manuscript, candidates);

    const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(3000);
  console.log(`Pipeline completed in ${elapsed.toFixed(0)}ms`);
  });
});
