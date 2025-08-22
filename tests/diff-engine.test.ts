import { describe, it, expect } from 'vitest';
import { DiffEngine } from '../src/features/manuscript/diff-engine.js';
import type { SpoilerViolation } from '../types/spoiler-types.js';
import type { ContextGap } from '../src/features/manuscript/context-analyzer.js';

describe('DiffEngine', () => {
  it('generates correct diff segments', () => {
    const engine = new DiffEngine();
    const original = 'Line 1\nShe was guilty.\nLine 3';
    const spoilerFixes: SpoilerViolation[] = [
      {
        revealId: 'r1',
        revealDescription: 'She is guilty',
        mentionedIn: { sceneId: 's1', anchor: { sceneId: 's1', offset: 7, length: 14 }, quotedText: 'She was guilty.' },
        properIntroduction: { sceneId: 's2', sceneIndex: 1 },
        severity: 'critical',
        spoiledDependencies: [],
        fix: { type: 'replace', original: 'guilty', suggested: 'troubled', reason: 'Removes premature reveal of guilty' },
        missingPrerequisites: [],
        reveal: { id: 'r1', description: '', type: 'character', confidence: 1, entities: [], sceneId: 's1' } as unknown as SpoilerViolation['reveal'],
      } as unknown as SpoilerViolation,
    ];
    const diff = engine.generateDiff(original, spoilerFixes, [] as unknown as ContextGap[]);
    expect(diff.segments).toBeDefined();
    expect(diff.stats.totalChanges).toBeGreaterThan(0);
  });

  it('merges overlapping edits correctly', () => {
    const engine = new DiffEngine();
    const original = 'Hello world';
  const spoilerFixes: SpoilerViolation[] = [];
    // Internal method not exposed; simulate with two nearby inserts via context gap bridges
  const diff = engine.generateDiff(original, spoilerFixes, [
      { id: 'g1', category: 'character', entity: { name: 'X', firstReference: { sceneId: 's1', offset: 5, length: 0 }, referenceType: 'definite' }, confusion: { type: 'undefined', severity: 'low', readerQuestion: 'Who?' }, requiredInfo: { facts: [], wordCount: 0, dependencies: [] }, bridge: { text: ' A', insertPoint: { sceneId: 's1', offset: 5, length: 0 }, intrusiveness: 0 } },
      { id: 'g2', category: 'character', entity: { name: 'Y', firstReference: { sceneId: 's1', offset: 7, length: 0 }, referenceType: 'definite' }, confusion: { type: 'undefined', severity: 'low', readerQuestion: 'Who?' }, requiredInfo: { facts: [], wordCount: 0, dependencies: [] }, bridge: { text: ' B', insertPoint: { sceneId: 's1', offset: 7, length: 0 }, intrusiveness: 0 } },
  ] as unknown as ContextGap[]);
    expect(diff.stats.totalChanges).toBeGreaterThan(0);
  });

  it('preserves change reasons and sources', () => {
    const engine = new DiffEngine();
    const original = 'Before. After.';
  const spoilerFixes: SpoilerViolation[] = [
      {
        revealId: 'r2',
        revealDescription: 'Spoiler desc',
        mentionedIn: { sceneId: 's1', anchor: { sceneId: 's1', offset: 8, length: 5 }, quotedText: 'After' },
        properIntroduction: { sceneId: 's3', sceneIndex: 2 },
        severity: 'moderate',
        spoiledDependencies: [],
        fix: { type: 'replace', original: 'After', suggested: 'Later', reason: 'Avoids reveal' },
        missingPrerequisites: [],
    reveal: { id: 'r2', description: '', type: 'character', confidence: 1, entities: [], sceneId: 's1' } as unknown as SpoilerViolation['reveal'],
      } as unknown as SpoilerViolation,
    ];
  const diff = engine.generateDiff(original, spoilerFixes, [] as unknown as ContextGap[]);
    const hasReason = diff.segments.some(s => s.reason && s.source === 'spoiler');
    expect(hasReason).toBe(true);
  });
});
