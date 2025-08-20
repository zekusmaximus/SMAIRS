// Spoiler detection (Phase 1)
// Heuristic + dependency graph based premature reveal identification for alternate openings.

import type { Scene, Reveal } from './types.js';
import { extractReveals } from './reveal-extraction.js';
import { RevealGraph } from './reveal-graph.js';
import type { OpeningCandidate } from './opening-candidates.js';
import type { SpoilerViolation, SpoilerAnalysis, MissingContext, Severity, TextAnchor } from '../../../types/spoiler-types.js';

// ---- Utility helpers ----------------------------------------------------

function reorderScenes(candidate: OpeningCandidate, all: Scene[]): Scene[] {
  // naive implementation: move candidate scenes to front preserving internal order
  const idSet = new Set(candidate.scenes);
  const front: Scene[] = [];
  const rest: Scene[] = [];
  for (const s of all) (idSet.has(s.id) ? front : rest).push(s);
  return [...front, ...rest];
}

function calcSeverity(reveal: Reveal, missingPrereqs: string[], graph: RevealGraph): Severity {
  // Critical identity / death / betrayal heuristics
  if (reveal.type === 'character' && /(mole|traitor|killer|dead)/i.test(reveal.description)) return 'critical';
  // Critical causal chain: any missing prereq that itself is a 'plot' fact signalling cause.
  if (missingPrereqs.some(p => {
    const entry = graph.reveals.get(p);
    return entry && entry.type === 'plot';
  })) return 'critical';
  if (reveal.type === 'relationship' || reveal.type === 'world') return 'moderate';
  if (missingPrereqs.length >= 3) return 'moderate';
  return 'minor';
}

function severityScore(sev: Severity): number { return sev === 'critical' ? 5 : sev === 'moderate' ? 2 : 1; }

function buildAnchor(scene: Scene, matchText: string, idx: number): TextAnchor { return { sceneId: scene.id, offset: idx, length: matchText.length }; }

function generateFix(description: string): { type: 'replace' | 'delete' | 'insert'; original: string; suggested: string; reason: string } {
  if (/\bis\b/.test(description)) {
    const vagueMap: Record<string,string> = { mole:'involved', traitor:'concerned', engineered:'dangerous', dead:'missing', killer:'suspicious' };
    for (const [specific, vague] of Object.entries(vagueMap)) {
      if (description.includes(specific)) {
        return { type:'replace', original: specific, suggested: vague, reason: `Removes premature reveal of ${specific}` };
      }
    }
  }
  const adj = description.match(/\b([a-z]{4,})\b/i)?.[1] || '';
  if (adj) return { type:'delete', original: adj, suggested:'', reason: 'Remove descriptive term to defer detail' };
  return { type:'insert', original:'', suggested:'(context needed)', reason:'Add bridging context' };
}

function createViolation(reveal: Reveal, scene: Scene, missing: string[], graph: RevealGraph, mentionIdx: number, mentionText: string): SpoilerViolation {
  const severity = calcSeverity(reveal, missing, graph);
  const downstream = graph.getDownstream(reveal.id) || [];
  const properEntry = graph.entries.get(reveal.id);
  const properSceneId = properEntry ? properEntry.firstExposureSceneId : reveal.sceneId;
  const chronologicalIndex = Array.from(graph.entries.values()).sort((a,b)=> a.firstExposureSceneId.localeCompare(b.firstExposureSceneId)).findIndex(e=>e.id===reveal.id);
  return {
    revealId: reveal.id,
    revealDescription: reveal.description,
    mentionedIn: { sceneId: scene.id, anchor: buildAnchor(scene, mentionText, mentionIdx), quotedText: mentionText },
    properIntroduction: { sceneId: properSceneId, sceneIndex: chronologicalIndex },
    severity,
    spoiledDependencies: downstream,
    fix: generateFix(reveal.description),
    missingPrerequisites: missing,
    reveal,
  };
}

function extractSceneReveals(scene: Scene): Reveal[] { return extractReveals(scene); }

export function detectSpoilers(candidate: OpeningCandidate, allScenes: Scene[], revealGraph: RevealGraph): SpoilerAnalysis {
  const ordered = reorderScenes(candidate, allScenes);
  const known = new Set<string>();
  const violations: SpoilerViolation[] = [];
  const safe: string[] = [];

  for (const scene of ordered) {
    const reveals = extractSceneReveals(scene);
    for (const r of reveals) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rg: any = revealGraph;
  const missing: string[] = typeof rg.getMissingPrereqs === 'function' ? rg.getMissingPrereqs(r.id, known) : [];
      // Reorder violation: If reveal's original first scene is later in original chronology than current scene's original position
  const originalEntry = rg.entries?.get?.(r.id) as { firstExposureSceneId?: string } | undefined;
      let reorderViolation = false;
      if (originalEntry && originalEntry.firstExposureSceneId) {
        reorderViolation = Boolean(scene.id !== originalEntry.firstExposureSceneId && ordered[0] && ordered[0].id === scene.id);
      }
      if (missing.length || reorderViolation) {
        const idx = scene.text.indexOf(r.description.split(' ').slice(0,2).join(' '));
        const mentionText = idx !== -1 ? scene.text.slice(idx, Math.min(scene.text.length, idx + r.description.length)) : r.description;
        violations.push(createViolation(r, scene, missing, revealGraph, Math.max(0, idx), mentionText));
      } else {
        safe.push(r.id);
      }
      known.add(r.id);
    }
  }

  const totalSeverityScore = violations.reduce((a,v)=> a + severityScore(v.severity), 0);
  return { candidateId: candidate.id, violations, missingPrerequisites: [], safeReveals: safe, totalSeverityScore };
}

export function detectMissingContext(): MissingContext[] { return []; }
export function analyzeViolations(analysis: SpoilerAnalysis): SpoilerAnalysis { return analysis; }

export default { detectSpoilers };
