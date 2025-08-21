import { describe, it, expect } from 'vitest';
import { analyzeContext, calculateContextScore } from '../src/features/manuscript/context-analyzer.js';
import { generateBridge } from '../src/features/manuscript/bridge-generator.js';
import type { Scene } from '../src/features/manuscript/types.js';

function createScene(text: string): Scene {
  return { id: 's1', chapterId: 'ch01', startOffset: 0, endOffset: text.length, text, wordCount: text.split(/\s+/).filter(Boolean).length, dialogueRatio: 0 };
}

describe('context gap analysis', () => {
  it('detects undefined character references (definite article + team)', () => {
    const scene = createScene('Marcus checked his watch. The team waited.');
    const gaps = analyzeContext(scene, [], 0);
    expect(gaps.some(g => g.entity.name === 'the team')).toBe(true);
  });

  it('identifies definite article assumptions', () => {
    const scene = createScene('She entered the facility.');
    const gaps = analyzeContext(scene, [], 0);
    expect(gaps.some(g => g.entity.name === 'She')).toBe(true); // pronoun
    expect(gaps.some(g => g.entity.name === 'the facility' && g.confusion.type === 'assumed_knowledge')).toBe(true);
  });

  it('detects unresolved pronouns at scene start', () => {
    const scene = createScene('He knew it was too late.');
    const gaps = analyzeContext(scene, [], 0);
    expect(gaps.some(g => g.entity.referenceType === 'pronoun')).toBe(true);
    expect(gaps.some(g => g.confusion.severity === 'high')).toBe(true);
  });

  it('generates appropriate bridge text', () => {
  const gap = {
      entity: { name: 'Marcus', firstReference: { sceneId: 's1', offset: 0, length: 6 }, referenceType: 'definite' },
      requiredInfo: { facts: ['team leader', 'explosives expert'], wordCount: 8 }
  };
    const bridge = generateBridge(gap);
    expect(bridge.text).toMatch(/team/i);
    expect(bridge.intrusiveness).toBeLessThan(0.3);
  });

  it('calculates context score accurately', () => {
    const analysis: { gaps: { confusion: { severity: 'high' | 'low' } }[]; totalWordCount: number } = {
      gaps: [ { confusion: { severity: 'high' } }, { confusion: { severity: 'low' } } ],
      totalWordCount: 25
    };
    const score = calculateContextScore(analysis);
    expect(score).toBeCloseTo(0.82, 2); // 1.0 -0.15 -0.03
  });
});
