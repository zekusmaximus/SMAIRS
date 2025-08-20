import { describe, it, expect } from 'vitest';
import { importManuscript } from '../src/features/manuscript/importer.js';
import { segmentScenes } from '../src/features/manuscript/segmentation.js';
import { extractCharacters } from '../src/features/manuscript/reveal-extraction.js';
import { buildRevealGraph } from '../src/features/manuscript/reveal-graph.js';
import { runSceneInventory } from '../src/cli/scene-inventory.js';

/**
 * Test 1 – Segmentation & Characters
 * Multi-chapter manuscript with varying spacing and scene metadata fields.
 */
describe('fixtures: segmentation & characters', () => {
  it('segments scenes and extracts characters across chapters', () => {
    const manuscriptText = [
      '=== CHAPTER 1 ===',
      '[SCENE: CH01_S01 | POV: Jane | Location: Lab]',
      'Dr. Jane Doe adjusted the scope while Mr. Smith watched in silence.',
      '',
      '[SCENE: CH01_S02]',
      'Random interstitial text where Dr. Jane Doe appears again.',
      '=== CHAPTER 2 ===', // no blank line before next chapter intentionally
      '[SCENE: CH02_S01 | POV: Smith | Location: Hangar]',
      'Mr. Smith met Dr. Jane Doe at the entrance. Ordinary words follow.',
      ''
    ].join('\n');

    const ms = importManuscript(manuscriptText);
    const scenes = segmentScenes(ms);

    const ids = scenes.map(s => s.id);
    expect(ids).toEqual(['ch01_s01', 'ch01_s02', 'ch02_s01']);
    expect(scenes.length).toBe(3);

    const charsPerScene = scenes.map(s => extractCharacters(s));
    // Scene 1 should contain both characters
    expect(charsPerScene[0]).toContain('Dr. Jane Doe');
    expect(charsPerScene[0]).toContain('Mr. Smith');
    // Scene 2 repeat of Dr. Jane Doe
    expect(charsPerScene[1]).toContain('Dr. Jane Doe');
    // Scene 3 again both
    expect(charsPerScene[2]).toContain('Dr. Jane Doe');
    expect(charsPerScene[2]).toContain('Mr. Smith');
  });
});

/**
 * Test 2 – Reveals & Graph
 * Three scenes with two unique reveals: one repeated and one new later.
 */
describe('fixtures: reveals & graph', () => {
  it('builds reveal graph with correct first exposures and prerequisites', async () => {
    const text = [
      '=== CHAPTER 1 ===',
      '[SCENE: CH01_S01]',
      'The virus is engineered.',
      '[SCENE: CH01_S02]',
      'Sarah is the mole.',
      '[SCENE: CH01_S03]',
      'The virus is engineered and unstoppable.',
      ''
    ].join('\n');

    // Run full pipeline for determinism (not directly used for reveals, but ensures integration path executes)
    await runSceneInventory(text, { fixedTimestamp: '2025-01-01T00:00:00Z' });

    // Build scenes + reveal graph
    const ms = importManuscript(text);
    const scenes = segmentScenes(ms);
    const graph = buildRevealGraph(scenes);

    // Expect exactly two unique reveals
    expect(graph.reveals.length).toBe(2);

    const byDesc: Record<string, typeof graph.reveals[number]> = {};
    for (const r of graph.reveals) byDesc[r.description] = r;

  const virus = byDesc['virus is engineered'];
  const sarah = byDesc['Sarah is the mole'];

  expect(virus, 'virus reveal missing').toBeTruthy();
  expect(sarah, 'Sarah reveal missing').toBeTruthy();
  if (!virus || !sarah) return; // type narrowing for TS

  expect(virus.firstExposureSceneId).toBe('ch01_s01');
  expect(sarah.firstExposureSceneId).toBe('ch01_s02');

  expect(virus.preReqs).toEqual([]);
  expect(sarah.preReqs).toContain(virus.id);
  expect(sarah.preReqs.length).toBe(1);
  });
});
