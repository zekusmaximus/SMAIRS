import { analyzeStructure } from '../../llm/structure-analyzer.js';
import { describe, it, expect } from 'vitest';

// Basic smoke test for mock pipeline

describe('structure-analyzer (mock)', () => {
  it('returns deterministic response for same manuscript', async () => {
    process.env.LLM_OFFLINE = '1';
    const manuscript = 'word '.repeat(1200);
    const scenes = [{ id: 'sc1', chapterId: 'ch01', startOffset: 0, endOffset: 10, text: 'Scene text', wordCount: 200, dialogueRatio: 0.2 }];
  const reveals: { id: string; description: string; type: 'character'; confidence: number; entities: string[]; sceneId: string }[] = [];
    const r1 = await analyzeStructure({ manuscript, scenes, reveals, mode: 'full' });
    const r2 = await analyzeStructure({ manuscript, scenes, reveals, mode: 'full' });
    expect(r1.globalSynopsis).toEqual(r2.globalSynopsis);
    expect(r1.hotspots.length).toBeGreaterThan(0);
  });
});
