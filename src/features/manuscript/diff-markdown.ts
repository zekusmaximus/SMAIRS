import type { DiffResult } from './diff-engine.js';

export class DiffMarkdownGenerator {
  /** Generate markdown-formatted diff for reports */
  generateMarkdown(diff: DiffResult): string {
    const sections: string[] = [];

    // Header
    sections.push('## Revision Diff\n');

    // Statistics
    sections.push('### Change Summary');
    sections.push(`- Total changes: ${diff.stats.totalChanges}`);
    sections.push(`- Lines added: ${diff.stats.linesAdded}`);
    sections.push(`- Lines deleted: ${diff.stats.linesDeleted}`);
    sections.push(`- Lines modified: ${diff.stats.linesModified}`);
    sections.push('');

    // Changes
    sections.push('### Changes\n');
    sections.push('```diff');

    for (const segment of diff.segments) {
      if (segment.type === 'unchanged') {
        // Show a few lines of context
        const lines = segment.originalText?.split('\n').slice(0, 3) || [];
        lines.forEach(line => sections.push(` ${line}`));
      } else if (segment.type === 'deleted') {
        segment.originalText?.split('\n').forEach(line =>
          sections.push(`-${line}`)
        );
      } else if (segment.type === 'added') {
        segment.revisedText?.split('\n').forEach(line =>
          sections.push(`+${line}`)
        );
      } else if (segment.type === 'modified') {
        segment.originalText?.split('\n').forEach(line =>
          sections.push(`-${line}`)
        );
        segment.revisedText?.split('\n').forEach(line =>
          sections.push(`+${line}`)
        );
      }
    }

    sections.push('```\n');

    // Change reasons
    sections.push('### Change Explanations\n');
    const reasonedChanges = diff.segments.filter(s => s.reason);
    for (const segment of reasonedChanges) {
      sections.push(`- **${segment.source}**: ${segment.reason}`);
    }

    return sections.join('\n');
  }
}

export default { DiffMarkdownGenerator };
