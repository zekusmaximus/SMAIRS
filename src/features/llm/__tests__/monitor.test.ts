import { describe, it, expect, beforeEach } from 'vitest';
import { LLMMonitor } from '../monitor.js';
import type { Profile } from '../providers.js';

describe('LLM Monitor', () => {
  let monitor: LLMMonitor;
  beforeEach(() => { monitor = new LLMMonitor(); });

  it('tracks metrics accurately', () => {
    monitor.recordRequest('STRUCTURE_LONGCTX' as unknown as Profile, true, false);
    monitor.recordTokens('anthropic', 1000, 500);
    monitor.recordCost('anthropic', 0.045);
    monitor.recordLatency('structure_analysis', 1234);

    const metrics = monitor.getMetrics();
    expect(metrics.requests.total).toBe(1);
    expect(metrics.requests.successful).toBe(1);
    expect(metrics.tokens.totalIn).toBe(1000);
    expect(metrics.tokens.totalOut).toBe(500);
    expect(metrics.costs.total).toBeCloseTo(0.045);
    expect(metrics.performance.avgLatency).toBeGreaterThan(0);
  });

  it('generates alerts for problems', () => {
    for (let i = 0; i < 15; i++) {
      monitor.recordRequest('FAST_ITERATE' as unknown as Profile, false, false);
      monitor.recordError('RateLimitError', 'Too many requests', 'openai');
    }
    const alerts = monitor.getAlerts();
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(alerts[0]!.message).toMatch(/High failure rate/i);
  });

  it('calculates health score', () => {
    monitor.recordRequest('FAST_ITERATE' as unknown as Profile, true, true);
    const full = monitor.getHealthScore();
    expect(full).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) monitor.recordRequest('FAST_ITERATE' as unknown as Profile, false, false);
    const degraded = monitor.getHealthScore();
    expect(degraded).toBeLessThan(full);
  });

  it('formats dashboard correctly', () => {
    const dash = monitor.getDashboard();
    expect(dash).toContain('LLM System Monitor');
    expect(dash).toContain('PROVIDERS');
    expect(dash).toContain('PERFORMANCE');
    expect(dash).toContain('USAGE');
    expect(dash).toContain('ALERTS');
  });
});
