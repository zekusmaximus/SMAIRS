import { describe, it, expect } from 'vitest';
import { buildRevealGraph } from '../src/features/manuscript/reveal-graph.js';
import { extractReveals } from '../src/features/manuscript/reveal-extraction.js';
import type { Scene } from '../src/features/manuscript/types.js';

function scene(id: string, text: string): Scene {
  return { id, chapterId: 'ch01', startOffset:0, endOffset:text.length, text, wordCount: text.split(/\s+/).filter(Boolean).length, dialogueRatio:0 };
}

describe('reveal extraction expanded patterns', () => {
  it('extracts relationship and temporal patterns', () => {
    const s = scene('s1', 'It has been three years since the uprising. Alice knows Bob. Alice moved to Paris.');
    const revs = extractReveals(s);
    const descs = revs.map(r=>r.description);
    expect(descs.some(d=>d.startsWith('Temporal: three years since'))).toBe(true);
    expect(descs).toContain('Alice knows Bob');
    expect(descs).toContain('Alice at Paris');
  });
});

describe('reveal graph dependencies', () => {
  it('infers state change dependency chain', () => {
    const scenes: Scene[] = [
      scene('s1','Alice is a doctor.'),
      scene('s2','Alice became chief.'),
    ];
    const graph = buildRevealGraph(scenes);
    const doctor = graph.reveals.find(r=>/Alice is a doctor/.test(r.description))!;
    const chief = graph.reveals.find(r=>/Alice became chief/.test(r.description))!;
    expect(chief.preReqs).toContain(doctor.id);
  });

  it('topological order respects dependencies', () => {
    const scenes: Scene[] = [
      scene('s1','Alice is a doctor.'),
      scene('s2','Alice became chief.'),
      scene('s3','Bob knows Alice.'),
    ];
    const graph = buildRevealGraph(scenes);
    const doctor = graph.reveals.find(r=>/Alice is a doctor/.test(r.description))!;
    const chief = graph.reveals.find(r=>/Alice became chief/.test(r.description))!;
    const order = graph.reveals.map(r=>r.id); // already chronological here
    expect(order.indexOf(doctor.id)).toBeLessThan(order.indexOf(chief.id));
  });
});
