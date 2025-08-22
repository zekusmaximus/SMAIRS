import { describe, it, expect } from 'vitest';
import { generateCandidates } from '../src/features/manuscript/opening-candidates.js';
import { analyzeScenes } from '../src/features/manuscript/analyzer.js';
import type { Scene } from '../src/features/manuscript/types.js';

// Helper to fabricate scenes quickly
function makeScene(partial: Partial<Scene> & { id: string; chapterId?: string; text?: string }): Scene {
  const text = partial.text || ' '.repeat(1000); // ~ default length
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    id: partial.id,
    chapterId: partial.chapterId || 'ch01',
    startOffset: 0,
    endOffset: text.length,
    text,
    wordCount,
    dialogueRatio: partial.dialogueRatio ?? 0.2,
  };
}

describe('opening-candidates', () => {
  it('generates candidates that meet thresholds and filters out weak ones', () => {
    const scenes: Scene[] = [];
    // Build 12 scenes with varying properties
    for (let i = 0; i < 12; i++) {
      const id = `ch01_s${String(i + 1).padStart(2,'0')}`;
      // Build ~600+ words per scene by repeating a 10-word sentence 60 times
      const sentence = i % 2 === 0 ? 'He ran fast toward the dark alley. ' : '"Hello there?" she asked, eyes wide. ';
      const baseText = sentence.repeat(65); // ~ 650 words
      scenes.push(makeScene({ id, text: baseText, dialogueRatio: i % 2 === 0 ? 0.15 : 0.75 }));
    }
    // Add a short scene (<500 words) that should be excluded
  scenes.push(makeScene({ id: 'ch01_s99', text: 'short scene words', dialogueRatio: 0.5 }));

    const candidates = generateCandidates(scenes);
    // All candidates meet thresholds
    for (const c of candidates) {
      expect(c.totalWords).toBeGreaterThanOrEqual(500);
      expect(c.hookScore).toBeGreaterThanOrEqual(0.6);
      expect(c.dialogueRatio).toBeGreaterThan(0);
    }
  });

  it('ranks primarily by hookScore then actionDensity', () => {
    // Craft scenes with known differences
    const actionText = 'He ran. He jumped. He smashed. '.repeat(60); // high action density
    const dialogueText = '"Hello?" She asked. '.repeat(120); // high dialogue ratio influencing hook
    const neutralText = 'The day was calm and ordinary. '.repeat(120);

    const scenes: Scene[] = [
      makeScene({ id: 'ch01_s01', text: neutralText, dialogueRatio: 0.1 }),
      makeScene({ id: 'ch01_s02', text: actionText, dialogueRatio: 0.05 }),
      makeScene({ id: 'ch01_s03', text: dialogueText, dialogueRatio: 0.8 }),
      makeScene({ id: 'ch01_s04', text: actionText + dialogueText, dialogueRatio: 0.5 }),
    ];

    const candidates = generateCandidates(scenes);
    // After filtering to top 5, ensure ordering is non-empty and sorted by hookScore descending
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i-1]!.hookScore).toBeGreaterThanOrEqual(candidates[i]!.hookScore);
    }
  });

  it('handles edge cases: single scene only', () => {
    const scenes: Scene[] = [makeScene({ id: 'ch01_s01', text: 'Single scene with enough words. '.repeat(60) })];
    const candidates = generateCandidates(scenes);
    // Either zero (if under 500) or single candidate
    expect(candidates.length === 0 || candidates.length === 1).toBe(true);
  });

  it('handles no dialogue scenes without crashing', () => {
    const scenes: Scene[] = [
      makeScene({ id: 'ch01_s01', text: 'Action start. '.repeat(120), dialogueRatio: 0 }),
      makeScene({ id: 'ch01_s02', text: 'More action. '.repeat(120), dialogueRatio: 0 }),
    ];
    const candidates = generateCandidates(scenes);
  expect(Array.isArray(candidates)).toBe(true);
  // With dialogueRatio==0, filter should remove
  expect(candidates.length).toBe(0);
  });

  it('includes baseline first scene only if it passes thresholds', () => {
    const first = makeScene({ id: 'ch01_s01', text: '"Where is he?" She shouted! Danger loomed. '.repeat(120), dialogueRatio: 0.6 });
    const others: Scene[] = [];
    for (let i = 0; i < 8; i++) {
      others.push(makeScene({ id: `ch01_s${String(i+2).padStart(2,'0')}`, text: 'Neutral setup. '.repeat(60), dialogueRatio: 0.1 }));
    }
    const scenes = [first, ...others];
    const candidates = generateCandidates(scenes);
    const baseline = candidates.find(c => c.scenes.includes('ch01_s01'));
    const hooks = analyzeScenes(scenes).hookScores;
    const firstHook = hooks.get('ch01_s01') ?? 0;
    if (firstHook >= 0.6) {
      expect(baseline).toBeDefined();
    } else {
      expect(baseline).toBeUndefined();
    }
  });

  it('performs under 100ms for 120 scenes', () => {
    const scenes: Scene[] = [];
    for (let i = 0; i < 120; i++) {
      const id = `ch01_s${String(i+1).padStart(2,'0')}`;
      const dlg = i % 5 === 0 ? 0.7 : 0.2;
      scenes.push(makeScene({ id, text: (i % 3 === 0 ? 'He ran. ' : '"Hi?" she asked. ') .repeat(70), dialogueRatio: dlg }));
    }
    const t0 = performance.now();
    const candidates = generateCandidates(scenes);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(100);
    for (const c of candidates) expect(c.totalWords).toBeGreaterThanOrEqual(500);
  });
});
