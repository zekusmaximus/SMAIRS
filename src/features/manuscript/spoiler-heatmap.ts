// Spoiler heatmap generation (ASCII grid)
import type { SpoilerAnalysis, SpoilerHeatmap, SpoilerCell } from '../../../types/spoiler-types.js';
import type { Scene } from './types.js';

export function generateHeatmap(analysis: SpoilerAnalysis, orderedScenes?: Scene[]): SpoilerHeatmap {
  // Scenes rows; columns single aggregated severity cell (simplified Phase 1) per scene.
  const legend = new Map<string,string>([
    ['#FF0000','Critical spoiler'],
    ['#FFFF00','Moderate spoiler'],
    ['#00FF00','No violation'],
    ['#CCCCCC','Not yet revealed']
  ]);
  const rows: SpoilerCell[][] = [];
  const byScene = new Map<string, SpoilerCell>();
  for (const v of analysis.violations) {
    const key = v.mentionedIn.sceneId;
    let cell = byScene.get(key);
    if (!cell) { cell = { sceneId: key, severity:0, violations:[], color:'#00FF00' }; byScene.set(key, cell); }
    cell.violations.push(v.revealId);
    const sev = v.severity === 'critical' ? 1 : v.severity === 'moderate' ? 0.6 : 0.3;
    cell.severity = Math.max(cell.severity, sev);
    cell.color = sev >= 0.95 ? '#FF0000' : sev >= 0.5 ? '#FFFF00' : '#00FF00';
  }
  const sceneOrder = orderedScenes ? orderedScenes.map(s=>s.id) : Array.from(new Set(analysis.violations.map(v=>v.mentionedIn.sceneId)));
  for (const sid of sceneOrder) {
    const cell = byScene.get(sid) || { sceneId: sid, severity:0, violations:[], color:'#00FF00' };
    rows.push([cell]);
  }
  return { candidateId: analysis.candidateId, grid: rows, legend };
}

export function renderHeatmapASCII(h: SpoilerHeatmap): string {
  // Simple table: sceneId | color block | severity
  const lines: string[] = [];
  lines.push(`Heatmap for ${h.candidateId}`);
  for (const row of h.grid) {
  const c = row[0];
  if (!c) continue; // defensive, though construction always supplies a cell
  const block = c.color === '#FF0000' ? '█' : c.color === '#FFFF00' ? '▓' : '░';
  const sevStr = typeof c.severity === 'number' ? c.severity.toFixed(2) : '0.00';
  lines.push(`${c.sceneId.padEnd(12)} ${block.repeat(5)} sev=${sevStr} (${c.violations.length} violations)`);
  }
  return lines.join('\n');
}

export default { generateHeatmap, renderHeatmapASCII };
