// Comparative opening report generation
// Implements scoring, comparison matrix, markdown rendering orchestration.

import type { OpeningCandidate } from './opening-candidates.js';
import type { SpoilerAnalysis } from '../../../types/spoiler-types.js';
import type { ContextAnalysis } from './context-analyzer.js';
import type { EditBurden } from '../../../types/burden-types.js';
import { DiffEngine, type DiffResult } from './diff-engine.js';
import { DiffVisualizer } from './diff-visualizer.js';
import { DiffMarkdownGenerator } from './diff-markdown.js';
import type { Scene } from './types.js';
import {
  generateSpoilerHeatmap,
  buildRadarData,
  buildEditBurdenChartData,
  buildDecisionTreeData,
  renderEditBurdenChart,
  renderScoreRadar,
} from './report-visualizations.js';

// ---- Public Interfaces --------------------------------------------------
export interface CandidateScores {
  overall: number;
  components: {
    hookStrength: number;
    contextClarity: number;
    spoilerFreedom: number;
    editFeasibility: number;
    marketAppeal: number;
  };
  confidence: number; // 0..1
}

export interface CandidateReport {
  id: string;
  summary: {
    label: string;
    scenes: string[];
    wordCount: number;
    openingLine: string;
    genre: 'action' | 'dialogue' | 'description' | 'mixed';
  };
  scores: CandidateScores;
  problems: {
    criticalSpoilers: number;
    moderateSpoilers: number;
    contextGaps: number;
    totalIssues: number;
  };
  effort: {
    editBurden: string;
    timeEstimate: string;
    wordChanges: number;
    confidence: 'high' | 'medium' | 'low';
  };
  analysis: {
    strengths: string[];
    weaknesses: string[];
    risks: string[];
    opportunities: string[];
  };
  revisionDiff?: {
    html: string;
    markdown: string;
    unified: string;
    stats: DiffResult['stats'];
  };
}

export interface ComparisonMatrix {
  headers: string[];
  rows: MatrixRow[];
  bestPerMetric: Map<string, string>;
}
export interface MatrixRow {
  metric: string;
  values: (string | number)[];
  highlight: boolean;
  winner?: number;
}
export interface RankingTable {
  entries: { id: string; label: string; score: number }[];
}
export interface Recommendation {
  priority: number;
  title: string;
  description: string;
  impact: string;
  effort: string;
  risk: string;
}
export interface WinnerAnalysis {
  id: string;
  label: string;
  confidence: number;
  keyAdvantage: string;
  timeEstimate: string;
  recommendation?: string;
}
export interface HeatmapData {
  markdown: string;
}
export interface ChartData {
  labels: string[];
  series: { name: string; values: number[] }[];
}
export interface RadarData {
  axes: string[];
  series: { name: string; values: number[] }[];
}
export interface TreeData {
  root: { name: string; children?: unknown[] };
}

export interface ComparativeReport {
  metadata: {
    generatedAt: string;
    manuscriptId: string;
    totalScenes: number;
    candidateCount: number;
    analysisVersion: string;
  };
  candidates: CandidateReport[];
  comparison: {
    matrix: ComparisonMatrix;
    rankings: RankingTable;
    recommendations: Recommendation[];
    winnerAnalysis: WinnerAnalysis;
  };
  visualizations: {
    spoilerHeatmap: string;
    editBurdenChart: ChartData;
    scoreRadar: RadarData;
    decisionTree: TreeData;
  };
  exportFormats: { markdown: string; html: string; pdf?: Buffer };
}

// ---- Scoring ------------------------------------------------------------
export function calculateOverallScore(
  candidate: OpeningCandidate,
  spoilers: SpoilerAnalysis,
  context: ContextAnalysis,
  burden: EditBurden,
): CandidateScores {
  const hookStrength = Math.round((candidate.hookScore || 0) * 100);
  const contextClarity = Math.round(context.contextScore * 100);
  const spoilerFreedom = Math.round((1 - Math.min(spoilers.violations.length / 5, 1)) * 100);
  const editFeasibility = Math.round(
    (1 - Math.min(burden.metrics.totalChangePercent / 20, 1)) * 100,
  );
  const marketAppeal = calculateMarketAppeal(candidate);
  const weights = {
    hookStrength: 0.3,
    contextClarity: 0.2,
    spoilerFreedom: 0.25,
    editFeasibility: 0.15,
    marketAppeal: 0.1,
  } as const;
  const overall = Math.round(
    hookStrength * weights.hookStrength +
      contextClarity * weights.contextClarity +
      spoilerFreedom * weights.spoilerFreedom +
      editFeasibility * weights.editFeasibility +
      marketAppeal * weights.marketAppeal,
  );
  const confidence = calculateConfidence(spoilers, context, burden);
  return {
    overall,
    components: { hookStrength, contextClarity, spoilerFreedom, editFeasibility, marketAppeal },
    confidence,
  };
}

export function calculateMarketAppeal(candidate: OpeningCandidate): number {
  let score = 50;
  if (candidate.actionDensity > 0.6) score += 20;
  if (candidate.characterIntros >= 2) score += 15;
  if (candidate.mysteryQuotient > 0.3) score += 15;
  if (candidate.dialogueRatio > 0.4 && candidate.dialogueRatio < 0.7) score += 10;
  if (candidate.totalWords < 750) score -= 10;
  if (candidate.totalWords > 3000) score -= 10;
  return Math.min(100, Math.max(0, score));
}

export function calculateConfidence(
  spoilers: SpoilerAnalysis,
  context: ContextAnalysis,
  burden: EditBurden,
): number {
  const factors = [
    1 - Math.min(spoilers.violations.length / 10, 1),
    1 - Math.min(context.gaps.length / 15, 1),
    1 - Math.min(burden.metrics.totalChangePercent / 50, 1),
  ];
  const avg = factors.reduce((a, b) => a + b, 0) / factors.length;
  return Number(avg.toFixed(2));
}

// ---- Comparison Matrix --------------------------------------------------
export function generateComparisonMatrix(candidates: CandidateReport[]): ComparisonMatrix {
  if (!candidates.length) return { headers: [], rows: [], bestPerMetric: new Map() };
  const headers = ['Metric', ...candidates.map((c) => c.summary.label)];
  const rows: MatrixRow[] = [];
  const overallValues = candidates.map((c) => c.scores.overall);
  rows.push({
    metric: 'Overall Score',
    values: overallValues.map((v) => `${v}/100`),
    highlight: true,
    winner: findMaxIndex(overallValues),
  });
  const compMap: [keyof CandidateScores['components'], string][] = [
    ['hookStrength', 'Hook Strength'],
    ['contextClarity', 'Context Clarity'],
    ['spoilerFreedom', 'Spoiler Freedom'],
    ['editFeasibility', 'Edit Feasibility'],
    ['marketAppeal', 'Market Appeal'],
  ];
  for (const [key, label] of compMap) {
    const vals = candidates.map((c) => c.scores.components[key]);
    rows.push({
      metric: label,
      values: vals.map((v) => `${v}/100`),
      highlight: false,
      winner: findMaxIndex(vals),
    });
  }
  // Problems (lower better)
  const critVals = candidates.map((c) => c.problems.criticalSpoilers);
  rows.push({
    metric: 'Critical Issues',
    values: critVals,
    highlight: true,
    winner: findMinIndex(critVals),
  });
  const gapVals = candidates.map((c) => c.problems.contextGaps);
  rows.push({
    metric: 'Context Gaps',
    values: gapVals,
    highlight: false,
    winner: findMinIndex(gapVals),
  });
  // Effort
  const wordChangeVals = candidates.map((c) => c.effort.wordChanges);
  rows.push({
    metric: 'Word Changes',
    values: wordChangeVals.map((v) => `${v}`),
    highlight: false,
    winner: findMinIndex(wordChangeVals),
  });
  return { headers, rows, bestPerMetric: calculateBests(rows) };
}

function calculateBests(rows: MatrixRow[]): Map<string, string> {
  const map = new Map<string, string>();
  void rows;
  return map;
}
export function findMaxIndex(arr: number[]): number {
  if (!arr.length) return -1;
  let idx = 0;
  for (let i = 1; i < arr.length; i++) if ((arr[i] ?? -Infinity) > (arr[idx] ?? -Infinity)) idx = i;
  return idx;
}
export function findMinIndex(arr: number[]): number {
  if (!arr.length) return -1;
  let idx = 0;
  for (let i = 1; i < arr.length; i++) if ((arr[i] ?? Infinity) < (arr[idx] ?? Infinity)) idx = i;
  return idx;
}

// ---- Candidate Report Construction -------------------------------------
export function assembleCandidateReport(
  candidate: OpeningCandidate,
  spoilers: SpoilerAnalysis,
  context: ContextAnalysis,
  burden: EditBurden,
  label: string,
): CandidateReport {
  const scores = calculateOverallScore(candidate, spoilers, context, burden);
  const openingLine = extractOpeningLine(candidate);
  const genre = inferGenre(candidate);
  const critical = spoilers.violations.filter((v) => v.severity === 'critical').length;
  const moderate = spoilers.violations.filter((v) => v.severity === 'moderate').length;
  const problems = {
    criticalSpoilers: critical,
    moderateSpoilers: moderate,
    contextGaps: context.gaps.length,
    totalIssues: critical + moderate + context.gaps.length,
  };
  const effort = {
    editBurden: burden.assessment.burden,
    timeEstimate: humanTime(burden.timeEstimates.totalMinutes),
    wordChanges: Math.round(
      burden.metrics.addedWords + burden.metrics.modifiedWords + burden.metrics.deletedWords,
    ),
    confidence: burden.timeEstimates.confidenceLevel,
  };
  const analysis = basicQualitativeAnalysis(candidate, scores, problems, effort);
  return {
    id: candidate.id,
    summary: {
      label,
      scenes: candidate.scenes,
      wordCount: candidate.totalWords,
      openingLine,
      genre,
    },
    scores,
    problems,
    effort,
    analysis,
  };
}

function extractOpeningLine(candidate: OpeningCandidate): string {
  return candidate.id.slice(0, 40);
}
function inferGenre(candidate: OpeningCandidate): CandidateReport['summary']['genre'] {
  if (candidate.actionDensity > 0.5) return 'action';
  if (candidate.dialogueRatio > 0.6) return 'dialogue';
  if (candidate.hookScore < 0.3) return 'description';
  return 'mixed';
}
function humanTime(totalMinutes: number): string {
  if (totalMinutes < 45) return 'under 1 hour';
  if (totalMinutes < 120) return '1-2 hours';
  if (totalMinutes < 240) return '2-4 hours';
  return `${Math.round(totalMinutes / 60)}+ hours`;
}

function basicQualitativeAnalysis(
  candidate: OpeningCandidate,
  scores: CandidateScores,
  problems: CandidateReport['problems'],
  effort: CandidateReport['effort'],
): CandidateReport['analysis'] {
  const strengths: string[] = [];
  if (scores.components.hookStrength >= 70) strengths.push('Strong initial hook');
  if (scores.components.spoilerFreedom >= 90) strengths.push('Clean of major spoilers');
  if (effort.editBurden === 'minimal' || effort.editBurden === 'light')
    strengths.push('Low edit burden');
  const weaknesses: string[] = [];
  if (problems.contextGaps > 2) weaknesses.push('Multiple context gaps');
  if (scores.components.editFeasibility < 60) weaknesses.push('Significant edits required');
  const risks: string[] = [];
  if (candidate.totalWords > 2500) risks.push('Long opening may reduce pacing');
  if (candidate.mysteryQuotient === 0) risks.push('Lack of intrigue');
  const opportunities: string[] = [];
  if (candidate.characterIntros >= 2) opportunities.push('Introduce ensemble early');
  if (candidate.mysteryQuotient > 0.2) opportunities.push('Enhance mystery payoff');
  return { strengths, weaknesses, risks, opportunities };
}

// ---- Executive Summary / Recommendations -------------------------------
export function generateExecutiveSummary(report: ComparativeReport): string {
  const winner = report.comparison.winnerAnalysis;
  return `Recommended opening: ${winner.label} (score ${winner.confidence} confidence).`;
}

export function buildRecommendations(candidates: CandidateReport[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const winner = candidates.slice().sort((a, b) => b.scores.overall - a.scores.overall)[0];
  if (winner) {
    recs.push({
      priority: 1,
      title: 'Adopt ' + winner.summary.label,
      description: 'Select this opening for production edits.',
      impact: 'High',
      effort: winner.effort.editBurden,
      risk: 'Low',
    });
  }
  const gapHeavy = candidates.filter((c) => c.problems.contextGaps > 3).slice(0, 1)[0];
  if (gapHeavy)
    recs.push({
      priority: recs.length + 1,
      title: 'Address context gaps in ' + gapHeavy.summary.label,
      description: 'Add bridging context for ambiguous references.',
      impact: 'Medium',
      effort: gapHeavy.effort.editBurden,
      risk: 'Medium',
    });
  return recs;
}

// ---- Markdown Rendering -------------------------------------------------
export function renderComparisonTable(matrix: ComparisonMatrix): string {
  const lines: string[] = [];
  if (!matrix.headers.length) return '';
  lines.push('| ' + matrix.headers.join(' | ') + ' |');
  lines.push('|' + matrix.headers.map(() => '---').join('|') + '|');
  for (const row of matrix.rows) {
    const cells = [row.metric, ...row.values.map(String)];
    if (typeof row.winner === 'number') {
      const winnerCol = row.winner + 1; // metric col shift
      if (cells[winnerCol]) cells[winnerCol] = `**${cells[winnerCol]}**`;
    }
    lines.push('| ' + cells.join(' | ') + ' |');
  }
  return lines.join('\n');
}

export function renderCandidateAnalysis(c: CandidateReport): string {
  return `### ${c.summary.label}\nScore: ${c.scores.overall}/100 (confidence ${(c.scores.confidence * 100).toFixed(0)}%)\n- Strengths: ${c.analysis.strengths.join('; ') || '—'}\n- Weaknesses: ${c.analysis.weaknesses.join('; ') || '—'}\n- Risks: ${c.analysis.risks.join('; ') || '—'}\n- Opportunities: ${c.analysis.opportunities.join('; ') || '—'}\n`;
}

// Placeholder until detailed edit diff integration
export function renderEditList(): string {
  return '- (edit list placeholder)';
}

export function generateMarkdownReport(report: ComparativeReport): string {
  const md: string[] = [];
  md.push('# Opening Lab Analysis Report');
  md.push(`Generated: ${report.metadata.generatedAt}`);
  md.push(`Analyzing ${report.candidates.length} opening options\n`);
  md.push('## Executive Summary\n');
  md.push(generateExecutiveSummary(report));
  md.push('## 🎯 Quick Decision\n');
  const winner = report.comparison.winnerAnalysis;
  md.push(`**Recommended Opening:** ${winner.label}`);
  md.push(`**Confidence:** ${winner.confidence}%`);
  md.push(`**Key Advantage:** ${winner.keyAdvantage}`);
  md.push(`**Implementation Time:** ${winner.timeEstimate}\n`);
  md.push('## Detailed Comparison\n');
  md.push(renderComparisonTable(report.comparison.matrix));
  md.push('## Opening-by-Opening Analysis\n');
  for (const c of report.candidates) md.push(renderCandidateAnalysis(c));
  md.push('## Visualizations\n');
  md.push(report.visualizations.spoilerHeatmap);
  md.push(renderEditBurdenChart(report.visualizations.editBurdenChart));
  md.push(renderScoreRadar(report.visualizations.scoreRadar));
  md.push('## Recommendations\n');
  for (const rec of report.comparison.recommendations) {
    md.push(`### ${rec.priority}. ${rec.title}`);
    md.push(rec.description);
    md.push(`- **Impact:** ${rec.impact}`);
    md.push(`- **Effort:** ${rec.effort}`);
    md.push(`- **Risk:** ${rec.risk}\n`);
  }
  md.push('## Appendix: Required Edits\n');
  for (const c of report.candidates) md.push(`### ${c.summary.label}\n` + renderEditList());
  return md.join('\n');
}

// ---- Orchestration -----------------------------------------------------
export function buildComparativeReport(params: {
  manuscriptId: string;
  candidates: {
    candidate: OpeningCandidate;
    spoilers: SpoilerAnalysis;
    context: ContextAnalysis;
    burden: EditBurden;
    label: string;
  }[];
}): ComparativeReport {
  const candidateReports = params.candidates.map((p) =>
    assembleCandidateReport(p.candidate, p.spoilers, p.context, p.burden, p.label),
  );
  const matrix = generateComparisonMatrix(candidateReports);
  const rankings: RankingTable = {
    entries: candidateReports
      .slice()
      .sort((a, b) => b.scores.overall - a.scores.overall)
      .map((c) => ({ id: c.id, label: c.summary.label, score: c.scores.overall })),
  };
  const firstRank = rankings.entries[0];
  const winnerDetail = firstRank ? candidateReports.find((c) => c.id === firstRank.id) : undefined;
  let winnerAnalysis: WinnerAnalysis =
    firstRank && winnerDetail
      ? {
          id: firstRank.id,
          label: firstRank.label,
          confidence: Math.round(winnerDetail.scores.confidence * 100),
          keyAdvantage: winnerDetail.analysis.strengths[0] || 'Balanced performance',
          timeEstimate: winnerDetail.effort.timeEstimate,
        }
      : { id: 'n/a', label: 'N/A', confidence: 0, keyAdvantage: 'None', timeEstimate: 'N/A' };
  // Tie handling
  if (candidateReports.length >= 2) {
    const sorted = candidateReports.slice().sort((a, b) => b.scores.overall - a.scores.overall);
    const top0 = sorted[0];
    const top1 = sorted[1];
    if (top0 && top1 && top0.scores.overall === top1.scores.overall) {
      const tieWinner = [top0, top1].sort((a, b) => a.effort.wordChanges - b.effort.wordChanges)[0];
      if (tieWinner)
        winnerAnalysis = {
          id: tieWinner.id,
          label: tieWinner.summary.label,
          confidence: Math.round(tieWinner.scores.confidence * 100),
          keyAdvantage: 'Lower edit workload tie-break',
          timeEstimate: tieWinner.effort.timeEstimate,
        };
    }
  }
  const recommendations = buildRecommendations(candidateReports);
  if (candidateReports.every((c) => c.scores.overall < 50)) {
    recommendations.unshift({
      priority: 0,
      title: 'WARNING: No Strong Alternatives',
      description:
        'All alternative openings have significant issues. Consider keeping current opening or seeking additional scenes.',
      impact: 'Critical',
      effort: 'N/A',
      risk: 'High',
    });
  }
  // Current opening best (assumes first label contains 'Current')
  const current = candidateReports.find((c) => /current/i.test(c.summary.label));
  if (current) {
    const others = candidateReports.filter((c) => c !== current);
    if (others.every((o) => current.scores.overall >= o.scores.overall)) {
      winnerAnalysis.recommendation =
        'Keep current opening. No alternatives provide sufficient improvement to justify changes.';
    }
  }
  // High edit burden winner -> phased recommendation
  const winnerReport = candidateReports.find((c) => c.id === winnerAnalysis.id);
  if (winnerReport && /extensive/i.test(winnerReport.effort.editBurden)) {
    recommendations.push({
      priority: recommendations.length + 1,
      title: 'Consider Phased Implementation',
      description: 'The winning option requires extensive edits. Consider implementing in stages.',
      impact: 'High',
      effort: winnerReport.effort.editBurden,
      risk: 'Medium',
    });
  }
  const spoilerHeatmap = generateSpoilerHeatmap(
    candidateReports,
    params.candidates.map((c) => c.spoilers),
  );
  const scoreRadar = buildRadarData(candidateReports);
  const editBurdenChart = buildEditBurdenChartData(candidateReports);
  const decisionTree = buildDecisionTreeData(candidateReports);
  const metadata = {
    generatedAt: new Date().toISOString(),
    manuscriptId: params.manuscriptId,
    totalScenes: 0,
    candidateCount: candidateReports.length,
    analysisVersion: '1',
  };
  const temp: ComparativeReport = {
    metadata,
    candidates: candidateReports,
    comparison: { matrix, rankings, recommendations, winnerAnalysis },
    visualizations: { spoilerHeatmap, editBurdenChart, scoreRadar, decisionTree },
    exportFormats: { markdown: '', html: '' },
  };
  const markdown = generateMarkdownReport(temp);
  temp.exportFormats.markdown = markdown;
  // Basic HTML preformatted export (escape minimal entities)
  const escaped = markdown.replace(/[&<>]/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch,
  );
  temp.exportFormats.html = `<pre>${escaped}</pre>`;
  return temp;
}

// Helper: generate diffs for a candidate given original opening scenes and analyses
export function generateCandidateDiffs(
  candidate: OpeningCandidate,
  originalOpening: Scene[],
  spoilers: SpoilerAnalysis,
  context: ContextAnalysis,
): CandidateReport['revisionDiff'] {
  const engine = new DiffEngine();
  const visualizer = new DiffVisualizer();
  const markdownGen = new DiffMarkdownGenerator();
  const originalText = originalOpening.map((s) => s.text).join('\n\n');
  const diff = engine.generateDiff(originalText, spoilers.violations, context.gaps);
  return {
    html: visualizer.generateSideBySideHTML(diff, {
      format: 'side-by-side',
      showLineNumbers: true,
      showReasons: true,
      contextLines: 3,
      highlightStyle: 'github',
    }),
    markdown: markdownGen.generateMarkdown(diff),
    unified: visualizer.generateUnifiedDiff(diff),
    stats: diff.stats,
  };
}

export default { buildComparativeReport };
