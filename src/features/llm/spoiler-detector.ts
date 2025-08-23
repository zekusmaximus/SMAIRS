// src/features/llm/spoiler-detector.ts
// LLM-backed spoiler detection and fix suggestion engine (Phase 2)

import { z } from 'zod';
import type { Scene, Reveal, AnchoredEdit } from '../manuscript/types.js';
import type { OpeningCandidate } from '../manuscript/opening-candidates.js';
import type { TextAnchor } from '../../../types/spoiler-types.js';
import { extractReveals } from '../manuscript/reveal-extraction.js';
import { buildDependencies } from '../manuscript/reveal-dependencies.js';
import { globalProviderAdapter } from './provider-adapter.js';
import { globalLLMCache } from './cache-manager.js';

// Public interfaces (scoped to LLM detector)
export interface RevealDependency {
  revealId: string;
  reveal: Reveal;
  prerequisites: Set<string>; // IDs of reveals that must come first
  firstMention: TextAnchor;
  properIntroduction: TextAnchor;
  sceneOrder: number; // original scene position (0-based)
}

export interface SpoilerViolation {
  revealId: string;
  reveal: Reveal;
  prematureMention: TextAnchor;
  properSceneId: string;
  severity: 'critical' | 'moderate' | 'minor';
  suggestedFix: AnchoredEdit;
  alternativeFixes?: AnchoredEdit[];
  reason: string;
}

// Internal LLM response schema
const AnchorSchema = z.object({ sceneId: z.string(), offset: z.number().int().nonnegative(), length: z.number().int().nonnegative() });
const RevealNodeSchema = z.object({
  revealId: z.string(),
  prerequisites: z.array(z.string()).default([]),
  firstMention: AnchorSchema.optional(),
  properIntroduction: AnchorSchema.optional(),
  sceneOrder: z.number().int().nonnegative().optional(),
});
const RevealGraphSchema = z.object({ nodes: z.array(RevealNodeSchema) });

// Utility helpers
function indexScenes(scenes: Scene[]): Map<string, number> {
  const map = new Map<string, number>();
  scenes.forEach((s, i) => map.set(s.id, i));
  return map;
}

function findSceneById(scenes: Scene[], id: string): Scene | undefined { return scenes.find(s => s.id === id); }

function findAnchor(scene: Scene | undefined, description: string): TextAnchor {
  if (!scene) return { sceneId: '', offset: 0, length: 0 };
  const firstTwo = description.split(/\s+/).slice(0, 2).join(' ');
  const idx = firstTwo ? scene.text.indexOf(firstTwo) : -1;
  const offset = Math.max(0, idx);
  const length = idx >= 0 ? Math.min(description.length, scene.text.length - offset) : Math.min(12, scene.text.length);
  return { sceneId: scene.id, offset, length };
}

function reorderScenes(candidate: OpeningCandidate, all: Scene[]): Scene[] {
  const set = new Set(candidate.scenes);
  const head: Scene[] = []; const tail: Scene[] = [];
  for (const s of all) (set.has(s.id) ? head : tail).push(s);
  return [...head, ...tail];
}

function buildReplaceEdit(anchor: TextAnchor, originalText: string, newText: string, reason: string): AnchoredEdit {
  return { id: `edit:${anchor.sceneId}:${anchor.offset}`, type: newText ? 'replace' : 'delete', anchor, originalText, newText, priority: 5, reason, source: 'spoiler' };
}

export class SpoilerDetector {
  async buildRevealGraph(
    scenes: Scene[],
    reveals: Reveal[]
  ): Promise<Map<string, RevealDependency>> {
    const sceneOrder = indexScenes(scenes);
    // Cache key incorporates reveal ids and scene ordering
    const cacheKey = 'spoilerGraph:' + globalLLMCache.generateCacheKey('STRUCTURE_LONGCTX', { ids: reveals.map(r => r.id), order: Array.from(sceneOrder.entries()) });

    return globalLLMCache.getOrCompute(cacheKey, async () => {
      // Attempt LLM-based dependency extraction
      const prompt = `Analyze these reveals and identify which ones depend on others.\\nReturn JSON only.\\nREVEALS=${JSON.stringify(reveals.map(r => ({ id: r.id, description: r.description, type: r.type, sceneId: r.sceneId })))}\\nJSON_SCHEMA={"nodes":[{"revealId":"string","prerequisites":["string"],"firstMention":{"sceneId":"string","offset":0,"length":0},"properIntroduction":{"sceneId":"string","offset":0,"length":0},"sceneOrder":0}]}`;
      const system = 'You are analyzing story reveals for dependencies and proper introduction order.';
      let nodes: Array<z.infer<typeof RevealNodeSchema>> | null = null;
      try {
        const res = await globalProviderAdapter.executeWithFallback<typeof RevealGraphSchema._type>('STRUCTURE_LONGCTX', { system, prompt, schema: RevealGraphSchema, profile: 'STRUCTURE_LONGCTX', temperature: 0.2 });
        const parsed = RevealGraphSchema.safeParse(res.json);
        if (parsed.success) nodes = parsed.data.nodes;
      } catch { /* fall back below */ }

      // Fallback: heuristic dependencies using existing deterministic engine
      const dep = buildDependencies(reveals);
      const revealMap = new Map(reveals.map(r => [r.id, r] as const));
      const result = new Map<string, RevealDependency>();

      if (!nodes) {
        // Materialize dependencies and stitch anchors
        const materialized = dep.materialize();
        for (const m of materialized) {
          const r = revealMap.get(m.revealId);
          if (!r) continue;
          const scene = findSceneById(scenes, r.sceneId);
          const anchor = findAnchor(scene, r.description);
          result.set(m.revealId, {
            revealId: m.revealId,
            reveal: r,
            prerequisites: new Set<string>(m.transitiveDeps),
            firstMention: anchor,
            properIntroduction: anchor,
            sceneOrder: sceneOrder.get(r.sceneId) ?? 0,
          });
        }
        return result;
      }

      // Use LLM nodes, fill gaps with heuristics
      const depById: Map<string, Set<string>> = new Map();
      for (const n of nodes) depById.set(n.revealId, new Set(n.prerequisites || []));
      const cycles = this.detectCycles(depById);
      if (cycles.length) {
        // Break cycles conservatively: remove edges from later scene to earlier scene
        for (const cyc of cycles) {
          for (let i = 0; i < cyc.length; i++) {
            const a = cyc[i]!; const b = cyc[(i + 1) % cyc.length]!;
            const aScene = revealMap.get(a)?.sceneId; const bScene = revealMap.get(b)?.sceneId;
            if (aScene && bScene && (sceneOrder.get(aScene) ?? 0) > (sceneOrder.get(bScene) ?? 0)) depById.get(a)?.delete(b);
          }
        }
      }

      for (const r of reveals) {
        const node = nodes.find(n => n.revealId === r.id);
        const fm = node?.firstMention || findAnchor(findSceneById(scenes, r.sceneId), r.description);
        const pi = node?.properIntroduction || fm;
        const deps = depById.get(r.id) || new Set<string>(dep.getPrerequisites(r.id));
        result.set(r.id, {
          revealId: r.id,
          reveal: r,
          prerequisites: new Set<string>(deps),
          firstMention: fm,
          properIntroduction: pi,
          sceneOrder: node?.sceneOrder ?? (sceneOrder.get(r.sceneId) ?? 0),
        });
      }
      return result;
    }, { maxAgeMs: 60 * 60 * 1000, staleAfterMs: 30 * 60 * 1000, revalidateAfterMs: 10 * 60 * 1000 });
  }

  async detectViolations(
    candidateOpening: OpeningCandidate,
    scenes: Scene[],
    revealGraph: Map<string, RevealDependency>
  ): Promise<SpoilerViolation[]> {
    const readingOrder = reorderScenes(candidateOpening, scenes);
    const originalIndex = indexScenes(scenes);

    const known = new Set<string>();
    const violations: SpoilerViolation[] = [];

    for (const scene of readingOrder) {
      // Introduce any reveals whose proper scene is this scene in original order
      for (const rd of revealGraph.values()) {
        if (rd.reveal.sceneId === scene.id) known.add(rd.revealId);
      }
      // Check mentions in this scene
      const sceneReveals = extractReveals(scene);
      for (const r of sceneReveals) {
        const rd = revealGraph.get(r.id);
        if (!rd) continue;
        const prereqs = rd.prerequisites || new Set<string>();
        const missing = Array.from(prereqs).filter(p => !known.has(p));
        if (missing.length === 0) { known.add(r.id); continue; }

        const mentionAnchor = findAnchor(scene, r.description);
        const properIdx = originalIndex.get(rd.reveal.sceneId) ?? 0;
        const currentIdx = originalIndex.get(scene.id) ?? 0;
        const distance = Math.max(0, properIdx - currentIdx);
        const severity = this.calculateSeverity(r, distance);
        const reason = `Missing prerequisites: ${missing.join(', ')}`;
        const suggested = buildReplaceEdit(mentionAnchor, scene.text.slice(mentionAnchor.offset, mentionAnchor.offset + mentionAnchor.length), this.placeholderFixText(r), `Soften or defer: ${reason}`);
        violations.push({
          revealId: r.id,
          reveal: r,
          prematureMention: mentionAnchor,
          properSceneId: rd.reveal.sceneId,
          severity,
          suggestedFix: suggested,
          reason,
        });
        // Do not add r.id to known yet (still premature)
      }
    }
    return violations;
  }

  async generateFixes(
    violations: SpoilerViolation[],
    manuscript: string
  ): Promise<Map<string, AnchoredEdit[]>> {
    const out = new Map<string, AnchoredEdit[]>();
    for (const v of violations) {
  const originalText = this.extractQuoted(manuscript, v.prematureMention) || v.reveal.description;
      const fixPrompt = `Original text: "${originalText}"\nThis prematurely reveals: ${v.reveal.description}\nGenerate 3 alternative phrasings that avoid the reveal while preserving tone. Return plain lines, no numbering.`;
      try {
        const res = await globalProviderAdapter.executeWithFallback('FAST_ITERATE', { prompt: fixPrompt, temperature: 0.7, profile: 'FAST_ITERATE' });
        const lines = (res.text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 3);
        const edits: AnchoredEdit[] = lines.map((l, i) => ({ id: `${v.revealId}:alt${i + 1}`, type: 'replace', anchor: v.prematureMention, originalText, newText: l, priority: 4, reason: 'Alternative spoiler-safe phrasing', source: 'spoiler' }));
        out.set(v.revealId, edits);
      } catch {
        out.set(v.revealId, [v.suggestedFix]);
      }
    }
    return out;
  }

  private placeholderFixText(reveal: Reveal): string {
    // Lightweight local fallback phrasing generator
    const desc = reveal.description;
    if (/\b(is|was)\b/.test(desc)) return desc.replace(/\b(is|was)\b/i, 'seems');
    return 'suggests something without stating it';
  }

  private extractQuoted(manuscript: string, anchor: TextAnchor): string | null {
    if (!anchor.sceneId) return null;
    // Best-effort: in absence of global offsets, we return the length-bound slice if available elsewhere.
    // Since we don't have global manuscript offsets for scenes here, this uses only offset/length heuristically.
    // Callers pass scene text in generateFixes when available; here we fall back to length as a safety.
    try {
      const start = Math.max(0, anchor.offset);
      const end = Math.min(start + anchor.length, manuscript.length);
      if (end > start) return manuscript.slice(start, end);
      return null;
    } catch { return null; }
  }

  private detectCycles(edges: Map<string, Set<string>>): string[][] {
    const cycles: string[][] = [];
    const state = new Map<string, number>(); // 0 unvisited, 1 visiting, 2 done
    const stack: string[] = [];
    const visit = (n: string) => {
      state.set(n, 1); stack.push(n);
      for (const m of edges.get(n) || []) {
        const s = state.get(m) || 0;
        if (s === 0) visit(m);
        else if (s === 1) {
          const at = stack.indexOf(m);
          if (at >= 0) cycles.push(stack.slice(at));
        }
      }
      stack.pop(); state.set(n, 2);
    };
    for (const k of edges.keys()) if ((state.get(k) || 0) === 0) visit(k);
    return cycles;
  }

  private calculateSeverity(
    reveal: Reveal,
    distance: number // scenes between mention and proper intro
  ): 'critical' | 'moderate' | 'minor' {
    // Priority keywords for twists
    const text = reveal.description.toLowerCase();
    if (reveal.type === 'plot' && (/twist|betrayal|killer|murderer/.test(text))) return 'critical';
    if (reveal.type === 'character' && (/mole|traitor|killer|dead|secret identity/.test(text))) return 'critical';
    if (reveal.type === 'relationship' || reveal.type === 'temporal') return distance >= 2 ? 'moderate' : 'minor';
    if (reveal.type === 'world') return distance >= 3 ? 'moderate' : 'minor';
    // Default: scale by distance
    if (distance >= 3) return 'critical';
    if (distance === 2) return 'moderate';
    return 'minor';
  }
}

export default { SpoilerDetector };
