import { describe, it, expect, beforeAll } from 'vitest';
import { BridgeGenerator } from '../src/features/llm/bridge-generator.js';
import { StyleAnalyzer } from '../src/features/manuscript/style-analyzer.js';
import type { ContextGap } from '../src/features/manuscript/context-analyzer.js';
import type { Scene } from '../src/features/manuscript/types.js';

function mockScene(text: string, id = 'sc1'): Scene {
  return { id, text, startOffset: 0, endOffset: text.length, chapterId: 'ch1', order: 1 } as unknown as Scene;
}

describe('Bridge Paragraph Generation', () => {
  const generator = new BridgeGenerator();
  const analyzer = new StyleAnalyzer();
  const manuscript = { rawText: 'She stepped into the lab. The hum of machines stitched the silence. I held my breath and waited.' };
  const baseStyle = analyzer.analyzeManuscript(manuscript as unknown as { rawText: string });
  const target = mockScene('She pushed through the lab doors, the fluorescents buzzing overhead.');

  beforeAll(() => { process.env.LLM_OFFLINE = process.env.LLM_OFFLINE || '1'; });

  it('generates contextually appropriate bridges', async () => {
    const gap: ContextGap = {
      id: 'g1',
      category: 'character',
      entity: { name: 'Sarah', referenceType: 'definite', firstReference: { sceneId: target.id, offset: 0, length: 5 } },
      confusion: { type: 'undefined', severity: 'low', readerQuestion: 'Who is Sarah?' },
      requiredInfo: { facts: ['Sarah is the protagonist', 'She works at the lab'], wordCount: 30, dependencies: [] },
      bridge: { text: '', insertPoint: { sceneId: target.id, offset: 0, length: 0 }, intrusiveness: 0 },
    } as ContextGap;

    const bridge = await generator.generateBridge({ gap, targetScene: target, manuscriptStyle: baseStyle, maxWords: 50 });
    expect(bridge.wordCount).toBeLessThanOrEqual(50);
    expect(bridge.contextCovered.length).toBeGreaterThan(0);
  });

  it('maintains manuscript voice and style', async () => {
    const gap: ContextGap = {
      id: 'g2', category: 'character',
      entity: { name: 'Sarah', referenceType: 'definite', firstReference: { sceneId: target.id, offset: 0, length: 5 } },
      confusion: { type: 'undefined', severity: 'low', readerQuestion: 'Who is Sarah?' },
      requiredInfo: { facts: ['Sarah leads the project'], wordCount: 20, dependencies: [] },
      bridge: { text: '', insertPoint: { sceneId: target.id, offset: 0, length: 0 }, intrusiveness: 0 },
    } as ContextGap;
    const bridge = await generator.generateBridge({ gap, targetScene: target, manuscriptStyle: baseStyle, maxWords: 50 });
    const bridgeStyle = analyzer.analyzeText(bridge.text);
    expect(bridgeStyle.pov).toBe(baseStyle.pov);
    expect(bridgeStyle.tense).toBe(baseStyle.tense);
  });

  it('provides multiple alternatives', async () => {
    const gap: ContextGap = {
      id: 'g3', category: 'character',
      entity: { name: 'Sarah', referenceType: 'definite', firstReference: { sceneId: target.id, offset: 0, length: 5 } },
      confusion: { type: 'undefined', severity: 'low', readerQuestion: 'Who is Sarah?' },
      requiredInfo: { facts: ['Sarah is the protagonist', 'She works at the lab'], wordCount: 30, dependencies: [] },
      bridge: { text: '', insertPoint: { sceneId: target.id, offset: 0, length: 0 }, intrusiveness: 0 },
    } as ContextGap;
    const request = { gap, targetScene: target, manuscriptStyle: baseStyle, maxWords: 50 };
    const bridges = await generator.generateMultipleOptions(request, 3);
    expect(bridges.length).toBeGreaterThanOrEqual(3);
    const unique = new Set(bridges.map(b => b.text));
    expect(unique.size).toBe(bridges.length);
    bridges.forEach(b => expect(b.wordCount).toBeLessThanOrEqual(50));
  });
});
