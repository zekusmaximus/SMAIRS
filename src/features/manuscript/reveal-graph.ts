import type { Scene } from "./types.js";
import { extractReveals } from "./reveal-extraction.js";

export interface RevealGraphEntry {
  id: string;
  description: string;
  firstExposureSceneId: string;
  preReqs: string[]; // reveal ids whose first exposure was in a prior scene
}

export interface RevealGraph {
  reveals: RevealGraphEntry[];
}

// Build a simple chronological reveal graph (Phase 1 prototype)
export function buildRevealGraph(scenes: Scene[]): RevealGraph {
  const revealFirstSeen = new Map<string, { id: string; description: string; sceneId: string; sceneIndex: number }>();

  // Pass 1: collect earliest exposure per reveal (by description hash id)
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene) continue; // safety (noUncheckedIndexedAccess)
    const revs = extractReveals(scene);
    for (const r of revs) {
      if (!revealFirstSeen.has(r.id)) {
        revealFirstSeen.set(r.id, { id: r.id, description: r.description, sceneId: scene.id, sceneIndex: i });
      }
    }
  }

  // Sort by first exposure scene index
  const ordered = Array.from(revealFirstSeen.values())
    .sort((a, b) => a.sceneIndex - b.sceneIndex);

  // Build prereq sets: all reveals first seen in earlier scenes
  const entries: RevealGraphEntry[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const curr = ordered[i];
    if (!curr) continue;
    const preReqs: string[] = [];
    for (const o of ordered) {
      if (o.sceneIndex < curr.sceneIndex) preReqs.push(o.id);
    }
    entries.push({ id: curr.id, description: curr.description, firstExposureSceneId: curr.sceneId, preReqs });
  }

  return { reveals: entries };
}

export default { buildRevealGraph };
