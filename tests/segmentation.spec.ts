import { describe, it, expect } from 'vitest';
import { importManuscript } from '../src/features/manuscript/importer.js';
import { segmentScenes } from '../src/features/manuscript/segmentation.js';

/** IoU of two [start,end) spans */
function iou(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const inter = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union === 0 ? 0 : inter / union;
}

type ExpectedScene = { id: string; start: number; end: number };

type Sample = { text: string; expected: ExpectedScene[] };

/**
 * Build a synthetic manuscript with 3 chapters and several scenes.
 * We capture expected scene body boundaries while assembling the string.
 */
function buildSample(): Sample {
  let text = '';
  const expected: ExpectedScene[] = [];

  function append(line: string) { text += line; }
  function nl() { text += '\n'; }

  // Chapter 1
  append('=== CHAPTER 1 ==='); nl();
  // Scene 1
  let header = '[SCENE: CH1_S1]'; append(header); nl();
  let body = 'Scene 1 body line one.\nScene 1 body line two with extra words.'; append(body); nl();
  expected.push({ id: 'ch01_s01', start: text.indexOf('Scene 1 body line one.'), end: text.length });
  // Scene 2
  header = '[SCENE: CH1_S2]'; append(header); nl();
  const s2Start = text.length; body = 'Scene 2 content; some dialogue: "Hello there." More prose.'; append(body); nl();
  expected.push({ id: 'ch01_s02', start: s2Start, end: text.length });
  // Scene 3
  header = '[SCENE: CH1_S3]'; append(header); nl();
  const s3Start = text.length; body = 'Short scene 3.'; append(body); nl();
  expected.push({ id: 'ch01_s03', start: s3Start, end: text.length });

  // Chapter 2
  append('=== CHAPTER 2 ==='); nl();
  // Scene 1
  header = '[SCENE: CH2_S1]'; append(header); nl();
  const c2s1Start = text.length; body = 'Chapter 2 scene 1 with distinctive tokens AlphaBeta GammaDelta EpsilonZeta.'; append(body); nl();
  expected.push({ id: 'ch02_s01', start: c2s1Start, end: text.length });
  // Scene 2
  header = '[SCENE: CH2_S2]'; append(header); nl();
  const c2s2Start = text.length; body = 'Another body; includes numbers 123 456 and symbols !?.'; append(body); nl();
  expected.push({ id: 'ch02_s02', start: c2s2Start, end: text.length });

  // Chapter 3
  append('=== CHAPTER 3 ==='); nl();
  header = '[SCENE: CH3_S1]'; append(header); nl();
  const c3s1Start = text.length; body = 'Final chapter opening scene.'; append(body); nl();
  expected.push({ id: 'ch03_s01', start: c3s1Start, end: text.length });

  // Ensure trailing newline for importer normalization stability
  if (!text.endsWith('\n')) nl();

  return { text, expected };
}

describe('segmentation precision/recall', () => {
  it('achieves ≥0.85 precision & recall on synthetic sample', () => {
    const { text, expected } = buildSample();
    const ms = importManuscript(text); // normalization, chapters
    const scenes = segmentScenes(ms);

    // Build lookup for predicted scenes
    const predicted = scenes.map(s => ({ id: s.id, start: s.startOffset, end: s.endOffset }));

    // Match by id and compute IoU
    let matches = 0;
    for (const exp of expected) {
      const pred = predicted.find(p => p.id === exp.id);
      if (!pred) continue;
      const score = iou(exp.start, exp.end, pred.start, pred.end);
      if (score >= 0.5) matches++;
    }

    const precision = matches / predicted.length;
    const recall = matches / expected.length;

    // Debug info on failure
    if (precision < 0.85 || recall < 0.85) {
      console.error('Expected scenes:', expected);
      console.error('Predicted scenes:', predicted);
    }

    expect(precision).toBeGreaterThanOrEqual(0.85);
    expect(recall).toBeGreaterThanOrEqual(0.85);
  });
});
