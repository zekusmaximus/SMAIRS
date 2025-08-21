// Edit consolidation utilities extracted for reuse and testability.
import type { EditSpan } from '../../../types/burden-types.js';

// Count words helper
export function countWords(text: string | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function editsOverlap(a: EditSpan, b: EditSpan): boolean {
  if (!a.anchor?.position || !b.anchor?.position) return false;
  const aEnd = a.anchor.position + (a.originalText?.length || 0);
  const bEnd = b.anchor.position + (b.originalText?.length || 0);
  return !(aEnd < b.anchor.position || bEnd < a.anchor.position);
}

export function editsAdjacent(a: EditSpan, b: EditSpan): boolean {
  if (!a.anchor?.position || !b.anchor?.position) return false;
  const aEnd = a.anchor.position + (a.originalText?.length || 0);
  // treat small gap <=3 chars as adjacency to simplify merging for burden metrics
  return Math.abs(aEnd - b.anchor.position) <= 3;
}

export function determineType(t1: EditSpan['type'], t2: EditSpan['type']): EditSpan['type'] {
  if (t1 === t2) return t1;
  if (t1 === 'replace' || t2 === 'replace') return 'replace';
  if (t1 === 'insert' && t2 === 'delete') return 'replace';
  if (t1 === 'delete' && t2 === 'insert') return 'replace';
  return 'replace';
}

export function higherPriority(p1: EditSpan['priority'], p2: EditSpan['priority']): EditSpan['priority'] {
  const order = ['optional','important','critical'];
  if (!p1) return p2; if (!p2) return p1;
  return order.indexOf(p1) > order.indexOf(p2) ? p1 : p2;
}

export function expandAnchor(a?: EditSpan['anchor'], b?: EditSpan['anchor']): EditSpan['anchor'] | undefined {
  if (!a) return b; if (!b) return a;
  const pos = Math.min(a.position ?? 0, b.position ?? 0);
  return { ...a, ...b, position: pos };
}

export function combineOriginal(o1?: string, o2?: string): string | undefined {
  if (!o1) return o2; if (!o2) return o1;
  return o1 + ' ' + o2;
}

export function combineNew(n1?: string, n2?: string): string | undefined {
  if (!n1) return n2; if (!n2) return n1;
  return n1 + ' ' + n2;
}

export function mergeEdits(e1: EditSpan, e2: EditSpan): EditSpan {
  return {
    id: `merged-${e1.id || 'a'}-${e2.id || 'b'}`,
    type: determineType(e1.type, e2.type),
    anchor: expandAnchor(e1.anchor, e2.anchor),
    originalText: combineOriginal(e1.originalText, e2.originalText),
    newText: combineNew(e1.newText, e2.newText),
    wordDelta: (e1.wordDelta || 0) + (e2.wordDelta || 0),
    priority: higherPriority(e1.priority, e2.priority),
    reason: [e1.reason, e2.reason].filter(Boolean).join('; '),
  };
}

export function consolidateEdits(edits: EditSpan[]): EditSpan[] {
  const sorted = edits.slice().sort((a,b)=> (a.anchor?.position ?? 0) - (b.anchor?.position ?? 0));
  const out: EditSpan[] = [];
  let current: EditSpan | undefined;
  for (const e of sorted) {
    if (!current) { current = e; continue; }
    if (editsOverlap(current, e) || editsAdjacent(current, e) || (current.anchor?.position === e.anchor?.position)) {
      current = mergeEdits(current, e);
    } else {
      out.push(current);
      current = e;
    }
  }
  if (current) out.push(current);
  return out;
}
