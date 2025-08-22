import { diff_match_patch, DIFF_EQUAL, DIFF_DELETE, DIFF_INSERT } from 'diff-match-patch';
import type { AnchoredEdit, EditSource } from './types.js';
import type { SpoilerViolation } from '../../../types/spoiler-types.js';
import type { ContextGap } from './context-analyzer.js';

export interface DiffSegment {
  type: 'unchanged' | 'added' | 'deleted' | 'modified';
  originalText?: string;
  revisedText?: string;
  startOffset: number;
  endOffset: number;
  reason?: string; // Why this change was made
  source?: EditSource;
}

export interface DiffResult {
  segments: DiffSegment[];
  stats: {
    totalChanges: number;
    linesAdded: number;
    linesDeleted: number;
    linesModified: number;
    charactersChanged: number;
  };
}

export class DiffEngine {
  /**
   * Apply all edits from spoiler fixes and context bridges to generate diff
   */
  generateDiff(
    originalText: string,
    spoilerFixes: SpoilerViolation[],
    contextBridges: ContextGap[],
    additionalEdits: AnchoredEdit[] = []
  ): DiffResult {
    const collected: AnchoredEdit[] = [
      ...this.fromSpoilers(spoilerFixes),
      ...this.fromContext(contextBridges),
      ...additionalEdits,
    ];
    const merged = this.mergeEdits(collected);
    const revised = this.applyEdits(originalText, merged);
    const segments = this.computeLineDiff(originalText, revised);
    // Attach reasons/sources where possible by mapping offsets
    this.annotateSegmentsWithReasons(segments, merged);
    const stats = this.computeStats(segments);
    return { segments, stats };
  }

  private fromSpoilers(spoilers: SpoilerViolation[]): AnchoredEdit[] {
    const edits: AnchoredEdit[] = [];
    for (const v of spoilers) {
      const fix = v.fix;
      if (!fix) continue;
      if (fix.type === 'delete') {
        edits.push({
          id: `spoiler:${v.revealId}:${v.mentionedIn.anchor.offset}`,
          type: 'delete',
          anchor: v.mentionedIn.anchor,
          originalText: fix.original,
          priority: 10,
          reason: fix.reason,
          source: 'spoiler',
        });
      } else if (fix.type === 'replace') {
        edits.push({
          id: `spoiler:${v.revealId}:${v.mentionedIn.anchor.offset}`,
          type: 'replace',
          anchor: v.mentionedIn.anchor,
          originalText: fix.original,
          newText: fix.suggested,
          priority: 10,
          reason: fix.reason,
          source: 'spoiler',
        });
      } else if (fix.type === 'insert') {
        edits.push({
          id: `spoiler:${v.revealId}:${v.mentionedIn.anchor.offset}`,
          type: 'insert',
          anchor: v.mentionedIn.anchor,
          newText: fix.suggested,
          priority: 8,
          reason: fix.reason,
          source: 'spoiler',
        });
      }
    }
    return edits;
  }

  private fromContext(gaps: ContextGap[]): AnchoredEdit[] {
    const edits: AnchoredEdit[] = [];
    for (const g of gaps) {
      const bridge = g.bridge;
      if (!bridge?.text) continue;
      edits.push({
        id: `context:${g.id}:${bridge.insertPoint.offset}`,
        type: 'insert',
        anchor: bridge.insertPoint,
        newText: ensureSentenceSpacing(bridge.text),
        priority: 5,
        reason: g.confusion.readerQuestion,
        source: 'context',
      });
    }
    return edits;
  }

  /** Merge overlapping or adjacent edits intelligently */
  private mergeEdits(edits: AnchoredEdit[]): AnchoredEdit[] {
    const sorted = edits.slice().sort((a, b) => a.anchor.offset - b.anchor.offset);
    const merged: AnchoredEdit[] = [];
    const proximity = 10; // chars
    for (const e of sorted) {
      const last = merged[merged.length - 1];
      if (!last) { merged.push(e); continue; }
      const lastEnd = last.anchor.offset + (last.originalText?.length || 0);
      const thisStart = e.anchor.offset;
      const overlap = thisStart <= lastEnd + proximity;
      if (overlap) {
        // Resolve by priority; if same, coalesce into a replace with combined text
  const winner = (last.priority || 0) >= (e.priority || 0) ? last : e;
        // If edits touch the same region, convert to replace combining intents
        const start = Math.min(last.anchor.offset, e.anchor.offset);
        const end = Math.max(lastEnd, e.anchor.offset + (e.originalText?.length || 0));
        const originalSpanLen = Math.max(0, end - start);
        merged[merged.length - 1] = {
          id: winner.id,
          type: 'replace',
          anchor: { ...winner.anchor, offset: start, length: originalSpanLen },
          originalText: undefined, // not strictly needed for replace
          newText: [last, e].map(x => x.type === 'insert' ? (x.newText || '') : x.type === 'delete' ? '' : (x.newText || '')).join(' '),
          priority: Math.max(last.priority || 0, e.priority || 0),
          reason: [last.reason, e.reason].filter(Boolean).join(' + '),
          source: winner.source,
        };
      } else {
        merged.push(e);
      }
    }
    return merged;
  }

  /** Apply anchored edits to text */
  private applyEdits(text: string, edits: AnchoredEdit[]): string {
    // Sort in reverse by offset so indexes remain valid
    const byPosDesc = edits.slice().sort((a, b) => (b.anchor.offset) - (a.anchor.offset));
    let result = text;
    for (const e of byPosDesc) {
      let start = clamp(0, result.length, e.anchor.offset);
      let end = clamp(0, result.length, e.anchor.offset + (e.anchor.length || 0));
      // Fallback: if we expect originalText for delete/replace but the slice doesn't match, search nearby
      if ((e.type === 'delete' || e.type === 'replace') && e.originalText) {
        const slice = result.slice(start, end);
        if (slice !== e.originalText) {
          const window = 1000;
          const winStart = clamp(0, result.length, start - window);
          const winEnd = clamp(0, result.length, end + window);
          const region = result.slice(winStart, winEnd);
          const localIdx = region.indexOf(e.originalText);
          const globalIdx = localIdx !== -1 ? winStart + localIdx : result.indexOf(e.originalText);
          if (globalIdx !== -1) {
            start = globalIdx;
            end = globalIdx + e.originalText.length;
          }
        }
      }
      if (e.type === 'insert') {
        const ins = e.newText || '';
        result = result.slice(0, start) + ins + result.slice(start);
      } else if (e.type === 'delete') {
        result = result.slice(0, start) + result.slice(end);
      } else if (e.type === 'replace') {
        const rep = e.newText || '';
        result = result.slice(0, start) + rep + result.slice(end);
      }
    }
    return result;
  }

  /** Run line-by-line diff algorithm */
  private computeLineDiff(original: string, revised: string): DiffSegment[] {
    // Compute per-line diff using diff-match-patch on the full text and then map to lines
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(original, revised);
    dmp.diff_cleanupSemantic(diffs);
    const segments: DiffSegment[] = [];
  let oCursor = 0;
    for (const [op, data] of diffs) {
      if (op === DIFF_EQUAL) {
  segments.push({ type: 'unchanged', originalText: data, revisedText: data, startOffset: oCursor, endOffset: oCursor + data.length });
  oCursor += data.length;
      } else if (op === DIFF_DELETE) {
        segments.push({ type: 'deleted', originalText: data, startOffset: oCursor, endOffset: oCursor + data.length });
        oCursor += data.length;
      } else if (op === DIFF_INSERT) {
  segments.push({ type: 'added', revisedText: data, startOffset: oCursor, endOffset: oCursor });
      }
    }

    // Coalesce adjacent add+delete into modified blocks when appropriate
    const coalesced: DiffSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]!;
      const n = segments[i + 1];
      if (s.type === 'deleted' && n && n.type === 'added') {
        coalesced.push({ type: 'modified', originalText: s.originalText, revisedText: n.revisedText, startOffset: s.startOffset, endOffset: n.endOffset });
        i++; // skip next
        continue;
      }
      coalesced.push(s);
    }
    return coalesced;
  }

  private annotateSegmentsWithReasons(segments: DiffSegment[], edits: AnchoredEdit[]): void {
    // Build simple interval mapping from edits
    const spans = edits.map(e => ({
      start: e.anchor.offset,
      end: e.anchor.offset + (e.anchor.length || 0),
      reason: e.reason,
      source: e.source,
    }));
    for (const seg of segments) {
      if (seg.type === 'unchanged') continue;
      // If any span overlaps this segment, attach the first matching reason/source
      const hit = spans.find(sp => rangeOverlaps(seg.startOffset, seg.endOffset, sp.start, sp.end));
      if (hit) {
        seg.reason = hit.reason;
        seg.source = hit.source;
      }
    }
  }

  private computeStats(segments: DiffSegment[]): DiffResult['stats'] {
    let linesAdded = 0, linesDeleted = 0, linesModified = 0, chars = 0, totalChanges = 0;
    for (const s of segments) {
      if (s.type === 'unchanged') continue;
      totalChanges++;
      if (s.type === 'added') { linesAdded += countNewlines(s.revisedText || ''); chars += (s.revisedText || '').length; }
      else if (s.type === 'deleted') { linesDeleted += countNewlines(s.originalText || ''); chars += (s.originalText || '').length; }
      else if (s.type === 'modified') {
        linesModified += Math.max(countNewlines(s.originalText || ''), countNewlines(s.revisedText || ''));
        chars += Math.max((s.originalText || '').length, (s.revisedText || '').length);
      }
    }
    return { totalChanges, linesAdded, linesDeleted, linesModified, charactersChanged: chars };
  }
}

function countNewlines(s: string): number { return s.split('\n').length - 1; }
function clamp(min: number, max: number, v: number): number { return Math.max(min, Math.min(max, v)); }
function rangeOverlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd);
}
function ensureSentenceSpacing(s: string): string {
  if (!s) return s;
  // If not ending with punctuation, add a space after, else ensure trailing space/newline boundary looks natural
  if (!/[.!?]\s*$/.test(s)) return s.trimEnd() + '. ';
  return s.endsWith('\n') ? s : s + ' ';
}

export default { DiffEngine };
