/**
 * Helper utilities for public-facing reveal identifiers & labels.
 * Future formats (slug+shortHash, etc.) should only require edits here.
 */

export function buildPublicId(sceneId: string, zeroBasedIndex: number): string {
  const idx = (zeroBasedIndex + 1).toString().padStart(2, '0');
  return `R-${sceneId}-${idx}`;
}

/** Collapse whitespace, take first N words, append ellipsis if truncated. */
export function toLabel(text: string, maxWords = 8): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ') + '…';
}

/** HTML escape for attribute / inline contexts */
export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RawRevealNode { internal_id: string; scene_id: string; text: string; index?: number }
export interface EnrichedRevealNode extends RawRevealNode { public_id: string; label: string; tooltip: string }

export function enrichNode(node: RawRevealNode, fallbackIndex: number): EnrichedRevealNode {
  const idx = typeof node.index === 'number' ? node.index : fallbackIndex;
  const public_id = buildPublicId(node.scene_id, idx);
  const label = toLabel(node.text);
  const tooltip = htmlEscape(node.text.trim());
  return { ...node, public_id, label, tooltip };
}

export default { buildPublicId, toLabel, htmlEscape, enrichNode };
