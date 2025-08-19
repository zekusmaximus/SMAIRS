import { describe, it, expect } from 'vitest';
import { resolve } from '../src/features/manuscript/anchoring.js';

// Helper to fabricate scene snapshots with minimal fields expected by resolver
function snap(partial: Partial<import('../src/features/manuscript/anchoring.js').SceneSnap>): import('../src/features/manuscript/anchoring.js').SceneSnap {
  return {
    id: partial.id || 's1',
    sha: partial.sha || 'x',
    offset: partial.offset ?? 0,
    text: partial.text,
    preContext: partial.preContext,
    postContext: partial.postContext,
    length: partial.length,
  };
}

describe('anchoring.resolve tiers', () => {
  it('Tier 1: exact match at prior offset yields tier 1 with confidence 1.0', () => {
    const manuscript = 'AAAA\nThis is a scene. And it remains unchanged.\nBBBB';
    const sceneText = 'This is a scene. And it remains unchanged.';
    const priorOffset = manuscript.indexOf(sceneText);
    const s = snap({ id: 'scene1', offset: priorOffset, text: sceneText, length: sceneText.length });
    const res = resolve(s, manuscript);
    expect(res).not.toBeNull();
    expect(res?.tier).toBe(1);
    expect(res?.confidence).toBe(1);
    expect(res?.position).toBe(priorOffset);
  });

  it('Tier 2: pre/post context reattaches after small shift', () => {
    const base = '<<<PRE>>>';
    const sceneCore = 'Middle of the shifting scene text.';
    const tail = '<<<POST>>>';
    const manuscriptOriginal = base + sceneCore + tail;
    // Simulate insertion before the scene so previous offset is stale
    const inserted = 'INSERTED TEXT. ';
    const manuscriptNew = inserted + manuscriptOriginal; // shifts by inserted.length
    const prevOffset = manuscriptOriginal.indexOf(sceneCore); // old offset (without insertion)
    const preContext = manuscriptOriginal.slice(Math.max(0, prevOffset - 16), prevOffset);
    const postContext = manuscriptOriginal.slice(prevOffset + sceneCore.length, prevOffset + sceneCore.length + 16);

    const s = snap({ id: 'scene2', offset: prevOffset, preContext, postContext, length: sceneCore.length, text: sceneCore });
    const res = resolve(s, manuscriptNew);
    expect(res).not.toBeNull();
    expect(res?.tier).toBe(2);
    expect(res!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(res!.position).toBe(manuscriptNew.indexOf(sceneCore));
  });

  it('Tier 3: corridor fuzzy match after minor edits near start', () => {
    const original = 'The quick brown fox jumps over the lazy dog. Extra trailing sentence here.';
    const mutated = original.replace('quick brown fox', 'quick brown vulpine fox');
    const priorOffset = 0;
    const s = snap({ id: 'scene3', offset: priorOffset, text: original, length: original.length });
    // Remove pre/post so Tier 2 fails; mutate so Tier 1 fails.
    const res = resolve(s, mutated);
    expect(res).not.toBeNull();
    expect(res?.tier).toBeGreaterThanOrEqual(3); // could escalate to 4 if corridor fails
    expect(res!.confidence).toBeGreaterThan(0.6);
  });

  it('Tier 4: rare shingles locate scene when corridor context lost', () => {
    const sceneStart = 'Arcane luminous crystal oscillations shimmer';
    const sceneRest = ' across the cavern as distant machinery hums in discordant rhythm.';
    const sceneFull = sceneStart + sceneRest;
    // Manuscript: insert lots of noise before and after, remove corridor vicinity so prior offset meaningless
    const noise = 'lorem ipsum '.repeat(300);
    const manuscript = noise + sceneFull + noise;
    // Provide prior offset far away to disable T1/T2/T3 effectively
    const s = snap({ id: 'scene4', offset: 5, text: sceneFull, length: sceneFull.length });
    const res = resolve(s, manuscript);
    expect(res).not.toBeNull();
    expect([3,4]).toContain(res!.tier); // Might still catch corridor depending on tokens
    expect(res!.confidence).toBeGreaterThan(0.55);
  });

  it('returns null when insufficient info and no anchors match', () => {
    const manuscript = 'abcdefghij';
    const s = snap({ id: 'scene5', offset: 50 }); // wildly OOB and no context/text
    const res = resolve(s, manuscript);
    expect(res).toBeNull();
  });
});
