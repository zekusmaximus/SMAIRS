import { describe, it, expect } from 'vitest';
import { calculateMetrics, consolidateEdits, calculateFragmentation, estimateTime, assessBurden } from '../src/features/manuscript/edit-burden.js';
import type { EditSpan, BurdenMetrics } from '../types/burden-types.js';

// Minimal fake edit spans consistent with burden types

describe('edit burden calculation', () => {
  it('calculates basic metrics correctly', () => {
    const edits: EditSpan[] = [
      { type: 'insert', wordDelta: 20 },
      { type: 'delete', wordDelta: -10 },
      { type: 'replace', originalText: 'five words here', newText: 'seven words here now too', wordDelta: 2 }
    ];
    const metrics = calculateMetrics(edits, { totalWords: 1000 });
    expect(metrics.addedWords).toBe(22); // 20 + 2 from replace (5 new -3 old)
    expect(metrics.deletedWords).toBe(10);
    expect(metrics.modifiedWords).toBe(3); // original words in replace
    expect(metrics.totalChangePercent).toBeCloseTo((22+10+3)/1000*100, 1);
  });

  it('consolidates overlapping edits', () => {
  const edits: EditSpan[] = [
      { anchor: { position: 100 }, wordDelta: 5, type: 'insert' },
      { anchor: { position: 102 }, wordDelta: 3, type: 'insert' }, // overlaps / adjacent
      { anchor: { position: 200 }, wordDelta: 4, type: 'insert' }
    ];
    const consolidated = consolidateEdits(edits);
    expect(consolidated).toHaveLength(2);
  expect(consolidated[0] && consolidated[0].wordDelta).toBe(8);
  });

  it('calculates fragmentation correctly', () => {
    const scattered: EditSpan[] = [
      { anchor: { position: 0 }, type: 'insert', wordDelta: 1 },
      { anchor: { position: 500 }, type: 'insert', wordDelta: 1 },
      { anchor: { position: 1000 }, type: 'insert', wordDelta: 1 }
    ];
    const clustered: EditSpan[] = [
      { anchor: { position: 100 }, type: 'insert', wordDelta: 1 },
      { anchor: { position: 105 }, type: 'insert', wordDelta: 1 },
      { anchor: { position: 110 }, type: 'insert', wordDelta: 1 }
    ];
    const fragScattered = calculateFragmentation(scattered, { totalWords: 1000 });
    const fragClustered = calculateFragmentation(clustered, { totalWords: 1000 });
  expect(fragScattered).toBeGreaterThanOrEqual(0); // fragmentation metric defined 0..1
  expect(fragClustered).toBeLessThanOrEqual(fragScattered);
  });

  it('estimates time based on industry standards', () => {
    const metrics: Partial<BurdenMetrics> = {
      addedWords: 30,
      modifiedWords: 10,
      deletedWords: 5,
      originalWords: 1000,
      totalChangePercent: (30+10+5)/1000*100
    };
    const time = estimateTime(metrics, { fragmentationScore: 0.2 });
    // Implementation ~ (30/250*60)=7.2 + (10/500*60)=1.2 + (5/500*60*0.5)=0.3 => 8.7
    expect(time.minutesToImplement).toBeGreaterThan(7);
    expect(time.minutesToImplement).toBeLessThan(11);
    expect(time.confidenceLevel).toBe('high');
  });

  it('assesses burden levels correctly', () => {
    const minimal = assessBurden(
      { totalChangePercent: 2, affectedSpans: 1 },
      { fragmentationScore: 0.1 }
    );
    expect(minimal.burden).toBe('minimal');
    expect(minimal.feasibility).toBe('trivial');

    const heavy = assessBurden(
      { totalChangePercent: 18, affectedSpans: 10 },
      { fragmentationScore: 0.8 }
    );
    expect(heavy.burden).toBe('heavy');
    expect(heavy.feasibility).toBe('challenging');
  });
});
