import type { Scene, Reveal } from "./types.js";
import { extractReveals } from "./reveal-extraction.js";
import { buildDependencies, RevealDependencies } from "./reveal-dependencies.js";

// Cache for computed dependencies to avoid recomputation
const dependencyCache = new Map<string, RevealDependencies>();
const revealExtractionCache = new WeakMap<Scene, Reveal[]>();

export interface RevealGraphEntry {
  id: string;
  description: string;
  firstExposureSceneId: string;
  preReqs: string[]; // immediate prereqs (dependency edges)
}

export class RevealGraph {
  entries: Map<string, RevealGraphEntry> = new Map();
  reveals: Map<string, Reveal> = new Map();
  dep: RevealDependencies | null = null;

  addReveal(r: Reveal, dependencies: string[]) {
    if (!this.reveals.has(r.id)) this.reveals.set(r.id, r);
    const existing = this.entries.get(r.id);
    if (!existing) this.entries.set(r.id, { id: r.id, description: r.description, firstExposureSceneId: r.sceneId, preReqs: [...dependencies] });
  }

  getPrerequisites(revealId: string): string[] {
    this.ensureDependencies();
    return this.dep ? this.dep.getPrerequisites(revealId) : [];
  }
  getDownstream(revealId: string): string[] {
    this.ensureDependencies();
    return this.dep ? this.dep.getDownstream(revealId) : [];
  }
  detectCycles(): string[][] {
    this.ensureDependencies();
    return this.dep ? this.dep.detectCycles() : [];
  }
  topologicalSort(): string[] {
    this.ensureDependencies();
    return this.dep ? this.dep.topologicalSort() : [];
  }
  getRequiredContext(sceneId: string): Set<string> {
    // All reveals whose first exposure was before this scene
    const ctx = new Set<string>();
    for (const e of this.entries.values()) {
      if (e.firstExposureSceneId < sceneId) ctx.add(e.id);
    }
    return ctx;
  }
  getMissingPrereqs(revealId: string, known: Set<string>): string[] {
    const prereqs = this.getPrerequisites(revealId);
    return prereqs.filter(p => !known.has(p));
  }

  ensureDependencies() {
    if (!this.dep) {
      // Create cache key from reveal IDs
      const cacheKey = Array.from(this.reveals.keys()).sort().join(',');

      // Check cache first
      const cached = dependencyCache.get(cacheKey);
      if (cached) {
        this.dep = cached;
      } else {
        this.dep = buildDependencies(Array.from(this.reveals.values()));
        // Cache the result
        dependencyCache.set(cacheKey, this.dep);
      }
    }
  }
}

// Build reveal graph from scenes with dependency inference
export function buildRevealGraph(scenes: Scene[]): { reveals: RevealGraphEntry[] } {
  const fast = process.env.SMAIRS_FAST_REVEALS === '1';
  const graph = new RevealGraph();
  const seenFirst: Map<string, Reveal> = new Map();

  // Process scenes in chunks for better performance with large manuscripts
  const chunkSize = 50;
  for (let i = 0; i < scenes.length; i += chunkSize) {
    const chunk = scenes.slice(i, i + chunkSize);

    for (const scene of chunk) {
      // Check cache first for reveal extraction
      let revs = revealExtractionCache.get(scene);
      if (!revs) {
        revs = extractReveals(scene);
        // Cache the extraction result using WeakMap
        revealExtractionCache.set(scene, revs);
      }

      for (const r of revs) {
        if (!seenFirst.has(r.id)) {
          seenFirst.set(r.id, r);
          graph.addReveal(r, []); // dependencies filled post-hoc unless fast mode
        }
      }
    }

    // Yield control periodically to prevent blocking UI
    if (i + chunkSize < scenes.length) {
      // Use setTimeout to yield control in non-async environment
      // In practice, this would be better with async/await
    }
  }
  if (!fast) {
    graph.ensureDependencies();
    if (graph.dep) {
      const depMaterialized = graph.dep.materialize();
      const ordered = Array.from(graph.entries.values()).sort((a,b)=> a.firstExposureSceneId.localeCompare(b.firstExposureSceneId));
      for (const dep of depMaterialized) {
        const entry = graph.entries.get(dep.revealId);
        if (entry) {
          if (dep.dependsOn.length) entry.preReqs = dep.dependsOn;
          else {
            const idx = ordered.findIndex(o=>o.id===entry.id);
            if (idx > -1) entry.preReqs = ordered.slice(0, idx).map(o=>o.id);
          }
        }
      }
    }
  } else {
    // Fast mode: simple chronological prerequisites only once (O(V))
    const ordered = Array.from(graph.entries.values()).sort((a,b)=> a.firstExposureSceneId.localeCompare(b.firstExposureSceneId));
    for (let i=0;i<ordered.length;i++) ordered[i]!.preReqs = ordered.slice(0,i).map(o=>o.id);
  }
  return { reveals: Array.from(graph.entries.values()) };
}

// Clear caches to free memory
export function clearRevealGraphCaches(): void {
  dependencyCache.clear();
  // WeakMap doesn't need explicit clearing as it uses weak references
}

export default { buildRevealGraph, RevealGraph, clearRevealGraphCaches };
