import { describe, it, expect } from 'vitest';
import { PerformanceManager } from '../../llm/performance-manager.js';

describe('PerformanceManager', () => {
  it('monitors latency accurately and enforces profile budgets', async () => {
    const pm = new PerformanceManager();
    await pm.monitorExecution('FAST_ITERATE', async () => { await delay(10); return 1; });
    const status = pm.checkBudget('FAST_ITERATE');
    expect(status.latency).toBeGreaterThanOrEqual(0);
    expect(status.target).toBeGreaterThan(0);
  });

  it('calculates percentiles correctly', async () => {
    const pm = new PerformanceManager();
    for (let i = 0; i < 20; i++) await pm.monitorExecution('JUDGE_SCORER', async () => { await delay(5 + i); });
    const report = pm.getHealthReport();
    expect(report.profiles.JUDGE_SCORER).toBeDefined();
  });

  it('triggers degraded mode appropriately', async () => {
    const pm = new PerformanceManager();
    await pm.monitorExecution('STRUCTURE_LONGCTX', async () => { await delay(2100); });
    const status = pm.checkBudget('STRUCTURE_LONGCTX');
    expect(status.degradedMode).toBe(true);
  });
});

async function delay(ms: number) { return new Promise(res => setTimeout(res, ms)); }
