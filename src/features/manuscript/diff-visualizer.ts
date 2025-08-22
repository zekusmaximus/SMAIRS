import type { DiffResult, DiffSegment } from './diff-engine.js';

export interface DiffVisualizationOptions {
  format: 'side-by-side' | 'inline' | 'unified';
  showLineNumbers: boolean;
  showReasons: boolean;
  contextLines: number; // Lines of context around changes
  highlightStyle: 'github' | 'vscode' | 'minimal';
}

export class DiffVisualizer {
  /** Generate HTML for side-by-side diff view */
  generateSideBySideHTML(diff: DiffResult, options: DiffVisualizationOptions): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Opening Revision Diff</title>
        <style>
          ${this.getStyles(options.highlightStyle)}
          body { margin: 16px; }
          .diff-pane { padding: 10px; }
          .line { white-space: pre-wrap; padding: 2px 6px; }
          .unchanged { opacity: 0.7; }
          .diff-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
          .diff-stats .stat { margin-right: 12px; }
          .diff-content { border-top: 1px solid #ddd; }
          .change-reasons { margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="diff-header">
          <h1>Opening Revision Changes</h1>
          <div class="diff-stats">
            ${this.renderStats(diff.stats)}
          </div>
        </div>
        <div class="diff-container">
          <div class="diff-pane original">
            <h2>Original Opening</h2>
            <div class="diff-content">
              ${this.renderOriginal(diff.segments, options)}
            </div>
          </div>
          <div class="diff-pane revised">
            <h2>Revised Opening</h2>
            <div class="diff-content">
              ${this.renderRevised(diff.segments, options)}
            </div>
          </div>
        </div>
        ${options.showReasons ? this.renderChangeReasons(diff.segments) : ''}
      </body>
      </html>
    `;
  }

  /** Generate inline diff with changes highlighted in place */
  generateInlineHTML(diff: DiffResult, options: DiffVisualizationOptions): string {
    const lines: string[] = [];
    lines.push('<div class="inline-diff">');
    for (const seg of diff.segments) {
      if (seg.type === 'unchanged') {
        if (options.contextLines > 0) {
          const ctx = (seg.revisedText || seg.originalText || '').split('\n').slice(0, options.contextLines).join('\n');
          if (ctx) lines.push(`<div class="line unchanged">${escapeHtml(ctx)}</div>`);
        }
        continue;
      }
      if (seg.type === 'deleted') lines.push(`<div class="line deleted"><del>${escapeHtml(seg.originalText || '')}</del></div>`);
      if (seg.type === 'added') lines.push(`<div class="line added"><ins>${escapeHtml(seg.revisedText || '')}</ins></div>`);
      if (seg.type === 'modified') {
        lines.push(`<div class="line modified"><del>${escapeHtml(seg.originalText || '')}</del></div>`);
        lines.push(`<div class="line modified"><ins>${escapeHtml(seg.revisedText || '')}</ins></div>`);
      }
    }
    lines.push('</div>');
    return lines.join('\n');
  }

  /** Generate unified diff format (like git diff) */
  generateUnifiedDiff(diff: DiffResult): string {
    const out: string[] = [];
    out.push('--- original');
    out.push('+++ revised');
    for (const seg of diff.segments) {
      if (seg.type === 'unchanged') {
        const ctx = (seg.originalText || '').split('\n');
        for (const l of ctx) out.push(` ${l}`);
        continue;
      }
      if (seg.type === 'deleted') {
        for (const l of (seg.originalText || '').split('\n')) out.push(`-${l}`);
      } else if (seg.type === 'added') {
        for (const l of (seg.revisedText || '').split('\n')) out.push(`+${l}`);
      } else if (seg.type === 'modified') {
        for (const l of (seg.originalText || '').split('\n')) out.push(`-${l}`);
        for (const l of (seg.revisedText || '').split('\n')) out.push(`+${l}`);
      }
    }
    return out.join('\n');
  }

  private getStyles(style: 'github' | 'vscode' | 'minimal'): string {
    switch (style) {
      case 'github':
        return `
          .diff-container { display: flex; gap: 20px; font-family: monospace; }
          .diff-pane { flex: 1; border: 1px solid #d1d5da; border-radius: 6px; }
          .added { background-color: #d4f8d4; }
          .deleted { background-color: #ffd4d4; text-decoration: line-through; }
          .modified { background-color: #fff5b1; }
          .line-number { color: #666; padding-right: 10px; user-select: none; }
          .change-reason { font-size: 0.9em; color: #666; font-style: italic; }
        `;
      case 'vscode':
        return `
          .diff-container { display: flex; gap: 20px; font-family: 'Consolas', monospace; background: #1e1e1e; color: #d4d4d4; }
          .added { background-color: #2d4a2b; }
          .deleted { background-color: #4a2b2b; text-decoration: line-through; }
          .modified { background-color: #4a4a2b; }
        `;
      default:
        return `
          .diff-container { display: flex; gap: 10px; }
          .added { color: green; }
          .deleted { color: red; text-decoration: line-through; }
          .modified { color: orange; }
        `;
    }
  }

  private renderStats(stats: DiffResult['stats']): string {
    return `
      <span class="stat">Changes: ${stats.totalChanges}</span>
      <span class="stat added">+${stats.linesAdded} lines</span>
      <span class="stat deleted">-${stats.linesDeleted} lines</span>
      <span class="stat modified">~${stats.linesModified} lines</span>
    `;
  }

  private renderChangeReasons(segments: DiffSegment[]): string {
    const reasons = segments
      .filter(s => s.reason)
      .map(s => `<li>${escapeHtml(s.reason || '')}${s.source ? ` (${s.source})` : ''}</li>`)
      .join('');

    return `
      <div class="change-reasons">
        <h3>Change Explanations</h3>
        <ul>${reasons}</ul>
      </div>
    `;
  }

  private renderOriginal(segments: DiffSegment[], options: DiffVisualizationOptions): string {
    return segments.map((s, idx) => {
      const ln = options.showLineNumbers ? `<span class="line-number">${idx + 1}</span>` : '';
      if (s.type === 'added') return `<div class="line unchanged">${ln}</div>`;
      const cls = s.type === 'unchanged' ? 'unchanged' : s.type;
      const txt = escapeHtml(s.originalText || '');
      return `<div class="line ${cls}">${ln}${txt}</div>`;
    }).join('');
  }

  private renderRevised(segments: DiffSegment[], options: DiffVisualizationOptions): string {
    return segments.map((s, idx) => {
      const ln = options.showLineNumbers ? `<span class="line-number">${idx + 1}</span>` : '';
      if (s.type === 'deleted') return `<div class="line unchanged">${ln}</div>`;
      const cls = s.type === 'unchanged' ? 'unchanged' : s.type;
      const txt = escapeHtml(s.revisedText || '');
      return `<div class="line ${cls}">${ln}${txt}</div>`;
    }).join('');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default { DiffVisualizer };
