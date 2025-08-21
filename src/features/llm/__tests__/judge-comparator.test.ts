import { judgeCandidates } from '../../llm/judge-comparator.js';
import { describe, it, expect } from 'vitest';

// Smoke test for mock deterministic ranking

describe('judge-comparator (mock)', () => {
  it('produces rankings', async () => {
    process.env.LLM_OFFLINE = '1';
    const candidates = [
      { candidateId: 'a', hookScore: 0.7, actionDensity: 0.3, mysteryQuotient: 0.2, characterIntros: 1, confidence: 0.8 },
      { candidateId: 'b', hookScore: 0.6, actionDensity: 0.4, mysteryQuotient: 0.4, characterIntros: 2, confidence: 0.9 },
    ];
    const res = await judgeCandidates({ candidates, criteria: { originality: 1, clarity: 1, pace: 1, voice: 1 }, genre: 'fantasy', targetAudience: 'YA' });
    expect(res.rankings.length).toBeGreaterThan(0);
  });
});
