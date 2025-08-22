// Visualization helpers for comparative opening reports
// Lightweight ASCII/markdown visualizations (no external deps)

// CandidateReport re-declared lightly to avoid circular import at runtime (only shape used).
export interface CandidateReportLike { summary: { label: string; wordCount: number }; scores: { overall: number; components: { hookStrength: number; contextClarity: number; spoilerFreedom: number; editFeasibility: number; marketAppeal: number } }; problems: { criticalSpoilers: number; totalIssues: number }; effort: { editBurden: string; wordChanges: number }; }
import type { SpoilerAnalysis } from '../../../types/spoiler-types.js';

// ---- Data shape stubs ---------------------------------------------------
export interface HeatmapData { markdown: string }
export interface ChartData { series: { name: string; values: number[] }[]; labels: string[] }
export interface RadarSeries { name: string; values: number[] }
export interface RadarData { axes: string[]; series: RadarSeries[] }
export interface TreeNode { name: string; value?: number; children?: TreeNode[] }
export interface TreeData { root: TreeNode }

// ---- Spoiler Heatmap ----------------------------------------------------
export function generateSpoilerHeatmap(candidates: CandidateReportLike[], analyses: SpoilerAnalysis[]): string {
  // block chars retained in comments for potential future gradient: █ ▓ ▒ ░
  const headerCount = 10; // fixed width sample (first 10 scenes considered for visualization)
  let out = '## Spoiler Heatmap\n\n';
  out += '```\n';
  out += 'Scenes →\n';
  out += '        ';
  for (let i = 1; i <= headerCount; i++) out += `S${i.toString().padStart(2, '0')} `;
  out += '\n';
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i]!;
    const label = cand.summary.label.substring(0, 7).padEnd(7);
    out += `${label} `;
    const analysis = analyses[i];
    out += generateHeatRow(analysis, headerCount).join(' ') + '\n';
  }
  out += '\n';
  out += 'Legend: █ Critical  ▒ Moderate  ░ Minor  ⎕ None\n';
  out += '```\n';
  return out;
}

export function generateHeatRow(analysis: SpoilerAnalysis | undefined, sceneCount: number): string[] {
  const row: string[] = [];
  if (!analysis) return Array.from({ length: sceneCount }, () => ' ⎕ ');
  for (let i = 0; i < sceneCount; i++) {
    // We approximate by looking for scene ids ending with _sXX (01-based)
    const sceneId = `ch01_s${(i + 1).toString().padStart(2, '0')}`;
    const inScene = analysis.violations.filter(v => v.mentionedIn.sceneId === sceneId);
    if (!inScene.length) { row.push(' ⎕ '); continue; }
    const maxSeverity = Math.max(...inScene.map(v => v.severity === 'critical' ? 3 : v.severity === 'moderate' ? 2 : 1));
    // Map 1->░ (minor), 2->▒ (moderate), 3->█ (critical)
    row.push(` ${['░', '▒', '█'][maxSeverity - 1]} `);
  }
  return row;
}

// ---- Edit Burden Chart (sparkline style) -------------------------------
export function renderEditBurdenChart(data: ChartData): string {
  // Expect labels as metrics, first series is winner highlight
  const lines: string[] = [];
  lines.push('### Edit Burden Chart');
  lines.push('```');
  for (let i = 0; i < data.labels.length; i++) {
  const label = data.labels[i]!;
    const vals = data.series.map(s => s.values[i] ?? 0);
    const max = Math.max(...vals, 1);
    const bars = vals.map(v => bar(Math.round((v / max) * 10))).join(' | ');
    lines.push(label.padEnd(18) + ': ' + bars);
  }
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function bar(n: number): string { return '█'.repeat(n).padEnd(10, ' '); }

// ---- Score Radar -------------------------------------------------------
export function renderScoreRadar(data: RadarData): string {
  // Simplified textual table for now (ASCII stylized radar placeholder)
  const lines: string[] = [];
  lines.push('### Score Components Radar');
  lines.push('');
  lines.push('| Component | ' + data.series.map(s => s.name).join(' | ') + ' |');
  lines.push('|' + data.series.map(() => '----------').join('|') + '|');
  for (let a = 0; a < data.axes.length; a++) {
    lines.push('| ' + data.axes[a] + ' | ' + data.series.map(s => (s.values[a] ?? 0).toString()).join(' | ') + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

// ---- Utility to build radar data --------------------------------------
export function buildRadarData(candidates: CandidateReportLike[]): RadarData {
  const axes = ['Hook Strength', 'Context Clarity', 'Spoiler Freedom', 'Edit Feasibility', 'Market Appeal'];
  const series: RadarSeries[] = candidates.map(c => ({
    name: c.summary.label,
    values: [
      c.scores.components.hookStrength,
      c.scores.components.contextClarity,
      c.scores.components.spoilerFreedom,
      c.scores.components.editFeasibility,
      c.scores.components.marketAppeal,
    ],
  }));
  return { axes, series };
}

export function buildEditBurdenChartData(candidates: CandidateReportLike[]): ChartData {
  return {
    labels: ['Change %', 'Added Words', 'Edits'],
    series: candidates.map(c => ({
      name: c.summary.label,
      values: [
        c.effort.wordChanges / Math.max(1, c.summary.wordCount) * 100,
        c.effort.wordChanges,
        c.effort.wordChanges / 10,
      ],
    })),
  };
}

export function buildDecisionTreeData(candidates: CandidateReportLike[]): TreeData {
  const winner = candidates.slice().sort((a, b) => b.scores.overall - a.scores.overall)[0];
  return {
    root: {
      name: 'Opening Decision',
      children: candidates.map(c => ({
        name: `${c.summary.label} (${c.scores.overall})${c === winner ? ' *' : ''}`,
        value: c.scores.overall,
        children: [
          { name: `Spoilers: ${c.problems.criticalSpoilers}/${c.problems.totalIssues}` },
          { name: `Burden: ${c.effort.editBurden}` },
          { name: `Hook: ${c.scores.components.hookStrength}` },
        ],
      })),
    },
  };
}

export default { generateSpoilerHeatmap, renderEditBurdenChart, renderScoreRadar, buildRadarData, buildEditBurdenChartData, buildDecisionTreeData };

// --- Priority 3 additions ---------------------------------------------
import type { OpeningCandidate } from './opening-candidates.js';

export interface TensionPoint { position: number; tension: number; type: 'action' | 'revelation' | 'emotional' | 'dialogue' }

export function generateTensionCurve(candidate: OpeningCandidate): string {
  // Simple ASCII curve using candidate heuristics
  const points: TensionPoint[] = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const pos = i / steps;
    const base = candidate.hookScore * 0.5 + candidate.actionDensity * 0.3 + candidate.mysteryQuotient * 0.2;
    const wave = 0.1 * Math.sin(i / 2);
    const tension = Math.max(0, Math.min(1, base + wave));
    const type: TensionPoint['type'] = i % 5 === 0 ? 'revelation' : (candidate.actionDensity > 0.3 ? 'action' : (candidate.dialogueRatio > 0.5 ? 'dialogue' : 'emotional'));
    points.push({ position: pos, tension, type });
  }
  const lines: string[] = [];
  lines.push('```');
  for (const p of points) {
    const bars = '▁▂▃▄▅▆▇█';
    const idx = Math.max(0, Math.min(bars.length - 1, Math.round(p.tension * (bars.length - 1))));
    lines.push(`${Math.round(p.position * 100).toString().padStart(3, ' ')}% ${bars[idx]}`);
  }
  lines.push('```');
  return lines.join('\n');
}
