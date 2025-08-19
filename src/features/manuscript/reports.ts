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

  const deltaBlock = d
    ? `\n## Changes Since Last Run\n- Added: ${d.added.length} ${fmtList(d.added)}\n- Removed: ${d.removed.length} ${fmtList(d.removed)}\n- Modified: ${d.modified.length} ${fmtList(d.modified)}\n- Moved: ${d.moved.length} ${fmtList(d.moved)}`
    : "";

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
