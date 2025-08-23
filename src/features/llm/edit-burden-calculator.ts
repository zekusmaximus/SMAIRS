// src/features/llm/edit-burden-calculator.ts
// Precise edit burden calculator that quantifies revision effort across edit types.

import type { BridgeDraft } from './bridge-generator.js';
import type { SpoilerViolation as SpoilerTypesViolation } from '../../../types/spoiler-types.js';
import type { EditPoint } from './revision-orchestrator.js';

export interface EditMetrics {
  totalWords: number;
  editedWords: number;
  newWords: number;
  deletedWords: number;
  complexityScore: number; // 1-10
  estimatedMinutes: number;
  percentageOfText: number;
}

export interface EditBurdenReport {
  metrics: EditMetrics;
  breakdown: {
    spoilerFixes: EditMetrics;
    bridgeParagraphs: EditMetrics;
    povAdjustments: EditMetrics;
    chronologyFixes: EditMetrics;
  };
  editsByChapter: Map<string, EditMetrics>;
  criticalEdits: number;
  totalEdits: number;
  confidence: number;
}

function wc(s: string | undefined | null): number { return (s || '').trim().split(/\s+/).filter(Boolean).length; }
function chapterFromSceneId(sceneId: string | undefined): string {
  if (!sceneId) return 'unknown';
  const m = /(ch\d{2})/i.exec(sceneId);
  if (m && m[1]) return m[1].toLowerCase();
  const idx = sceneId.indexOf('_');
  return idx > 0 ? sceneId.slice(0, idx) : sceneId;
}

function getViolationSceneId(v: unknown): string {
  const anyV = v as { mentionedIn?: { sceneId?: string }; prematureMention?: { sceneId?: string }; reveal?: { sceneId?: string } };
  return anyV?.mentionedIn?.sceneId || anyV?.prematureMention?.sceneId || anyV?.reveal?.sceneId || 'unknown';
}

function getViolationFix(v: unknown): { type?: string; original?: string; suggested?: string } {
  const anyV = v as { fix?: { type?: string; original?: string; suggested?: string }; suggestedFix?: { type?: string; originalText?: string; newText?: string } };
  if (anyV.fix) return anyV.fix;
  if (anyV.suggestedFix) {
    const f = anyV.suggestedFix;
    return { type: f.type, original: (f as { originalText?: string }).originalText, suggested: (f as { newText?: string }).newText };
  }
  return {};
}

export class EditBurdenCalculator {
  private readonly WORDS_PER_MINUTE = 40; // editing speed
  private readonly COMPLEXITY_MULTIPLIERS = { simple: 1.0, moderate: 1.5, complex: 2.5 } as const;

  async calculateBurden(
    editPoints: EditPoint[],
    bridges: BridgeDraft[],
    violations: SpoilerTypesViolation[],
    manuscript: string
  ): Promise<EditBurdenReport> {
    const totalWords = wc(manuscript);

    const spoilerMetrics = this.calculateSpoilerMetrics(violations, totalWords);
    const bridgeMetrics = this.calculateBridgeMetrics(bridges, totalWords);
    const povMetrics = this.calculatePOVMetrics(editPoints.filter(e => e.type === 'pov'), totalWords);
    const chronologyMetrics = this.calculateChronologyMetrics(editPoints.filter(e => e.type === 'timeline'), totalWords);

    const totalMetrics: EditMetrics = {
      totalWords,
      editedWords: povMetrics.editedWords + chronologyMetrics.editedWords + spoilerMetrics.editedWords,
      newWords: bridgeMetrics.newWords + spoilerMetrics.newWords,
      deletedWords: spoilerMetrics.deletedWords + povMetrics.deletedWords + chronologyMetrics.deletedWords,
      complexityScore: this.averageComplexity([
        spoilerMetrics.complexityScore,
        bridgeMetrics.complexityScore,
        povMetrics.complexityScore,
        chronologyMetrics.complexityScore,
      ]),
      estimatedMinutes: 0,
      percentageOfText: 0,
    };

    totalMetrics.percentageOfText = ((totalMetrics.editedWords + totalMetrics.newWords) / Math.max(1, totalWords)) * 100;
    const baseMinutes = (totalMetrics.editedWords + totalMetrics.newWords) / this.WORDS_PER_MINUTE;
    const complexityMultiplier = 1 + (totalMetrics.complexityScore - 5) * 0.1; // 5 neutral baseline
    totalMetrics.estimatedMinutes = Math.round(baseMinutes * complexityMultiplier);

    const editsByChapter = this.groupEditsByChapter(editPoints, bridges, violations, totalWords);

    const criticalEdits = editPoints.filter(e => e.burden === 'high').length + violations.filter(v => v.severity === 'critical').length;
    const totalEdits = editPoints.length + bridges.length + violations.length;
    const confidence = this.calculateConfidence(editPoints, bridges, violations);

    return {
      metrics: totalMetrics,
      breakdown: {
        spoilerFixes: spoilerMetrics,
        bridgeParagraphs: bridgeMetrics,
        povAdjustments: povMetrics,
        chronologyFixes: chronologyMetrics,
      },
      editsByChapter,
      criticalEdits,
      totalEdits,
      confidence,
    };
  }

  async estimateTimeToComplete(
    report: EditBurdenReport
  ): Promise<{ optimistic: number; realistic: number; pessimistic: number }> {
    const base = report.metrics.estimatedMinutes;
    return { optimistic: Math.round(base * 0.7), realistic: base, pessimistic: Math.round(base * 1.5) };
  }

  private categorizeComplexity(edit: EditPoint): 'simple' | 'moderate' | 'complex' {
    if (edit.type === 'pov') return 'complex';
    if (edit.burden === 'high') return 'complex';
    if (edit.burden === 'low' || edit.type === 'continuity') return 'simple';
    return 'moderate';
  }

  private aggregateMetrics(edits: EditPoint[], totalWords = 1): EditMetrics {
  let editedWords = 0; const deletedWords = 0; let newWords = 0; const complexities: number[] = [];
    for (const e of edits) {
      const c = this.categorizeComplexity(e);
      const mult = this.COMPLEXITY_MULTIPLIERS[c];
      complexities.push(c === 'simple' ? 3 : c === 'moderate' ? 5.5 : 8);
      // Heuristics per type
      if (e.type === 'pov') { editedWords += 25 * mult; }
      else if (e.type === 'timeline') { editedWords += 15 * mult; }
      else if (e.type === 'continuity') { editedWords += 8 * mult; }
      else if (e.type === 'bridge') { newWords += 30 * mult; }
    }
    const complexityScore = this.averageComplexity(complexities);
    const minutes = (editedWords + newWords) / this.WORDS_PER_MINUTE * (1 + (complexityScore - 5) * 0.1);
    return {
      totalWords,
      editedWords: Math.round(editedWords),
      newWords: Math.round(newWords),
      deletedWords: Math.round(deletedWords),
      complexityScore,
      estimatedMinutes: Math.round(minutes),
      percentageOfText: Math.round(((editedWords + newWords) / Math.max(1, totalWords)) * 1000) / 10,
    };
  }

  // --- Category calculators -----------------------------------------------
  private calculateSpoilerMetrics(violations: SpoilerTypesViolation[], totalWords: number): EditMetrics {
    let editedWords = 0; let newWords = 0; let deletedWords = 0; const complexity: number[] = [];
    for (const v of violations) {
      const fix = v.fix;
      const o = wc(fix?.original);
      const n = wc(fix?.suggested);
      if (fix?.type === 'replace') { editedWords += o; if (n > o) newWords += (n - o); else deletedWords += (o - n); }
      else if (fix?.type === 'insert') { newWords += n; }
      else if (fix?.type === 'delete') { deletedWords += o; }
      complexity.push(v.severity === 'critical' ? 8.5 : v.severity === 'moderate' ? 6 : 4);
    }
    const complexityScore = this.averageComplexity(complexity);
    const minutes = (editedWords + newWords) / this.WORDS_PER_MINUTE * (1 + (complexityScore - 5) * 0.1);
    return { totalWords, editedWords, newWords, deletedWords, complexityScore, estimatedMinutes: Math.round(minutes), percentageOfText: ((editedWords + newWords) / Math.max(1, totalWords)) * 100 };
  }

  private calculateBridgeMetrics(bridges: BridgeDraft[], totalWords: number): EditMetrics {
    const newWords = bridges.reduce((a, b) => a + (b.wordCount || wc(b.text)), 0);
    const complexity = bridges.map(b => (b.wordCount > 60 ? 6.5 : 5));
    const complexityScore = this.averageComplexity(complexity);
    const minutes = newWords / this.WORDS_PER_MINUTE * (1 + (complexityScore - 5) * 0.1);
    return { totalWords, editedWords: 0, newWords, deletedWords: 0, complexityScore, estimatedMinutes: Math.round(minutes), percentageOfText: (newWords / Math.max(1, totalWords)) * 100 };
  }

  private calculatePOVMetrics(edits: EditPoint[], totalWords: number): EditMetrics {
    const metrics = this.aggregateMetrics(edits, totalWords);
    return metrics;
  }

  private calculateChronologyMetrics(edits: EditPoint[], totalWords: number): EditMetrics {
    const metrics = this.aggregateMetrics(edits, totalWords);
    return metrics;
  }

  // --- Breakdown helpers ---------------------------------------------------
  private groupEditsByChapter(editPoints: EditPoint[], bridges: BridgeDraft[], violations: SpoilerTypesViolation[], totalWords: number): Map<string, EditMetrics> {
    const map = new Map<string, EditMetrics>();
    const add = (chapter: string, delta: Partial<EditMetrics>) => {
      const cur = map.get(chapter) || { totalWords, editedWords: 0, newWords: 0, deletedWords: 0, complexityScore: 0, estimatedMinutes: 0, percentageOfText: 0 };
      const updated: EditMetrics = { ...cur };
      updated.editedWords += delta.editedWords || 0;
      updated.newWords += delta.newWords || 0;
      updated.deletedWords += delta.deletedWords || 0;
      // complexityScore: track as weighted average by word impact
      const impact = (delta.editedWords || 0) + (delta.newWords || 0);
      const totalImpact = (cur.editedWords + cur.newWords) || 1;
      if (delta.complexityScore != null && impact > 0) {
        updated.complexityScore = ((cur.complexityScore * totalImpact) + delta.complexityScore * impact) / (totalImpact + impact);
      }
      updated.estimatedMinutes = Math.round(((updated.editedWords + updated.newWords) / this.WORDS_PER_MINUTE) * (1 + (updated.complexityScore - 5) * 0.1));
      updated.percentageOfText = ((updated.editedWords + updated.newWords) / Math.max(1, totalWords)) * 100;
      map.set(chapter, updated);
    };

    // From edit points (pov, timeline, continuity)
    for (const e of editPoints) {
      const ch = chapterFromSceneId(e.sceneId);
      const cat = this.categorizeComplexity(e);
      const mult = this.COMPLEXITY_MULTIPLIERS[cat];
      const edited = e.type === 'pov' ? 25 * mult : e.type === 'timeline' ? 15 * mult : e.type === 'continuity' ? 8 * mult : 0;
      if (edited > 0) add(ch, { editedWords: Math.round(edited), complexityScore: cat === 'simple' ? 3 : cat === 'moderate' ? 5.5 : 8 });
    }

    // From bridges
    for (const b of bridges) {
      const ch = chapterFromSceneId(b.insertionAnchor?.sceneId);
      const n = b.wordCount || wc(b.text);
      add(ch, { newWords: n, complexityScore: n > 60 ? 6.5 : 5 });
    }

    // From spoiler fixes
    for (const v of violations) {
      const ch = chapterFromSceneId(getViolationSceneId(v));
      const fix = getViolationFix(v);
      const o = wc(fix?.original); const n = wc(fix?.suggested);
      if (fix?.type === 'replace') add(ch, { editedWords: o, newWords: n > o ? (n - o) : 0, deletedWords: o > n ? (o - n) : 0, complexityScore: v.severity === 'critical' ? 8.5 : v.severity === 'moderate' ? 6 : 4 });
      else if (fix?.type === 'insert') add(ch, { newWords: n, complexityScore: 5 });
      else if (fix?.type === 'delete') add(ch, { deletedWords: o, complexityScore: 4.5 });
    }

    return map;
  }

  private averageComplexity(vals: number[]): number {
    const arr = vals.filter(v => Number.isFinite(v));
    if (!arr.length) return 5;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.round(avg * 10) / 10;
  }

  private calculateConfidence(editPoints: EditPoint[], bridges: BridgeDraft[], violations: SpoilerTypesViolation[]): number {
    const n = editPoints.length + bridges.length + violations.length;
    if (n === 0) return 1;
    const variancePenalty = Math.min(0.3, Math.abs(bridges.length - violations.length) / Math.max(1, n));
    const sizePenalty = Math.min(0.3, n / 100);
    return Math.max(0.5, 1 - variancePenalty - sizePenalty);
  }
}

export default { EditBurdenCalculator };
