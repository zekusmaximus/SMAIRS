import { describe, it, expect } from 'vitest';
import { resolve } from '../src/features/manuscript/anchoring.js';

// Utility to fabricate a SceneSnap compatible object (subset used by resolver)
function snap(partial: Partial<import('../src/features/manuscript/anchoring.js').SceneSnap>): import('../src/features/manuscript/anchoring.js').SceneSnap {
  return {
    id: partial.id || 's',
    sha: partial.sha,
    offset: partial.offset ?? 0,
    text: partial.text,
    preContext: partial.preContext,
    postContext: partial.postContext,
    length: partial.length,
    rareShingles: partial.rareShingles,
  };
}

describe('anchoring explicit tiers', () => {
  it('Tier 1: exact match at stored offset', () => {
    const sceneText = 'Exact match scene content with punctuation.';
    const manuscript = `Header\n${sceneText}\nFooter`; // scene starts after 'Header\n'
    const start = manuscript.indexOf(sceneText);
    const s = snap({ id: 't1', offset: start, text: sceneText, length: sceneText.length });
    const res = resolve(s, manuscript);
    expect(res).not.toBeNull();
    expect(res?.tier).toBe(1);
    expect(res?.confidence).toBe(1);
    expect(res?.position).toBe(start);
  });

  it('Tier 2 (pre-only): precontext present, whitespace & smart-quote churn, no postContext', () => {
    const basePre = 'PREAMBLE START >>> ';
    const sceneCoreOriginal = 'A “curly quoted”   scene   with   irregular   spacing.';
    const sceneCoreChurned = sceneCoreOriginal
      .replace(/[“”]/g, '"')
      .replace(/\s{2,}/g, ' '); // normalized in manuscript version

    // Original manuscript (for deriving pre offset)
    const originalManuscript = basePre + sceneCoreOriginal + ' TRAILING';
    const origOffset = originalManuscript.indexOf(sceneCoreOriginal);

    // Insert noise before everything to shift the actual scene so prior offset is stale
    const insertion = 'X'.repeat(25); // within corridor so Tier2 can still find via pre
    const newManuscript = insertion + basePre + sceneCoreChurned + ' TRAILING';

    // Provide only preContext (last up-to-64 chars before old offset)
    const preContext = originalManuscript.slice(Math.max(0, origOffset - 64), origOffset);

    const s = snap({ id: 't2', offset: origOffset, text: sceneCoreOriginal, preContext, length: sceneCoreOriginal.length });
    const res = resolve(s, newManuscript);
    expect(res).not.toBeNull();
    expect(res?.tier).toBe(2);
    expect(res!.confidence).toBeGreaterThanOrEqual(0.8);
    // Position should be where churned core starts in new manuscript
    const expectedPos = newManuscript.indexOf(sceneCoreChurned);
  // Allow small off-by-one due to normalization back-mapping heuristic
  expect(Math.abs((res!.position ?? 0) - expectedPos)).toBeLessThanOrEqual(1);
  });

  it('Tier 3: fuzzy corridor token-overlap with offset shift and no context', () => {
  const sceneOriginal = 'The quick brown fox jumps over the lazy dog, followed by a second straightforward sentence.';
  // Mutate later portion (beyond first 5 seed tokens) so Tier1 fails but seed sequence intact for Tier3
  const sceneMutated = sceneOriginal.replace('over the lazy dog', 'over the lethargic canine');

    // Shift scene by adding corridor-local noise at start so prior offset (0) is stale
    const noise = 'N'.repeat(300); // < corridor 1500
    const manuscript = noise + sceneMutated + ' END';
    const priorOffset = 0; // stale offset where scene used to start (before noise)

    const s = snap({ id: 't3', offset: priorOffset, text: sceneOriginal, length: sceneOriginal.length });
    const res = resolve(s, manuscript, { corridor: 1000 }); // explicit corridor assertion
    expect(res).not.toBeNull();
  expect(res?.tier).toBe(3); // Should land in Tier 3 (fuzzy corridor)
    expect(res!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(res!.confidence).toBeLessThanOrEqual(0.95);
    const actualPos = manuscript.indexOf(sceneMutated);
    expect(res!.position).toBe(actualPos);
  });

  it('Tier 4: rare 8-token shingles global search outside corridor', () => {
    // Build a distinctive 8-token phrase (all unique, length >4) near start of scene
    const rarePhrase = 'Zephyrian Quorilith Axiom Nexus Orichalcum Dynamo Helix Vector'; // 8 tokens
    const sceneRemainder = ' cascading through the ancient machinery producing harmonic resonance across vaults.';
    const sceneFull = `${rarePhrase}${sceneRemainder}`;

    // Place large noise before scene so real position is far beyond corridor from priorOffset
    const preNoise = 'lorem ipsum '.repeat(400); // ~4800 chars
    const postNoise = ' filler '.repeat(100);
    const manuscript = preNoise + sceneFull + postNoise;

    const priorOffset = 5; // Far from actual (actual ~ preNoise.length)

    const s = snap({ id: 't4', offset: priorOffset, text: sceneFull, length: sceneFull.length });
    const res = resolve(s, manuscript, { corridor: 1500 }); // default corridor insufficient to reach scene
    expect(res).not.toBeNull();
    expect(res?.tier).toBe(4);
    expect(res!.confidence).toBeGreaterThanOrEqual(0.7);
    const expectedPos = manuscript.indexOf(rarePhrase);
    expect(res!.position).toBe(expectedPos);
  });
});
