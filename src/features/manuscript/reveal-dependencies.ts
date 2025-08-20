// Phase 2: Reveal dependency inference & closure computation
// Lightweight, pattern-driven heuristics — deterministic & O(V+E)

import type { Reveal, RevealDependency } from './types.js';

export class RevealDependencies {
  private direct: Map<string, Set<string>> = new Map(); // revealId -> direct deps
  private reveals: Map<string, Reveal> = new Map();
  private closureCache: Map<string, Set<string>> = new Map();
  private depthCache: Map<string, number> = new Map();

  register(reveal: Reveal) {
    if (!this.reveals.has(reveal.id)) this.reveals.set(reveal.id, reveal);
  }

  addDependency(revealId: string, dependsOnId: string) {
    if (revealId === dependsOnId) return; // ignore self
    let s = this.direct.get(revealId);
    if (!s) { s = new Set(); this.direct.set(revealId, s); }
    s.add(dependsOnId);
  }

  inferBasicDependencies() {
    // Rules (heuristic):
    // 1. "X is Y" depends on existence of X (any earlier reveal mentioning X)
    // 2. relationship/state_change/temporal depend on constituent entity existence
    // 3. transformation (encoded as state_change with keywords 'became') depends on prior state if any reveal has pattern "X is <something>" before
    const bySceneOrder = Array.from(this.reveals.values()).sort((a,b)=> a.sceneId.localeCompare(b.sceneId));
    const firstByEntity = new Map<string, string>(); // entity -> revealId introducing it
    const priorState: Map<string, string> = new Map(); // entity -> latest state reveal id

    for (const r of bySceneOrder) {
      // Track entities introduction
      for (const ent of r.entities) {
        if (!firstByEntity.has(ent)) firstByEntity.set(ent, r.id);
      }
      // Dependencies: each entity (beyond the first introduction) depends on its introduction reveal
      for (const ent of r.entities) {
        const intro = firstByEntity.get(ent);
        if (intro && intro !== r.id) this.addDependency(r.id, intro);
      }

      // Transformation/state change heuristics
      if (r.type === 'state_change') {
        // naive parse: description like "X became Y" or "X now Y"
        const became = /^(.*?)\s+(became|now)\s+(.*)$/i.exec(r.description);
        if (became && became[1]) {
          const subject = became[1].trim();
          if (subject) {
            const prev = priorState.get(subject);
            if (prev) this.addDependency(r.id, prev);
            priorState.set(subject, r.id);
          }
        }
      }
      // Generic "X is Y" baseline state update
      if (/\bis\s+/.test(r.description) && r.entities.length && r.entities[0]) {
        priorState.set(r.entities[0]!, r.id);
      }
    }
  }

  private computeClosure(id: string, visiting: Set<string>): Set<string> {
    if (this.closureCache.has(id)) return this.closureCache.get(id)!;
    if (visiting.has(id)) return new Set(); // break cycles (handled separately)
    visiting.add(id);
    const deps = this.direct.get(id) || new Set();
    const closure = new Set<string>();
    for (const d of deps) {
      closure.add(d);
      for (const trans of this.computeClosure(d, visiting)) closure.add(trans);
    }
    visiting.delete(id);
    this.closureCache.set(id, closure);
    return closure;
  }

  private computeDepth(id: string, visiting: Set<string>): number {
    if (this.depthCache.has(id)) return this.depthCache.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const deps = this.direct.get(id) || new Set();
    let depth = 0;
    for (const d of deps) depth = Math.max(depth, 1 + this.computeDepth(d, visiting));
    visiting.delete(id);
    this.depthCache.set(id, depth);
    return depth;
  }

  materialize(): RevealDependency[] {
    const list: RevealDependency[] = [];
    for (const id of this.reveals.keys()) {
      const trans = this.computeClosure(id, new Set());
      const depth = this.computeDepth(id, new Set());
      list.push({ revealId: id, dependsOn: Array.from(this.direct.get(id)||[]), transitiveDeps: trans, depth });
    }
    return list;
  }

  // Graph queries
  getPrerequisites(id: string): string[] { return Array.from(this.computeClosure(id, new Set())); }
  getDownstream(id: string): string[] {
    const downstream: string[] = [];
    for (const [r, deps] of this.direct.entries()) if (deps.has(id)) downstream.push(r);
    return downstream;
  }
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const stack: string[] = [];
    const state = new Map<string, number>(); // 0=unseen 1=on stack 2=done
    const visit = (id: string) => {
      state.set(id,1); stack.push(id);
      for (const d of this.direct.get(id)||[]) {
        const s = state.get(d)||0;
        if (s===0) visit(d); else if (s===1) {
          const idx = stack.indexOf(d);
            cycles.push(stack.slice(idx));
        }
      }
      stack.pop(); state.set(id,2);
    };
    for (const id of this.reveals.keys()) if ((state.get(id)||0)===0) visit(id);
    return cycles;
  }
  topologicalSort(): string[] {
    // Kahn
    const inDeg = new Map<string, number>();
    for (const id of this.reveals.keys()) inDeg.set(id,0);
  for (const [id] of this.direct.entries()) if (!inDeg.has(id)) inDeg.set(id,(inDeg.get(id)||0)); // ensure keys
    for (const deps of this.direct.values()) for (const d of deps) inDeg.set(d, inDeg.get(d)||0); // ensure all nodes present
    for (const [id,deps] of this.direct.entries()) inDeg.set(id,deps.size);
    const q: string[] = [];
    for (const [id,deg] of inDeg.entries()) if (deg===0) q.push(id);
    const out: string[] = [];
    while (q.length) {
      const n = q.shift()!;
      out.push(n);
      for (const ds of this.getDownstream(n)) {
        const deg = (inDeg.get(ds)||0)-1; inDeg.set(ds,deg);
        if (deg===0) q.push(ds);
      }
    }
    return out.length===inDeg.size? out : out; // if cycle, partial order returned
  }
}

export function buildDependencies(reveals: Reveal[]): RevealDependencies {
  const dep = new RevealDependencies();
  for (const r of reveals) dep.register(r);
  dep.inferBasicDependencies();
  return dep;
}
