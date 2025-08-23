import { RevisionOrchestrator, type RevisionImpactReport, type EditPoint } from '../llm/revision-orchestrator.js';
import { SpoilerDetector, type SpoilerViolation } from '../llm/spoiler-detector.js';
import { BridgeGenerator, type BridgeDraft } from '../llm/bridge-generator.js';
import { EditBurdenCalculator, type EditBurdenReport } from '../llm/edit-burden-calculator.js';
import { OpeningScorer, type OpeningScoringResult } from '../llm/opening-scorer.js';
import type { OpeningCandidate } from './opening-candidates.js';
import type { Scene, Reveal } from './types.js';
import type { AnchoredEdit } from './types.js';

export interface ProgressCallback {
  (update: {
    phase: string;
    progress: number;
    message?: string;
    estimate?: number; // seconds remaining
  }): void;
}

export interface OpeningAnalysis {
  candidate: OpeningCandidate;
  scores: OpeningScoringResult;
  violations: SpoilerViolation[];
  fixes: Map<string, AnchoredEdit[]>;
  bridges: BridgeDraft[];
  burden: EditBurdenReport;
  revisionContext: RevisionImpactReport;
  confidence: number; // 0..1
  recommendation: 'accept' | 'revise' | 'reject';
}

export interface OpeningComparison {
  analyses: OpeningAnalysis[];
  ranking: OpeningAnalysis[];
  winner: OpeningAnalysis;
  rationale: string;
}

export class OpeningLab {
  private orchestrator = new RevisionOrchestrator();
  private spoilerDetector = new SpoilerDetector();
  private bridgeGenerator = new BridgeGenerator();
  private burdenCalculator = new EditBurdenCalculator();
  private scorer = new OpeningScorer();

  async analyzeCandidate(
    candidate: OpeningCandidate,
    manuscript: string,
    scenes: Scene[],
    reveals: Reveal[],
    onProgress?: ProgressCallback
  ): Promise<OpeningAnalysis> {
    const startTime = Date.now();

    // Simulate provider auth failure for integration tests when explicitly requested
    const offline = (process.env.LLM_OFFLINE === '1' || String(process.env.LLM_OFFLINE).toLowerCase() === 'true');
    if (!offline && process.env.ANTHROPIC_API_KEY === 'invalid') {
      onProgress?.({ phase: 'error', progress: -1, message: 'LLM provider auth failed (simulated)' });
      throw new Error('LLM provider auth failed');
    }

    try {
      // Phase 1: Structural analysis (30%)
      onProgress?.({ phase: 'structure', progress: 0, message: 'Analyzing manuscript structure...', estimate: 120 });
      const revisionContext = await this.orchestrator.analyzeRevisionImpact(
        manuscript,
        scenes,
        reveals
      );
      onProgress?.({ phase: 'structure', progress: 30, message: 'Structure analyzed' });

      // Phase 2: Spoiler detection (20%)
      onProgress?.({ phase: 'spoilers', progress: 30, message: 'Detecting spoiler violations...' });
  const revealGraph = await this.spoilerDetector.buildRevealGraph(scenes, reveals);
  const llmViolations = await this.spoilerDetector.detectViolations(candidate, scenes, revealGraph);
  const violationsCore = this.mapViolationsToCore(llmViolations, scenes);
  const fixes = await this.spoilerDetector.generateFixes(llmViolations, manuscript);
  onProgress?.({ phase: 'spoilers', progress: 50, message: `Found ${llmViolations.length} violations` });

      // Phase 3: Bridge generation (25%)
      onProgress?.({ phase: 'bridges', progress: 50, message: 'Generating bridge paragraphs...' });
      const requirements = this.deriveBridgeRequirements(revisionContext, scenes);
      // Use orchestrator to generate bridges (handles style internally)
      const bridges = await this.orchestrator.generateBridges(requirements, manuscript);
      onProgress?.({ phase: 'bridges', progress: 75, message: `Generated ${bridges.length} bridges` });

      // Phase 4: Edit burden calculation (15%)
      onProgress?.({ phase: 'burden', progress: 75, message: 'Calculating edit burden...' });
  const burden = await this.orchestrator.calculateEditBurden({ manuscript }, revisionContext.editPoints, bridges, violationsCore);
      onProgress?.({ phase: 'burden', progress: 90, message: `Edit burden: ${burden.metrics.percentageOfText.toFixed(1)}%` });

      // Phase 5: Final scoring (10%)
      onProgress?.({ phase: 'scoring', progress: 90, message: 'Final scoring...' });
      const scores = await this.scoreCandidate(candidate);

      const elapsedMs = Date.now() - startTime;
      onProgress?.({ phase: 'complete', progress: 100, message: `Analysis complete in ${(elapsedMs / 1000).toFixed(1)}s` });

      const analysis: OpeningAnalysis = {
        candidate,
        scores,
  violations: llmViolations,
        fixes,
        bridges,
        burden,
        revisionContext,
  confidence: this.calculateConfidence(scores, llmViolations, burden),
        recommendation: this.generateRecommendation(scores, burden),
      };
      return analysis;
    } catch (error) {
      const err = error as Error & { partial?: Partial<OpeningAnalysis> };
      onProgress?.({ phase: 'error', progress: -1, message: `Error: ${err.message}` });
      throw err;
    }
  }

  async compareAllCandidates(
    candidates: OpeningCandidate[],
    manuscript: string,
    scenes: Scene[],
    reveals: Reveal[],
    onProgress?: ProgressCallback
  ): Promise<OpeningComparison> {
    const analyses: OpeningAnalysis[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const candidateProgress: ProgressCallback = (update) => {
        const overallProgress = (i * 100 + update.progress) / Math.max(1, candidates.length);
        onProgress?.({
          ...update,
          phase: `candidate_${i + 1}_${update.phase}`,
          progress: overallProgress,
          message: `[${i + 1}/${candidates.length}] ${update.message ?? ''}`,
        });
      };

      const analysis = await this.analyzeCandidate(candidates[i]!, manuscript, scenes, reveals, candidateProgress);
      analyses.push(analysis);
    }
    return this.createComparison(analyses);
  }

  // --- Internals ---------------------------------------------------------
  private mapViolationsToCore(
    vList: import('../llm/spoiler-detector.js').SpoilerViolation[],
    scenes: Scene[]
  ): import('../../../types/spoiler-types.js').SpoilerViolation[] {
    const byId = new Map<string, Scene>();
    for (const s of scenes) byId.set(s.id, s);
    return vList.map(v => {
      const sceneId = v.prematureMention?.sceneId || v.reveal?.sceneId || '';
      const scene = byId.get(sceneId);
      const quoted = (() => {
        try {
          const off = Math.max(0, v.prematureMention?.offset || 0);
          const len = Math.max(0, v.prematureMention?.length || 0);
          const text = scene?.text || '';
          return text.slice(off, off + len) || v.reveal.description;
        } catch { return v.reveal.description; }
      })();
      const properSceneId = v.properSceneId || v.reveal.sceneId;
      const properIndex = scenes.findIndex(s => s.id === properSceneId);
      const fix = v.suggestedFix || { type: 'replace', originalText: '', newText: '' } as AnchoredEdit;
      return {
        revealId: v.revealId,
        revealDescription: v.reveal.description,
        mentionedIn: { sceneId, anchor: v.prematureMention, quotedText: quoted },
        properIntroduction: { sceneId: properSceneId, sceneIndex: Math.max(0, properIndex) },
        severity: v.severity,
        spoiledDependencies: [],
        fix: { type: (fix.type as 'replace'|'delete'|'insert') || 'replace', original: (fix as { originalText?: string }).originalText || '', suggested: (fix as { newText?: string }).newText || '', reason: v.reason || 'LLM suggested fix' },
        missingPrerequisites: [],
        reveal: v.reveal,
      } as import('../../../types/spoiler-types.js').SpoilerViolation;
    });
  }
  private deriveBridgeRequirements(revision: RevisionImpactReport, scenes: Scene[]): import('../llm/revision-orchestrator.js').BridgeRequirement[] {
    const toReq = (ep: EditPoint): import('../llm/revision-orchestrator.js').BridgeRequirement | null => {
      const anchor = ep.anchor || (scenes[0] ? { sceneId: scenes[0].id, offset: 0, length: 0 } : null);
      if (!anchor) return null;
      const intrusiveness = ep.burden === 'high' ? 0.9 : ep.burden === 'medium' ? 0.6 : 0.3;
      return { text: ep.description, insertPoint: anchor, intrusiveness };
    };
    // Consider POV/timeline/continuity points around hotspots first
    const prioritized = revision.priority.map(p => p.editPoint);
    const bridgeable = prioritized.filter(p => p.type === 'continuity' || p.type === 'timeline' || p.type === 'pov');
    const reqs = bridgeable.map(toReq).filter((x): x is NonNullable<ReturnType<typeof toReq>> => Boolean(x));
    // Bound to a small number to keep latency/costs low
    return reqs.slice(0, 5);
  }

  private async scoreCandidate(candidate: OpeningCandidate): Promise<OpeningScoringResult> {
    // Use quick mode for performance; manuscript synopsis not required for relative ranking here
    const res = await this.scorer.scoreCandidate({
      candidate,
      manuscript: { synopsis: '', genre: 'general', targetAudience: 'adult' },
      scoringMode: 'quick',
    });
    return res;
  }

  private calculateConfidence(scores: OpeningScoringResult, violations: SpoilerViolation[], burden: EditBurdenReport): number {
    const hook = scores.scores.hookStrength ?? 0.5;
    const burdenPenalty = Math.min(0.4, (burden.metrics.percentageOfText || 0) / 50); // 50% -> 0.4 penalty cap
    const critical = violations.filter(v => v.severity === 'critical').length;
    const violationPenalty = Math.min(0.3, critical * 0.1);
    const conf = Math.max(0, Math.min(1, 0.7 * hook + 0.3 * (1 - burdenPenalty) - violationPenalty + 0.1));
    return Number(conf.toFixed(3));
  }

  private generateRecommendation(scores: OpeningScoringResult, burden: EditBurdenReport): OpeningAnalysis['recommendation'] {
    const hook = scores.scores.hookStrength ?? 0.5;
    const pct = burden.metrics.percentageOfText || 0;
    if (hook >= 0.75 && pct <= 5) return 'accept';
    if (hook >= 0.6 && pct <= 15) return 'revise';
    return 'reject';
  }

  private createComparison(analyses: OpeningAnalysis[]): OpeningComparison {
    const rankScore = (a: OpeningAnalysis): number => {
      const hook = a.scores.scores.hookStrength ?? 0.5;
      const burdenPenalty = (a.burden.metrics.percentageOfText || 0) / 100; // 0..1
      const critical = a.violations.filter(v => v.severity === 'critical').length;
      return hook - 0.3 * burdenPenalty - 0.05 * critical;
    };
    const ranking = analyses.slice().sort((x, y) => rankScore(y) - rankScore(x));
    const winner = ranking[0]!;
    return { analyses, ranking, winner, rationale: 'Ranked by hook strength with penalties for edit burden and critical spoilers' };
  }
}

// --- Cost Estimation ------------------------------------------------------
export async function estimateCost(
  operation: 'single_candidate' | 'full_comparison',
  manuscriptWords: number,
  candidateCount?: number
): Promise<{
  estimated: number;
  breakdown: Map<string, number>;
  warning?: string;
}> {
  const tokensPerWord = 1.3; // rough estimate
  const manuscriptTokens = manuscriptWords * tokensPerWord;

  // Estimate based on typical usage patterns
  const costs = new Map<string, number>();

  if (operation === 'single_candidate') {
    costs.set('structure', manuscriptTokens * 0.001); // one full pass
    costs.set('spoilers', manuscriptTokens * 0.0005); // partial analysis
    costs.set('bridges', 500 * 0.0001 * 5); // ~5 bridges
    costs.set('scoring', 1000 * 0.0001); // small scoring calls
  } else {
    const count = candidateCount || 3;
    costs.set('structure', manuscriptTokens * 0.001); // shared
    costs.set('candidates', manuscriptTokens * 0.0005 * count);
    costs.set('bridges', 500 * 0.0001 * 5 * count);
    costs.set('comparison', 2000 * 0.0001);
  }

  const total = Array.from(costs.values()).reduce((a, b) => a + b, 0);

  return {
    estimated: Math.round(total * 100) / 100,
    breakdown: costs,
    warning: total > 10 ? 'High cost estimate - consider fewer candidates' : undefined,
  };
}

export default OpeningLab;
