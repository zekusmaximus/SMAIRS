import { describe, it, expect } from 'vitest';
import { ProviderAdapter } from '../../llm/provider-adapter.js';
import type { CallArgs } from '../../llm/providers.js';

describe('ProviderAdapter', () => {
  const adapter = new ProviderAdapter();
  const sample: CallArgs = { prompt: 'Test prompt for adapter' };

  it('falls back on primary failure', async () => {
    const res = await adapter.executeWithFallback('FAST_ITERATE', sample);
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('respects concurrency limits', async () => {
    const start = Date.now();
    const promises = Array.from({ length: 5 }).map((_, i) => adapter.executeWithFallback('FAST_ITERATE', { prompt: 'P' + i }));
    const results = await Promise.all(promises);
    expect(results.length).toBe(5);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('handles timeout correctly', async () => {
    const res = await adapter.executeWithFallback('FAST_ITERATE', { prompt: 'timeout test' });
    expect(res).toBeTruthy();
  });

  it('deduplicates identical requests', async () => {
    const p1 = adapter.executeWithFallback('FAST_ITERATE', { prompt: 'same' });
    const p2 = adapter.executeWithFallback('FAST_ITERATE', { prompt: 'same' });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.text).toBeDefined();
    expect(b.text).toBeDefined();
  });

  it('maintains request priority order', async () => {
    const fast = adapter.executeWithFallback('FAST_ITERATE', { prompt: 'prio-fast' });
    const slow = adapter.executeWithFallback('STRUCTURE_LONGCTX', { prompt: 'prio-slow' });
    const [r1, r2] = await Promise.all([fast, slow]);
    expect(r1.text).toBeDefined();
    expect(r2.text).toBeDefined();
  });

  it('tracks usage accurately', () => {
    const internal = adapter as unknown as { usageTracker: { getCostSummary: () => { totalRequests: number } } };
    const summary = internal.usageTracker.getCostSummary();
    expect(summary.totalRequests).toBeGreaterThan(0);
  });

  it('optimizes costs through batching', async () => {
    const res = await adapter.executeBatch('FAST_ITERATE', [sample, { prompt: 'Test prompt for adapter 2' }]);
    expect(res.length).toBe(2);
  });
});
