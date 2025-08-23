import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importManuscript } from '../../manuscript/importer.js';
import { segmentScenes } from '../../manuscript/segmentation.js';
import { extractReveals } from '../../manuscript/reveal-extraction.js';
import { generateCandidates } from '../../manuscript/opening-candidates.js';
import { OpeningLab } from '../../manuscript/opening-lab.js';
import type { Scene, Reveal } from '../../manuscript/types.js';

async function loadTestManuscript(): Promise<string> {
  const p = resolve(process.cwd(), 'tests/fixtures/sample-manuscript.txt');
  const raw = await readFile(p, 'utf-8');
  return raw;
}

async function analyzeManuscript(text: string): Promise<{ scenes: Scene[]; reveals: Reveal[] }> {
  const ms = importManuscript(text);
  const scenes = segmentScenes(ms);
  const reveals: Reveal[] = [];
  for (const s of scenes) reveals.push(...extractReveals(s));
  return { scenes, reveals };
}

describe('Opening Lab Integration', () => {
  let manuscript = '';
  let scenes: Scene[] = [];
  let reveals: Reveal[] = [];
  let candidates: ReturnType<typeof generateCandidates> = [];
  let lab: OpeningLab;

  beforeAll(async () => {
    // Force offline mode for deterministic tests
    process.env.LLM_OFFLINE = '1';
    manuscript = await loadTestManuscript();
    const analysis = await analyzeManuscript(manuscript);
    scenes = analysis.scenes;
    reveals = analysis.reveals;
    candidates = generateCandidates(scenes);
    lab = new OpeningLab();
  });

  it('completes full analysis for single candidate', async () => {
    expect(candidates.length).toBeGreaterThan(0);
    const analysis = await lab.analyzeCandidate(
      candidates[0]!,
      manuscript,
  scenes,
  reveals,
  (update) => void update
    );

    expect(analysis.violations).toBeDefined();
    expect(analysis.burden.metrics.percentageOfText).toBeLessThan(20); // allow leeway in offline mode
    expect(analysis.confidence).toBeGreaterThan(0.5);
  });

  it('maintains progress callbacks through all phases', async () => {
    const phases: string[] = [];
    const progress = (update: { phase: string; progress: number; message?: string }) => phases.push(update.phase);
    await lab.analyzeCandidate(candidates[0]!, manuscript, scenes, reveals, progress);
    expect(phases).toEqual(expect.arrayContaining(['structure', 'spoilers', 'bridges', 'burden', 'scoring', 'complete']));
  });

  it('handles errors gracefully', async () => {
    // Simulate API failure by disabling offline and setting a bad key
    process.env.LLM_OFFLINE = '0';
    process.env.ANTHROPIC_API_KEY = 'invalid';

    const result = await lab
      .analyzeCandidate(candidates[0]!, manuscript, scenes, reveals)
      .catch(e => e as Error);

    expect(result).toBeInstanceOf(Error);

    // restore
    process.env.LLM_OFFLINE = '1';
    delete process.env.ANTHROPIC_API_KEY;
  });
});
