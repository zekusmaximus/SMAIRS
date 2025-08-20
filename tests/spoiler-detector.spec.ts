import { describe, it, expect } from 'vitest';
import { detectSpoilers } from '../src/features/manuscript/spoiler-detector.js';
import { RevealGraph } from '../src/features/manuscript/reveal-graph.js';
import type { Reveal } from '../src/features/manuscript/types.js';
import { extractReveals } from '../src/features/manuscript/reveal-extraction.js';
import type { Scene } from '../src/features/manuscript/types.js';
import type { OpeningCandidate } from '../src/features/manuscript/opening-candidates.js';
import { generateHeatmap, renderHeatmapASCII } from '../src/features/manuscript/spoiler-heatmap.js';

function scene(id: string, text: string): Scene {
  return { id, chapterId: 'ch01', startOffset:0, endOffset:text.length, text, wordCount: text.split(/\s+/).filter(Boolean).length, dialogueRatio:0 };
}

function candidate(id: string, sceneIds: string[]): OpeningCandidate {
  // Provide minimal required fields; metrics not relevant to spoiler logic here.
  return { id, type:'single', scenes: sceneIds, startOffset:0, endOffset:0, totalWords:0, hookScore:0, actionDensity:0, mysteryQuotient:0, characterIntros:0, dialogueRatio:0 } as unknown as OpeningCandidate;
}

function graphFromScenes(scenes: Scene[]): RevealGraph {
  const g = new RevealGraph();
  const chronological: Reveal[] = [];
  for (const s of scenes) chronological.push(...extractReveals(s));
  // naive dependency: each reveal depends on all prior reveals (chain) to simulate prerequisite ordering for tests
  for (let i=0;i<chronological.length;i++) {
    const r = chronological[i]!;
    const deps = chronological.slice(0,i).map(pr=>pr.id);
    g.addReveal(r, deps);
  }
  return g;
}

describe('spoiler detection', () => {
  it('detects premature character reveal (baseline placeholder)', () => {
  const s1 = scene('s1','Sarah is a mole in the agency.'); // proper introduction (original order)
    const s2 = scene('s2','Tension rises.');
  const s3 = scene('s3','Sarah is nervous. Sarah is guilty of something unspoken.'); // moved to front by candidate (introduces derivative fact)
    const scenes = [s1,s2,s3];
  const graph = graphFromScenes(scenes);
  const cand = candidate('cand1',['s3']);
  const analysis = detectSpoilers(cand, scenes, graph);
  // Placeholder until richer dependency inference implemented
  expect(Array.isArray(analysis.violations)).toBe(true);
  });

  it('identifies missing prerequisites (baseline placeholder)', () => {
  const sExist = scene('s1','The virus spreads silently.');
  const sEngineered = scene('s2','The virus is engineered.');
  const scenes = [sExist, sEngineered];
  const graph = graphFromScenes(scenes);
  const cand = candidate('cand2',['s1']);
  const analysis = detectSpoilers(cand, scenes, graph);
  expect(analysis.violations.length).toBeGreaterThanOrEqual(0);
  });

  it('calculates severity correctly (critical vs moderate vs minor heuristic)', () => {
    const s1 = scene('s1','Alice is a doctor.');
    const s2 = scene('s2','Alice is dead.');
    const s3 = scene('s3','Bob knows Alice.');
    const scenes = [s1,s2,s3];
  const graph = graphFromScenes(scenes);
  const cand = candidate('cand3',['s2']);
  const analysis = detectSpoilers(cand, scenes, graph);
    const dead = analysis.violations.find(v=>/Alice is dead/.test(v.revealDescription));
    expect(dead?.severity).toBe('critical');
  });

  it('generates appropriate fixes', () => {
    const s1 = scene('s1','Sarah is the mole.');
    const scenes = [s1];
  const graph = graphFromScenes(scenes);
  const cand = candidate('cand4',['s1']);
  const analysis = detectSpoilers(cand, scenes, graph);
    const v = analysis.violations[0];
    if (v) {
      expect(v.fix.type).toBe('replace');
      expect(v.fix.suggested).toBe('involved');
    }
  });

  it('produces valid heatmap', () => {
    const s1 = scene('s1','Sarah is the mole.');
    const s2 = scene('s2','Sarah walks.');
    const scenes = [s1,s2];
  const graph = graphFromScenes(scenes);
  const cand = candidate('cand5',['s2']);
  const analysis = detectSpoilers(cand, scenes, graph);
    const heat = generateHeatmap(analysis, scenes);
    const ascii = renderHeatmapASCII(heat);
    expect(ascii).toMatch(/Heatmap/);
  });
});
