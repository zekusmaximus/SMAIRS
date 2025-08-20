import type { Manuscript, Scene } from "./types.js";
import type { Analysis } from "./analyzer.js";
import type { Delta } from "./cache.js";
import { extractReveals } from "./reveal-extraction.js";
import { buildRevealGraph } from "./reveal-graph.js";

export function generateReport(ms: Manuscript, scenes: Scene[], a: Analysis, d?: Delta): string {
  const timestamp = process.env.FIXED_TIMESTAMP || new Date().toISOString();

  const rows = scenes
    .map((s) => {
      const hook = a.hookScores.get(s.id)?.toFixed(2) ?? "0.00";
      const dlg = (s.dialogueRatio * 100).toFixed(0) + "%";
      return `| ${s.id} | ${s.wordCount} | ${dlg} | ${hook} |`;
    })
    .join("\n");

  // Character frequency & co-occurrence (conditional)
  const characterBlocks = (() => {
    const totalChars = a.allCharacters.size;
    if (totalChars === 0) return { summaryLine: "", freq: "", matrix: "" };

    // Frequency by scene count
    const freqMap: Map<string, number> = new Map();
    for (const [, set] of a.charactersPerScene) {
      for (const c of set) {
        freqMap.set(c, (freqMap.get(c) || 0) + 1);
      }
    }
    const freqArr = Array.from(freqMap.entries())
      .map(([name, sc]) => ({ name, scenes: sc }))
      .sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name));
    const top10 = freqArr.slice(0, 10);
    const freqTable = top10.map(f => `| ${escapePipes(f.name)} | ${f.scenes} |`).join("\n");
    const freqBlock = top10.length ? `\n## Character Frequency (Top 10 by Scene Count)\n| Character | Scenes |\n|-----------|-------:|\n${freqTable}` : "";

    // Co-occurrence matrix for same top10 ordering
    const nameIndex = new Map<string, number>();
    top10.forEach((f, i) => nameIndex.set(f.name, i));
    const n = top10.length;
    if (n === 0) return { summaryLine: `- Characters: ${totalChars} unique`, freq: freqBlock, matrix: "" };
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (const [, set] of a.charactersPerScene) {
      const chars: string[] = Array.from(set).filter(c => nameIndex.has(c));
      for (let i = 0; i < chars.length; i++) {
        const ii = nameIndex.get(chars[i] as string);
        if (ii === undefined) continue;
        for (let j = i; j < chars.length; j++) {
          const jj = nameIndex.get(chars[j] as string);
          if (jj === undefined) continue;
          const row = matrix[ii];
          const row2 = matrix[jj];
          if (row && row2) {
            row[jj] = (row[jj] ?? 0) + 1;
            if (ii !== jj) row2[ii] = (row2[ii] ?? 0) + 1;
          }
        }
      }
    }
    // Build ASCII grid: header indices 1..n, then rows with counts
    const header = ['    '].concat(top10.map((_, i) => (i + 1).toString().padStart(3, ' '))).join(' ');
    const rowsM = matrix.map((row, i) => (i + 1).toString().padStart(3, ' ') + ' ' + row.map(v => v.toString().padStart(3, ' ')).join(' ')).join("\n");
    const legend = top10.map((f, i) => `${(i + 1).toString().padStart(2, ' ')}: ${f.name}`).join("\n");
    const matrixBlock = `\n## Character Co-occurrence (Scene Count)\n${header}\n${rowsM}\n\nLegend:\n${legend}`;
    return { summaryLine: `- Characters: ${totalChars} unique`, freq: freqBlock, matrix: matrixBlock };
  })();

  // Reveals per Scene (conditional like characters)
  const revealsSection = (() => {
    let any = false;
    const rows = scenes.map(s => {
      const revs = extractReveals(s);
      if (!revs.length) return null;
      any = true;
      return `| ${s.id} | ${revs.map(r => escapePipes(r.description)).join("; ")} |`;
    }).filter(Boolean).join("\n");
    if (!any) return "";
    return `\n## Reveals per Scene\n| Scene ID | Reveals |\n|----------|---------|\n${rows}`;
  })();

  const deltaBlock = (() => {
    if (!d) return "";
    const lines: string[] = [];
    lines.push(`- Added: ${d.added.length} ${fmtList(d.added)}`);
    lines.push(`- Removed: ${d.removed.length} ${fmtList(d.removed)}`);
    lines.push(`- Modified: ${d.modified.length} ${fmtList(d.modified.map(m => m.id))}`);
    lines.push(`- Moved: ${d.moved.length} ${fmtList(d.moved.map(m => m.id))}`);
    const unresolved = d.unresolved; // may be undefined in future callers
    const unresolvedCount = unresolved?.length ?? 0;
    let unresolvedSection = "";
    if (unresolvedCount > 0) {
      lines.push(`- Unresolved: ${unresolvedCount} (needs manual review)`);
      const list = unresolved
        .map(u => {
          const prior = (typeof (u as { priorOffset?: number }).priorOffset === 'number') ? (u as { priorOffset: number }).priorOffset : undefined;
          const priorStr = typeof prior === 'number' ? prior.toString() : 'n/a';
          const tierTried = (u as { tier?: number }).tier ?? 'n/a';
          const confVal = (u as { confidence?: number }).confidence;
          const conf = typeof confVal === 'number' ? confVal.toFixed(2) : 'n/a';
          return `- ${u.id} (prior ${priorStr}; last tier ${tierTried}; confidence ${conf})`;
        })
        .join("\n");
      unresolvedSection = `\n\n### Unresolved Scenes\n${list}`;
    }
    return `\n## Changes Since Last Run\n${lines.join("\n")}${unresolvedSection}`;
  })();

  const histogramBlock = (() => {
    if (scenes.length === 0) return "";
    const bins = [
      { label: "0–250", min: 0, max: 250, count: 0 },
      { label: "251–500", min: 251, max: 500, count: 0 },
      { label: "501–1000", min: 501, max: 1000, count: 0 },
      { label: "1001–2000", min: 1001, max: 2000, count: 0 },
      { label: "2001+", min: 2001, max: Number.POSITIVE_INFINITY, count: 0 },
    ];
    for (const s of scenes) {
      const len = Math.max(0, s.endOffset - s.startOffset);
      const bin = bins.find(b => len >= b.min && len <= b.max);
      if (bin) bin.count++;
    }
    const maxCount = Math.max(1, ...bins.map(b => b.count));
    const lines = bins.map(b => {
      const barLen = Math.round((b.count / maxCount) * 10); // scale to max 10 hashes
      const bar = '#'.repeat(barLen).padEnd(10, ' ');
      const label = b.label.padEnd(8, ' ');
      return `${label}| ${bar} (${b.count})`;
    });
    return `\n## Scene Length Histogram\n${lines.join("\n")}`;
  })();

  const topHooksBlock = (() => {
    if (scenes.length === 0) return "";
    const hookEntries: { id: string; score: number }[] = [];
    for (const s of scenes) {
      const score = a.hookScores.get(s.id) ?? 0;
      hookEntries.push({ id: s.id, score });
    }
    hookEntries.sort((a, b) => b.score - a.score);
    const top = hookEntries.slice(0, 10).map(h => `- ${h.id}: ${h.score.toFixed(2)}`).join("\n");
    return `\n## Top 10 Hooks\n${top}`;
  })();

  // Reveal Graph (after histogram + hooks)
  const revealGraphSection = (() => {
    const graph = buildRevealGraph(scenes);
    if (!graph.reveals.length) return "";
    const rows = graph.reveals.map(r => {
      const prereqs = r.preReqs.length ? r.preReqs.join(", ") : "-";
      return `| ${r.firstExposureSceneId} | ${escapePipes(r.description)} | ${prereqs} |`;
    }).join("\n");
    return `\n## Reveal Graph\n| First Scene | Description | Prerequisites |\n|-------------|------------|---------------|\n${rows}`;
  })();

  return `# Scene Inventory Report
Generated: ${timestamp}
Checksum: ${ms.checksum.slice(0, 8)}

## Executive Summary
- Chapters: ${ms.chapters.length}
- Scenes: ${scenes.length}
- Words: ${ms.wordCount}
- Avg Words/Scene: ${Math.round(a.avgWordsPerScene)}
${characterBlocks.summaryLine}
${revealsSection}
${deltaBlock}
${histogramBlock}
${topHooksBlock}
${characterBlocks.freq}
${characterBlocks.matrix}
${revealGraphSection}

## Scene Breakdown
| ID | Words | Dialogue % | Hook Score |
|----|------:|-----------:|-----------:|
${rows}
`;
}

function fmtList(list: string[], limit = 10): string {
  if (list.length === 0) return "";
  const head = list.slice(0, limit).join(", ");
  return list.length > limit ? `(${head}, …)` : `(${head})`;
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|");
}
