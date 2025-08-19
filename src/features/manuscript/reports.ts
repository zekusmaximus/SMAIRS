import type { Manuscript, Scene } from "./types.js";
import type { Analysis } from "./analyzer.js";
import type { Delta } from "./cache.js";

export function generateReport(ms: Manuscript, scenes: Scene[], a: Analysis, d?: Delta): string {
  const timestamp = process.env.FIXED_TIMESTAMP || new Date().toISOString();

  const rows = scenes
    .map((s) => {
      const hook = a.hookScores.get(s.id)?.toFixed(2) ?? "0.00";
      const dlg = (s.dialogueRatio * 100).toFixed(0) + "%";
      return `| ${s.id} | ${s.wordCount} | ${dlg} | ${hook} |`;
    })
    .join("\n");

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
          // Support older cache entries without priorOffset
            const prior = (typeof (u as { priorOffset?: number }).priorOffset === 'number') ? (u as { priorOffset: number }).priorOffset : undefined;
          const priorStr = typeof prior === 'number' ? prior.toString() : 'n/a';
          return `- ${u.id} (prior offset ${priorStr})`;
        })
        .join("\n");
      unresolvedSection = `\n\n### Unresolved Scenes\n${list}`;
    }
    return `\n## Changes Since Last Run\n${lines.join("\n")}${unresolvedSection}`;
  })();

  return `# Scene Inventory Report
Generated: ${timestamp}
Checksum: ${ms.checksum.slice(0, 8)}

## Executive Summary
- Chapters: ${ms.chapters.length}
- Scenes: ${scenes.length}
- Words: ${ms.wordCount}
- Avg Words/Scene: ${Math.round(a.avgWordsPerScene)}
${deltaBlock}

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
