import type { Manuscript } from './types.js';
import type { OpeningCandidate } from './opening-candidates.js';
import { OpeningScorer } from '../llm/opening-scorer.js';
import { buildComparativeReport } from './opening-report.js';
import type { ComparativeReport } from './opening-report.js';
import type { SpoilerAnalysis } from '../../../types/spoiler-types.js';
import type { ContextAnalysis } from './context-analyzer.js';
import type { EditBurden } from '../../../types/burden-types.js';

export type OpeningLabReport = ComparativeReport;

export class OpeningLabOrchestrator {
  private scorer: OpeningScorer;

  constructor() { this.scorer = new OpeningScorer(); }

  async analyzeOpenings(
    manuscript: Manuscript,
    candidates: OpeningCandidate[]
  ): Promise<OpeningLabReport> {
    // Step 1: Score all candidates (quick)
    const scores = await this.scorer.scoreBatch(candidates, 'quick');

    // Step 2: Deep score top 3
    const topCandidates = this.selectTop(candidates, scores, 3);
    const deepScores = await this.scorer.scoreBatch(topCandidates, 'thorough');

    // Step 3: Comparative judgment (placeholder – reuse scores for now)
  await this.compareTopCandidates(topCandidates, deepScores);

  return this.compileReport(manuscript, candidates);
  }

  private selectTop(all: OpeningCandidate[], quick: Map<string, { scores: { hookStrength: number } }>, n: number): OpeningCandidate[] {
    return all
      .slice()
      .sort((a, b) => (quick.get(b.id)?.scores.hookStrength ?? b.hookScore) - (quick.get(a.id)?.scores.hookStrength ?? a.hookScore))
      .slice(0, n);
  }

  private async compareTopCandidates(cands: OpeningCandidate[], deep: Map<string, { scores?: { hookStrength?: number; marketAppeal?: number; agentReadability?: number } }>): Promise<{ winnerId: string }> {
    // Placeholder: choose best by average of hook + market/agent from deep scores
    let bestId = cands[0]?.id || '';
    let bestScore = -1;
    for (const c of cands) {
  const ds = deep.get(c.id);
  const s = ds?.scores || {};
      const composite = Number(s.hookStrength || c.hookScore) + Number(s.marketAppeal || 0.5) + Number(s.agentReadability || 0.5);
      if (composite > bestScore) { bestScore = composite; bestId = c.id; }
    }
    return { winnerId: bestId };
  }

  private compileReport(
    manuscript: Manuscript,
    candidates: OpeningCandidate[],
  ): OpeningLabReport {
    // For now, adapt to existing ComparativeReport inputs by fabricating placeholder spoiler/context/burden
    const spoilers: SpoilerAnalysis = { violations: [], summary: { totalMentions: 0, scenesAffected: 0, critical: 0, moderate: 0, minor: 0 } } as unknown as SpoilerAnalysis;
    const context: ContextAnalysis = { gaps: [] } as unknown as ContextAnalysis;
    const burden: EditBurden = { candidateId: '', metrics: { originalWords: 0, addedWords: 0, deletedWords: 0, modifiedWords: 0, affectedSpans: 0, percentAdded: 0, percentDeleted: 0, percentModified: 0, percentUntouched: 1, totalChangePercent: 0 }, complexity: { avgWordsPerEdit: 0, maxConsecutiveEdits: 0, editDensity: 0, fragmentationScore: 0 }, timeEstimates: { minutesToImplement: 0, minutesToReview: 0, totalMinutes: 0, confidenceLevel: 'high' }, editsByType: { contextBridges: [], spoilerFixes: [], continuityPatches: [], optionalEnhancements: [] }, assessment: { burden: 'minimal', feasibility: 'trivial', recommendation: 'Proceed' } } as unknown as EditBurden;

    const labeled = candidates.map((c, i) => ({ candidate: c, spoilers, context, burden, label: i === 0 ? 'Current Opening' : `Alt ${i}` }));
    return buildComparativeReport({ manuscriptId: manuscript.id, candidates: labeled });
  }
}

export default OpeningLabOrchestrator;
