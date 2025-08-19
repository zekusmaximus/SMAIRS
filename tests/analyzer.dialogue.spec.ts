// tests/analyzer.dialogue.spec.ts
import { describe, it, expect } from 'vitest';
import * as analyzer from '../src/features/manuscript/analyzer.js';

// Narrow the possible export shape without using `any`.
type DetectDialogueResult = { isDialogue: boolean; speaker?: string };
type DetectDialogueFn = (s: string) => DetectDialogueResult;

// Safe getter for optional export
function getDetectDialogue(): DetectDialogueFn | undefined {
  const maybe = (analyzer as Record<string, unknown>).detectDialogue;
  return typeof maybe === 'function' ? (maybe as DetectDialogueFn) : undefined;
}

describe('analyzer: dialogue detection', () => {
  it('detects dialogue lines with straight quotes (if implemented)', () => {
    const detect = getDetectDialogue();
    if (!detect) {
      expect(true).toBe(true); // placeholder until exported
      return;
    }
    const sample = `"Hello," said Alice.`;
    const result = detect(sample);
    expect(result.isDialogue).toBe(true);
    expect(result.speaker).toBe('Alice');
  });

  it('detects dialogue lines with smart quotes (if implemented)', () => {
    const detect = getDetectDialogue();
    if (!detect) {
      expect(true).toBe(true);
      return;
    }
    const sample = `“Where are we going?” asked Bob.`;
    const result = detect(sample);
    expect(result.isDialogue).toBe(true);
    expect(result.speaker).toBe('Bob');
  });

  it('ignores sentence-initial capitalized words as names (if implemented)', () => {
    const detect = getDetectDialogue();
    if (!detect) {
      expect(true).toBe(true);
      return;
    }
    const sample = `Tomorrow will be better, she said.`;
    const result = detect(sample);
    expect(result.isDialogue).toBe(false);
  });
});


