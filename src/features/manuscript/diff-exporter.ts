import { writeFile } from 'fs/promises';
import type { DiffResult } from './diff-engine.js';
import { DiffVisualizer } from './diff-visualizer.js';
import { DiffMarkdownGenerator } from './diff-markdown.js';

export class DiffExporter {
  async exportDiff(
    diff: DiffResult,
    outputDir: string,
    candidateId: string
  ): Promise<void> {
    const visualizer = new DiffVisualizer();
    const markdownGen = new DiffMarkdownGenerator();

    // Export HTML side-by-side
    const htmlPath = `${outputDir}/diff-${candidateId}.html`;
    const html = visualizer.generateSideBySideHTML(diff, {
      format: 'side-by-side',
      showLineNumbers: true,
      showReasons: true,
      contextLines: 3,
      highlightStyle: 'github'
    });
    await writeFile(htmlPath, html);

    // Export markdown diff
    const mdPath = `${outputDir}/diff-${candidateId}.md`;
    const markdown = markdownGen.generateMarkdown(diff);
    await writeFile(mdPath, markdown);

    // Export unified diff (git-style)
    const unifiedPath = `${outputDir}/diff-${candidateId}.patch`;
    const unified = visualizer.generateUnifiedDiff(diff);
    await writeFile(unifiedPath, unified);

    console.log(`✓ Exported diffs to ${outputDir}/diff-${candidateId}.*`);
  }
}

export default { DiffExporter };
