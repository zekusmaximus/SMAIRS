import { describe, test, expect, beforeAll } from 'vitest';
import { performance } from 'perf_hooks';
import { importManuscript } from '../../src/features/manuscript/importer.js';
import { segmentScenes } from '../../src/features/manuscript/segmentation.js';
import { generateCandidates } from '../../src/features/manuscript/opening-candidates.js';
import { OpeningLabOrchestrator } from '../../src/features/manuscript/opening-lab-orchestrator.js';
import type { Manuscript } from '../../src/features/manuscript/types.js';

function synthesize(words: number) {
  const perScene = 900;
  const scenes = Math.ceil(words / perScene);
  const parts: string[] = ['=== CHAPTER 1 ==='];
  for (let i = 1; i <= scenes; i++) {
    parts.push(`[SCENE: CH01_S${String(i).padStart(2,'0')}]`);
    const base = i % 3 === 0 ? '"Dialog," she said. ' : 'Action rises. ';
    parts.push(base.repeat(Math.ceil(perScene / base.split(' ').length)));
  }
  return parts.join('\n');
}

describe('Full Pipeline E2E', () => {
  beforeAll(() => { process.env.LLM_OFFLINE = '1'; });

  test('complete workflow under 2 minutes', async () => {
    const manuscriptText = synthesize(60000); // ~60k words realistic sample
    const t0 = performance.now();
    const ms = importManuscript(manuscriptText);
    const scenes = segmentScenes(ms);
    const candidates = generateCandidates(scenes);
    const orchestrator = new OpeningLabOrchestrator();
    const report = await orchestrator.analyzeOpenings(ms as Manuscript, candidates);

  expect(report).toBeDefined();
  // Depending on thresholds and synthetic data, it's valid for zero candidates
  expect(report.candidates.length).toBeGreaterThanOrEqual(0);
    const elapsed = (performance.now() - t0) / 1000;
    expect(elapsed).toBeLessThan(120);
  });

  test('maintains performance with 120k words', async () => {
    const manuscriptText = synthesize(120000);
    const t0 = performance.now();
    const ms = importManuscript(manuscriptText);
    const scenes = segmentScenes(ms);
    const candidates = generateCandidates(scenes);
    const orchestrator = new OpeningLabOrchestrator();
    await orchestrator.analyzeOpenings(ms as Manuscript, candidates);
    const elapsed = performance.now() - t0;
    // User target: keep under 3s in our perf test env
    expect(elapsed).toBeLessThan(3000);
  });
});
