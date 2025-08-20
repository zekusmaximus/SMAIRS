import { describe, it, expect } from 'vitest';
import { importManuscript } from '../src/features/manuscript/importer.js';
import { segmentScenes } from '../src/features/manuscript/segmentation.js';
import { readFileSync } from 'fs';

/** IoU of two [start,end) spans */
function iou(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const inter = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);
  return union === 0 ? 0 : inter / union;
}

describe('segmentation labeled sample alignment', () => {
  it('matches labeled scene boundaries (IoU ≥0.6 for all)', () => {
    const sample = readFileSync('tests/fixtures/labeled-sample.txt','utf8');
    const expected: {id:string;start:number;end:number}[] = JSON.parse(readFileSync('tests/fixtures/expected-boundaries.json','utf8'));
    const ms = importManuscript(sample);
    const scenes = segmentScenes(ms);
    const byId = new Map(scenes.map(s => [s.id, s]));
    for (const exp of expected) {
      const s = byId.get(exp.id);
      expect(s, `Missing scene ${exp.id}`).toBeDefined();
      if (!s) continue;
      const score = iou(exp.start, exp.end, s.startOffset, s.endOffset);
      if (score < 0.6) {
        console.error('Low IoU', exp.id, { expected: exp, got: { start: s.startOffset, end: s.endOffset }});
      }
      expect(score).toBeGreaterThanOrEqual(0.6);
    }
  });
});
