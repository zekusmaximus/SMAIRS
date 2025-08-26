import { describe, it, expect } from 'vitest';
import { SynopsisGenerator } from '../synopsis-generator.js';
import type { Manuscript } from '../../manuscript/types.js';
import type { OpeningCandidate } from '../../manuscript/opening-candidates.js';

describe('SynopsisGenerator', () => {
  it('generates heuristic synopsis under 1000 words', async () => {
    const gen = new SynopsisGenerator();
  const manuscript: Manuscript = { id: 'm1', title: 'T', rawText: '=== CHAPTER 01 ===\n[SCENE: CH01_S01]\nAlice is a detective. The device is engineered.\n', checksum: 'x', wordCount: 12, chapters: [{ id:'ch01', index:1, startOffset:0 }] };
  const opening: OpeningCandidate = { id: 'single:ch01_s01', type: 'single', scenes: ['ch01_s01'], startOffset: 0, endOffset: manuscript.rawText.length, totalWords: 9, hookScore: 0.5, actionDensity: 0.1, mysteryQuotient: 0.2, characterIntros: 2, dialogueRatio: 0.2 };
  const syn = await gen.generateFromManuscript(manuscript, opening, 'onePage');
    expect(syn.text.split(/\s+/).length).toBeLessThanOrEqual(1000);
    expect(syn.keyPoints.length).toBeGreaterThan(0);
  });
});
