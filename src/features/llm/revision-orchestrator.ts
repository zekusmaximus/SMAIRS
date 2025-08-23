import type { Scene, Reveal, AnchoredEdit } from '../manuscript/types.js';
import type { TextAnchor } from '../../../types/spoiler-types.js';
import { analyzeStructure, type StructuralAnalysisResponse, type HotSpot } from './structure-analyzer.js';
import { analyzeScenes, extractCharacters } from '../manuscript/analyzer.js';
import { SpoilerDetector } from './spoiler-detector.js';

// Lightweight domain shapes local to the orchestrator (Phase 2 scope)
export interface KnowledgeState {
  // character -> firstSeen scene id and first anchor
  firstSeen: Map<string, { sceneId: string; anchor: TextAnchor | null }>;
  // per scene character presence (for POV heuristics)
  byScene: Map<string, Set<string>>;
}

export interface POVInconsistency {
  sceneId: string;
  from?: string | null;
  to?: string | null;
  description: string;
  anchors: TextAnchor[];
}

export interface CharacterKnowledgeGap {
  character: string;
  sceneId: string;
  anchor: TextAnchor | null;
  missingFacts: string[];
}

export interface BridgeRequirement {
  text: string;
  insertPoint: TextAnchor;
  intrusiveness: number; // 0..1
}

export type EditPointType = 'bridge' | 'continuity' | 'pov' | 'timeline';

export interface EditPoint {
  id: string;
  sceneId: string;
  type: EditPointType;
  description: string;
  anchor: TextAnchor | null;
  burden: 'low' | 'medium' | 'high';
  suggestedEdit?: AnchoredEdit;
}

export interface TimelineConflict { sceneId: string; description: string; severity: 'low'|'medium'|'high' }

export interface PriorityItem {
  editPoint: EditPoint;
  priorityScore: number; // 0..1
  reasons: string[];
}

export interface RevisionImpactReport {
  structure: StructuralAnalysisResponse;
  knowledge: KnowledgeState;
  povInconsistencies: POVInconsistency[];
  chronologyIssues: TimelineConflict[];
  editPoints: EditPoint[];
  priority: PriorityItem[];
}

/**
 * Coordinates structure analysis and in-repo heuristics to surface concrete, anchored edit points
 * and a simple priority matrix. Uses long-context profile implicitly via analyzeStructure.
 */
export class RevisionOrchestrator {
  constructor() {}

  /** Main entry: end-to-end impact analysis producing a priority matrix. */
  async analyzeRevisionImpact(manuscript: string, scenes: Scene[], reveals: Reveal[]): Promise<RevisionImpactReport> {
    // 1) Global structural pass (LLM-backed with caching)
    const structure = await analyzeStructure({ manuscript, scenes, reveals, mode: 'full' });

    // 2) Heuristic passes
    const knowledge = this.trackCharacterKnowledge(scenes);
    const povIssues = this.suggestPOVAdjustments(scenes);
    const chronology = this.detectChronologyIssues(scenes);
    const editPoints = this.identifyEditPoints(scenes, { povIssues, chronology });

    // 3) Spoiler detection pass (LLM + heuristics). Use the highest-ranked candidate from structure if available; otherwise use first scene as opening.
    // Note: we keep it optional in the report for now; downstream UI/tests can call detector directly if needed.
    try {
      const spoilerDetector = new SpoilerDetector();
      const graph = await spoilerDetector.buildRevealGraph(scenes, reveals);
      // If structure provides any hotspots, pick the earliest as implied opening; else default to first scene
      const openingSceneId = scenes[0]?.id;
      const openingCandidate = { id: 'orchestrator:auto', type: 'single', scenes: openingSceneId ? [openingSceneId] : [], startOffset: 0, endOffset: 0, totalWords: 0, hookScore: 0, actionDensity: 0, mysteryQuotient: 0, characterIntros: 0, dialogueRatio: 0 } as unknown as import('../manuscript/opening-candidates.js').OpeningCandidate;
      await spoilerDetector.detectViolations(openingCandidate, scenes, graph); // fire-and-forget; future: attach to report
    } catch { /* non-fatal */ }

  // 4) Prioritize based on hotspots + severity
    const priority = this.buildPriorityMatrix(editPoints, structure.hotspots);

    return { structure, knowledge, povInconsistencies: povIssues, chronologyIssues: chronology, editPoints, priority };
  }

  /**
   * Identify concrete edit points using heuristic signals (POV shifts near hotspots, chronology flags).
   */
  identifyEditPoints(
    scenes: Scene[],
    context?: { povIssues?: POVInconsistency[]; chronology?: TimelineConflict[] }
  ): EditPoint[] {
    const points: EditPoint[] = [];
    const pov = context?.povIssues || [];
    for (const p of pov) {
      const id = `pov:${p.sceneId}:${p.from || 'unknown'}->${p.to || 'unknown'}`;
      points.push({ id, sceneId: p.sceneId, type: 'pov', description: p.description, anchor: p.anchors[0] || null, burden: 'low' });
    }
    const chrono = context?.chronology || [];
    for (const c of chrono) {
      const id = `time:${c.sceneId}`;
      const burden: EditPoint['burden'] = c.severity === 'high' ? 'high' : c.severity === 'medium' ? 'medium' : 'low';
      points.push({ id, sceneId: c.sceneId, type: 'timeline', description: c.description, anchor: null, burden });
    }

    // Light continuity: flag scenes with extremely sparse character continuity (abrupt swaps)
    const analysis = analyzeScenes(scenes);
    for (let i = 1; i < scenes.length; i++) {
      const prev = scenes[i - 1]; const cur = scenes[i];
      if (!prev || !cur) continue;
      const a = analysis.charactersPerScene.get(prev.id) || new Set<string>();
      const b = analysis.charactersPerScene.get(cur.id) || new Set<string>();
      const shared = this.intersection(a, b).size;
      if (shared === 0 && a.size && b.size) {
        const id = `cont:${cur.id}`;
        const desc = 'Abrupt character continuity change (no shared characters with previous scene)';
        points.push({ id, sceneId: cur.id, type: 'continuity', description: desc, anchor: this.firstAnchor(cur), burden: 'medium' });
      }
    }

    return points;
  }

  /** Build a simple knowledge map: first seen anchors per character and per-scene presence. */
  trackCharacterKnowledge(scenes: Scene[]): KnowledgeState {
    const firstSeen = new Map<string, { sceneId: string; anchor: TextAnchor | null }>();
    const byScene = new Map<string, Set<string>>();
    for (const sc of scenes) {
      if (!sc) continue;
      const chars = extractCharacters(sc);
      byScene.set(sc.id, chars);
      for (const c of chars) {
        if (!firstSeen.has(c)) {
          const idx = this.indexOfIgnoreCase(sc.text, c);
          const anchor: TextAnchor | null = idx >= 0 ? { sceneId: sc.id, offset: idx, length: c.length } : null;
          firstSeen.set(c, { sceneId: sc.id, anchor });
        }
      }
    }
    return { firstSeen, byScene };
  }

  /**
   * POV adjustment suggestions: detect dominant character swaps and surface anchors.
   */
  suggestPOVAdjustments(scenes: Scene[]): POVInconsistency[] {
    const issues: POVInconsistency[] = [];
    if (scenes.length === 0) return issues;
    const analysis = analyzeScenes(scenes);
    const dom = (set: Set<string> | undefined): string | null => {
      if (!set || set.size === 0) return null;
      return Array.from(set).sort()[0] || null; // stable representative
    };
    let last = dom(analysis.charactersPerScene.get(scenes[0]!.id));
    for (let i = 1; i < scenes.length; i++) {
      const sc = scenes[i]; if (!sc) continue;
      const cur = dom(analysis.charactersPerScene.get(sc.id));
      if (cur && last && cur !== last) {
        const idx = this.indexOfIgnoreCase(sc.text, cur);
        const anchor: TextAnchor | null = idx >= 0 ? { sceneId: sc.id, offset: idx, length: cur.length } : null;
        issues.push({ sceneId: sc.id, from: last, to: cur, description: `POV shift from ${last} to ${cur}`, anchors: anchor ? [anchor] : [] });
      }
      if (cur) last = cur;
    }
    return issues;
  }

  /**
   * Minimal chronology detector: flags scenes starting with temporal regressions like "Earlier", "Two days before", etc.
   */
  detectChronologyIssues(scenes: Scene[]): TimelineConflict[] {
    const conflicts: TimelineConflict[] = [];
    const retro = /\b(earlier|previously|two\s+days\s+before|last\s+night|years\s+ago)\b/i;
    for (const sc of scenes) {
      if (!sc) continue;
      const head = (sc.text || '').slice(0, 280);
      if (retro.test(head)) {
        conflicts.push({ sceneId: sc.id, description: 'Potential flashback detected; check chronology alignment', severity: 'medium' });
      }
    }
    return conflicts;
  }

  // --- Helpers ------------------------------------------------------
  private firstAnchor(scene: Scene): TextAnchor | null {
    const chars = extractCharacters(scene);
    const first = Array.from(chars)[0];
    if (!first) return null;
    const idx = this.indexOfIgnoreCase(scene.text, first);
    return idx >= 0 ? { sceneId: scene.id, offset: idx, length: first.length } : null;
  }

  private indexOfIgnoreCase(hay: string, needle: string): number { return hay.toLowerCase().indexOf(needle.toLowerCase()); }
  private intersection(a: Set<string>, b: Set<string>): Set<string> { const out = new Set<string>(); for (const x of a) if (b.has(x)) out.add(x); return out; }

  private buildPriorityMatrix(points: EditPoint[], hotspots: HotSpot[]): PriorityItem[] {
    const bySceneHot = new Map<string, number>();
    for (const h of hotspots) bySceneHot.set(h.sceneId, Math.max(bySceneHot.get(h.sceneId) || 0, h.tensionScore));
    const scoreBurden = (b: EditPoint['burden']): number => b === 'high' ? 0.9 : b === 'medium' ? 0.6 : 0.3;
    const items: PriorityItem[] = [];
    for (const p of points) {
      const reasons: string[] = [];
      const hot = bySceneHot.get(p.sceneId) || 0;
      if (hot > 0) reasons.push(`Hotspot tension=${hot.toFixed(2)}`);
      reasons.push(`Burden=${p.burden}`);
      const base = scoreBurden(p.burden);
      const score = Math.max(0, Math.min(1, base * 0.6 + hot * 0.4));
      items.push({ editPoint: p, priorityScore: Number(score.toFixed(3)), reasons });
    }
    // Highest priority first
    items.sort((a, b) => b.priorityScore - a.priorityScore);
    return items;
  }
}

export default { RevisionOrchestrator };
