import { scoreCandidate } from '../../llm/fast-scorer.js';
import { describe, it, expect } from 'vitest';

const candidate = { id: 'single:sc1', type: 'single' as const, scenes: ['sc1'] as string[], startOffset: 0, endOffset: 10, totalWords: 600, hookScore: 0.5, actionDensity: 0.2, mysteryQuotient: 0.3, characterIntros: 1, dialogueRatio: 0.4 };

describe('fast-scorer (mock)', () => {
  it('scores candidate with cache reuse', async () => {
    process.env.LLM_OFFLINE = '1';
  const req = { candidate, globalSynopsis: 'syn', focusMetrics: ['hook', 'action'] as ('hook'|'action'|'mystery'|'character')[] };
    const r1 = await scoreCandidate(req);
    const r2 = await scoreCandidate(req);
    expect(r1.hookScore).toBeGreaterThanOrEqual(0);
    expect(r1.hookScore).toEqual(r2.hookScore);
  });
});
