import { describe, it, expect } from 'vitest';
import { PatchApplicator } from '../patch-applicator.js';
import type { AnchoredEdit } from '../../manuscript/types.js';
import { PandocExporter } from '../pandoc-exporter.js';

describe('PatchApplicator', () => {
  it('applies inserts/deletes/replaces with anchor validation', () => {
    const src = 'Hello brave new world';
    const edits: AnchoredEdit[] = [
      { id: '1', type: 'insert', anchor: { sceneId: 's1', offset: 5, length: 0 }, newText: ',' },
      { id: '2', type: 'replace', anchor: { sceneId: 's1', offset: 6, length: 5 }, originalText: 'brave', newText: 'bold' },
      { id: '3', type: 'delete', anchor: { sceneId: 's1', offset: 16, length: 5 }, originalText: 'world' },
    ];
    const ap = new PatchApplicator();
    const res = ap.applyPatches(src, edits);
    expect(res.patchedText).toBe('Hello, bold new ');
    expect(res.changeLog.filter(c => c.success).length).toBe(3);
    expect(res.statistics.successRate).toBe(1);
  });
});

describe('PandocExporter fallbacks', () => {
  it('produces fallback formats without pandoc', async () => {
    const ex = new PandocExporter();
    const fb = ex.fallbackExport('# Title\n\nBody');
    expect(fb.markdown).toContain('# Title');
    expect(fb.html).toContain('<article>');
    expect(fb.plain).toContain('Title');
  });
});
