import { describe, it, expect } from 'vitest';
import { analyzeScenes, extractCharacters } from '../src/features/manuscript/analyzer.js';
import type { Scene } from '../src/features/manuscript/types.js';

function mkScene(id: string, text: string): Scene {
  return {
    id,
    chapterId: 'ch01',
    startOffset: 0,
    endOffset: text.length,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    dialogueRatio: 0,
  };
}

describe('analyzer character extraction', () => {
  it('extracts characters via dialogue attribution and proper nouns', () => {
    const scene = mkScene('s1', 'Mr. John Smith said, "We go now," whispered Alice. Later, the Bank of England loomed. Dr. Chen asked John.');
    const chars = extractCharacters(scene);
    // Titles stripped
    expect(chars.has('John Smith')).toBe(true);
    expect(chars.has('Alice')).toBe(true);
    expect(chars.has('Chen')).toBe(true);
    // Proper noun seq with connector
    expect(chars.has('Bank of England')).toBe(true);
  });

  it('populates charactersPerScene and allCharacters in analyzeScenes', () => {
    const scenes = [
      mkScene('s1', 'John said hello to Mary.'),
      mkScene('s2', 'Mary whispered. Dr. Kyle said it was urgent as John replied.')
    ];
    const analysis = analyzeScenes(scenes);
    expect(analysis.charactersPerScene.get('s1')?.has('John')).toBe(true);
    expect(analysis.charactersPerScene.get('s1')?.has('Mary')).toBe(true);
    expect(analysis.charactersPerScene.get('s2')?.has('Mary')).toBe(true);
    expect(analysis.charactersPerScene.get('s2')?.has('Kyle')).toBe(true); // title stripped
    // allCharacters union
    const all = analysis.allCharacters;
    expect(all.has('John')).toBe(true);
    expect(all.has('Mary')).toBe(true);
    expect(all.has('Kyle')).toBe(true);
  });
});
