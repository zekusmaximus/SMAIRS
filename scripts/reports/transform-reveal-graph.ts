import { enrichNode, type RawRevealNode, type EnrichedRevealNode } from './reveal-id.js';

export interface RawRevealEdge { from: string; to: string }
export interface RawRevealGraph { nodes: RawRevealNode[]; edges: RawRevealEdge[] }
export interface EnrichedRevealGraph { nodes: EnrichedRevealNode[]; edges: RawRevealEdge[]; idMap: Record<string, { public_id: string; label: string; tooltip: string }> }

/**
 * Transform raw reveal graph by assigning stable within-scene indices (existing index first, else order encountered)
 * and enriching nodes with public metadata.
 */
export function transformRevealGraph(raw: RawRevealGraph): EnrichedRevealGraph {
  // Group nodes by scene
  const byScene: Map<string, RawRevealNode[]> = new Map();
  for (const n of raw.nodes) {
    const arr = byScene.get(n.scene_id) || [];
    arr.push(n);
    byScene.set(n.scene_id, arr);
  }

  // Assign fallback indices for nodes missing index, preserving order
  for (const [, list] of byScene) {
    let cursor = 0;
    for (const node of list) {
      if (typeof node.index === 'number') continue;
      node.index = cursor; // zero-based
      cursor++;
    }
  }

  const enriched: EnrichedRevealNode[] = [];
  const idMap: Record<string, { public_id: string; label: string; tooltip: string }> = {};
  for (const node of raw.nodes) {
    const idx = typeof node.index === 'number' ? node.index : 0;
    const e = enrichNode(node, idx);
    enriched.push(e);
    idMap[e.internal_id] = { public_id: e.public_id, label: e.label, tooltip: e.tooltip };
  }

  return { nodes: enriched, edges: raw.edges, idMap };
}

export default { transformRevealGraph };
