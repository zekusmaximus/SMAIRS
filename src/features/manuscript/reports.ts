import type { Manuscript, Scene } from "./types.js";
import type { Analysis } from "./analyzer.js";
import type { Delta } from "./cache.js";
import { extractCharacters } from "./reveal-extraction.js";
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

  // Characters per Scene (omit if no characters at all)
  const charactersSection = (() => {
    let any = false;
    const rows = scenes.map(s => {
      const chars = extractCharacters(s);
      if (chars.length === 0) return null;
      any = true;
      return `| ${s.id} | ${chars.join(", ")} |`;
    }).filter(Boolean).join("\n");
    if (!any) return "";
    return `\n## Characters per Scene\n| Scene ID | Characters |\n|----------|-----------|\n${rows}`;
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
          // Placeholders for tier & confidence until plumbed from anchor attempt path.
          const tierTried = 'n/a';
          const conf = 'n/a';
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
${charactersSection}
${deltaBlock}
${histogramBlock}
${topHooksBlock}
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
