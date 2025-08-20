import { describe, it, expect } from 'vitest';
import { extractCharacters, extractReveals } from '../src/features/manuscript/reveal-extraction.js';
import type { Scene } from '../src/features/manuscript/types.js';

// Helper to fabricate a Scene
function scene(text: string): Scene {
  return {
    id: 's1',
    chapterId: 'ch01',
    startOffset: 0,
    endOffset: text.length,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    dialogueRatio: 0,
  };
}

describe('extractCharacters', () => {
  it('captures single-word proper names and excludes pronouns/articles', () => {
    const s = scene('He looked at Alice and then at Bob. It was Alice who waved. The cat slept.');
    const chars = extractCharacters(s);
    expect(chars).toContain('Alice');
    expect(chars).toContain('Bob');
    expect(chars).not.toContain('He');
    expect(chars).not.toContain('It');
    // Ensure determinism (first occurrence order) - Alice should precede Bob
    expect(chars.indexOf('Alice')).toBeLessThan(chars.indexOf('Bob'));
  });

  it('captures multi-word names with titles and preserves casing', () => {
    const s = scene('Dr. Jane Doe met Prof. Alan Turing beside the river.');
    const chars = extractCharacters(s);
    expect(chars).toContain('Dr. Jane Doe');
    expect(chars).toContain('Prof. Alan Turing');
    // Ensure no duplicate shorter fragments when full multi-word captured
    expect(chars).not.toContain('Jane');
    expect(chars).not.toContain('Alan');
  });

  it('handles O\' and Mc prefixes (O\'Hearn, McArthur)', () => {
    const s = scene("O'Hearn sparred with McArthur while Mr. Smith observed.");
    const chars = extractCharacters(s);
    expect(chars).toContain("O'Hearn");
    expect(chars).toContain('McArthur');
    expect(chars).toContain('Mr. Smith');
  });

  it('captures hyphenated names (Jean-Luc, Mary-Jane Smith-Jones) and filters generic sentence starters', () => {
    const s = scene('Jean-Luc adjusted controls while Mary-Jane Smith-Jones monitored output. Tomorrow the system resets.');
    const chars = extractCharacters(s);
    expect(chars).toContain('Jean-Luc');
    expect(chars).toContain('Mary-Jane Smith-Jones');
    expect(chars).not.toContain('Tomorrow');
  });
});

describe('extractReveals', () => {
  it('extracts "Name is X" pattern when name is recognized character', () => {
    const s = scene('Alice is the informant. Later, Bob is nervous about the plan.');
  const reveals = extractReveals(s);
  const descs = reveals.map(r => r.description);
    expect(descs).toContain('Alice is the informant');
    expect(descs).toContain('Bob is nervous about the plan');
  });

  it('extracts engineered noun pattern (the <noun> is engineered)', () => {
    const s = scene('Rumors spread that the virus is engineered while the device is faulty.');
  const reveals = extractReveals(s);
  const descs = reveals.map(r => r.description);
    expect(descs).toContain('virus is engineered');
    // Should not include unrelated phrase
    expect(descs).not.toContain('device is faulty');
  });

  it('excludes filtered generic single-word sentence starters from reveals when not characters', () => {
    const s = scene('Tomorrow is quiet. Alice is ready.');
  const reveals = extractReveals(s);
  const descs = reveals.map(r => r.description);
    expect(descs).toContain('Alice is ready');
    expect(descs).not.toContain('Tomorrow is quiet');
  });
});
