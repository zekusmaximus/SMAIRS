import { analyzeContext } from '../context-analyzer.js';
import type { Scene } from '../types.js';

function makeScene(id: string, text: string): Scene {
  return {
    id,
    chapterId: 'ch1',
    startOffset: 0,
    endOffset: text.length,
    text,
    wordCount: text.split(/\s+/).length,
    dialogueRatio: 0,
  };
}

describe('context analyzer coreference resolution', () => {
  it('flags pronoun with no antecedent', () => {
    const scene = makeScene('s1', 'He ran quickly.');
    const gaps = analyzeContext(scene, [scene], 0);
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.confusion.severity).toBe('high');
    expect(gaps[0]?.confidence).toBeGreaterThan(0.5);
  });

  it('resolves pronoun to previous scene', () => {
    const scene1 = makeScene('s1', 'Marcus looked around.');
    const scene2 = makeScene('s2', 'He ran quickly.');
    const gaps = analyzeContext(scene2, [scene1, scene2], 1);
    expect(gaps.length).toBe(0);
  });
});
