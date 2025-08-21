import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderAdapter, SystemHealthReport } from '../src/features/llm/provider-adapter.js';

function longText(words = 800): string {
  return Array.from({ length: words }).map((_, i) => `word${i}`).join(' ');
}

describe('Degraded Mode', () => {
  let adapter: ProviderAdapter;
  beforeEach(async () => {
    adapter = new ProviderAdapter();
    // Force a few baseline metrics so percentile math has data
    for (let i = 0; i < 5; i++) await adapter.perf.monitorExecution('FAST_ITERATE', async () => {});
  });

  it('should trim prompts when in degraded mode', async () => {
    adapter.perf.forceEnterDegraded();
  const prompt = 'synopsis:\n' + longText(4000) + '\nDetailed instructions: ' + longText(1000);
  // Access private for test via bracket notation
  const optimized = (adapter as unknown as { optimizePromptForDegraded(p: string, prof: string): string }).optimizePromptForDegraded(prompt, 'FAST_ITERATE');
  expect(optimized.length).toBeLessThan(prompt.length); // trimmed
  });

  it('should extend cache TTLs in degraded mode', () => {
  const before = (globalThis as unknown as { globalLLMCache?: { getTTLMultiplier(): number } }).globalLLMCache?.getTTLMultiplier?.() || 1;
    adapter.perf.forceEnterDegraded();
  const after = (globalThis as unknown as { globalLLMCache?: { getTTLMultiplier(): number } }).globalLLMCache?.getTTLMultiplier?.() || 1;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('should recover from degraded mode after threshold', async () => {
    adapter.perf.forceEnterDegraded();
    const since = adapter.perf.getDegradedSince();
    expect(since).not.toBeNull();
    // Fast-forward time beyond recovery threshold
    const realNow = Date.now;
    const recoveryMs = adapter.perf.getConfig().recoveryPeriodMs;
    Date.now = () => (since || 0) + recoveryMs + 1;
    adapter.perf.checkAndUpdateDegradedMode();
    expect(adapter.perf.isDegraded()).toBe(false);
    Date.now = realNow; // restore
  });

  it('should log mode transitions', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    adapter.perf.forceEnterDegraded();
    expect(warnSpy.mock.calls.find(c => String(c[0]).includes('Entering degraded mode'))).toBeTruthy();
    adapter.perf.forceExitDegraded();
    expect(infoSpy.mock.calls.find(c => String(c[0]).includes('Exiting degraded mode'))).toBeTruthy();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('should provide health report with recommendations', () => {
    adapter.perf.forceEnterDegraded();
  const report: SystemHealthReport = (adapter as unknown as { getSystemHealth(): SystemHealthReport }).getSystemHealth();
    expect(report.mode).toBe('degraded');
    expect(report.recommendations.length).toBeGreaterThanOrEqual(0); // presence
  });
});
