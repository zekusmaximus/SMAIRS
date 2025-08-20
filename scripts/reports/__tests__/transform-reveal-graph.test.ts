import { describe, it, expect } from 'vitest';
import { transformRevealGraph } from '../transform-reveal-graph.js';
import { renderPrereqList } from '../../../src/features/manuscript/reports.js';

describe('transformRevealGraph', () => {
  it('enriches nodes and preserves edges', () => {
    const raw = {
      nodes: [
        { internal_id: 'h1', scene_id: 'ch01_s01', text: 'The reactor is unstable' },
        { internal_id: 'h2', scene_id: 'ch01_s02', text: 'Agent K is compromised' },
        { internal_id: 'h3', scene_id: 'ch01_s02', text: 'Backup team en route', index: 1 },
      ],
      edges: [ { from: 'h1', to: 'h2' }, { from: 'h1', to: 'h3' } ]
    };
    const enriched = transformRevealGraph(raw);
    expect(enriched.nodes.length).toBe(3);
    const h2 = enriched.idMap['h2'];
    expect(h2.public_id.startsWith('R-ch01_s02-')).toBe(true);
    expect(h2.label.split(' ').length).toBeLessThanOrEqual(8);
    // edges unchanged
    expect(enriched.edges).toEqual(raw.edges);
  });
});

describe('renderPrereqList', () => {
  it('renders up to 3 prereqs then (+N more)', () => {
    const idMap = {
      a: { public_id: 'R-ch01_s01-01', label: 'Reactor unstable', tooltip: 'Reactor unstable' },
      b: { public_id: 'R-ch01_s02-01', label: 'Agent K compromised', tooltip: 'Agent K compromised' },
      c: { public_id: 'R-ch01_s02-02', label: 'Backup team en route', tooltip: 'Backup team en route' },
      d: { public_id: 'R-ch01_s03-01', label: 'Evacuation ordered', tooltip: 'Evacuation ordered' },
    } as const;
    const html = renderPrereqList(['a','b','c','d'], idMap, 3);
    expect(html).toContain('<code>R-ch01_s01-01</code>');
    expect(html).toContain('<code>R-ch01_s02-01</code>');
    expect(html).toContain('<code>R-ch01_s02-02</code>');
    expect(html).toContain('(+1 more)');
    // Should include title attributes
  expect(html).toMatch(/title="/);
  });
});
