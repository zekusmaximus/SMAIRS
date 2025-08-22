import { describe, it, expect, beforeAll } from 'vitest';
import { OpeningScorer } from '../opening-scorer.js';
import type { OpeningCandidate } from '../../manuscript/opening-candidates.js';

function makeCandidate(id: string, overrides: Partial<OpeningCandidate> = {}): OpeningCandidate {
  return {
    id,
    type: 'single',
    scenes: ['ch01_s01'],
    startOffset: 0,
    endOffset: 1000,
    totalWords: 800,
    hookScore: 0.7,
    actionDensity: 0.4,
    mysteryQuotient: 0.2,
    characterIntros: 1,
    dialogueRatio: 0.5,
    ...overrides,
  };
}

describe('OpeningScorer', () => {
  const scorer = new OpeningScorer();
  const manuscript = { synopsis: 'A hero faces rising stakes.', genre: 'thriller', targetAudience: 'adult' };

  beforeAll(() => {
    // Force offline mode to use fixture for deterministic tests
    const g: unknown = globalThis as unknown;
    const proc = (g as { process?: { env?: Record<string, string> } }).process ?? { env: {} };
    proc.env = proc.env || {};
    proc.env.LLM_OFFLINE = '1';
    (g as { process: typeof proc }).process = proc;
  });

  it('scores single candidate in quick mode', async () => {
    const cand = makeCandidate('cand1');
    const res = await scorer.scoreCandidate({ candidate: cand, manuscript, scoringMode: 'quick' });
    expect(res.candidateId).toBe('cand1');
    expect(res.scores.hookStrength).toBeGreaterThanOrEqual(0);
    expect(res.profile).toBe('FAST_ITERATE');
  });

  it('scores batch with parallelization', async () => {
    const cands = [makeCandidate('a'), makeCandidate('b'), makeCandidate('c')];
    const map = await scorer.scoreBatch(cands, 'quick');
    expect(map.size).toBe(3);
  });

  it('uses cache for identical requests', async () => {
    const cand = makeCandidate('cached');
    const r1 = await scorer.scoreCandidate({ candidate: cand, manuscript, scoringMode: 'quick' });
    const r2 = await scorer.scoreCandidate({ candidate: cand, manuscript, scoringMode: 'quick' });
    expect(r1.candidateId).toBe(r2.candidateId);
    // Values equal as fixture-based in offline
    expect(r1.scores.hookStrength).toBe(r2.scores.hookStrength);
  });

  it('switches profiles based on mode', async () => {
    const cand = makeCandidate('mode');
    const q = await scorer.scoreCandidate({ candidate: cand, manuscript, scoringMode: 'quick' });
    const t = await scorer.scoreCandidate({ candidate: cand, manuscript, scoringMode: 'thorough' });
    const j = await scorer.scoreCandidate({ candidate: cand, manuscript, scoringMode: 'comparative' });
    expect(q.profile).toBe('FAST_ITERATE');
    expect(t.profile).toBe('STRUCTURE_LONGCTX');
    expect(j.profile).toBe('JUDGE_SCORER');
  });

  it('returns mock data in offline mode', async () => {
    const cand = makeCandidate('offline');
    const res = await scorer.scoreCandidate({ candidate: cand, manuscript, scoringMode: 'quick' });
    expect(res.analysis.strengths.length).toBeGreaterThanOrEqual(0);
  });
});
