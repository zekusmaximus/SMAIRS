import type { Profile } from './providers.js';

export interface PerformanceMetrics { p50: number; p95: number; p99: number; failures: number; totalRequests: number; }
export interface BudgetStatus { within: boolean; latency: number; target: number; degradedMode: boolean; }
export interface HealthReport { overallHealthy: boolean; profiles: Record<string, BudgetStatus>; recommendations: string[]; }

export class PerformanceManager {
  private metrics: Map<Profile, { latencies: number[]; failures: number; total: number }> = new Map();
  private degradedMode = false;

  async monitorExecution<T>(profile: Profile, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      this.record(profile, performance.now() - start, true);
      return result;
    } catch (err) {
      this.record(profile, performance.now() - start, false);
      throw err;
    }
  }

  private record(profile: Profile, latency: number, success: boolean) {
    const m = this.metrics.get(profile) || { latencies: [], failures: 0, total: 0 };
    m.latencies.push(latency);
    m.total++;
    if (!success) m.failures++;
    if (m.latencies.length > 1000) m.latencies.splice(0, m.latencies.length - 1000); // bound
    this.metrics.set(profile, m);
  }

  checkBudget(profile: Profile): BudgetStatus {
    const target = this.getTarget(profile);
    const m = this.metrics.get(profile);
    const latest = m?.latencies[m.latencies.length - 1] || 0;
    const within = latest <= target * (this.degradedMode ? 2 : 1);
    if (!within && !this.degradedMode) this.enableDegradedMode();
    return { within, latency: latest, target, degradedMode: this.degradedMode };
  }

  private getTarget(profile: Profile): number {
    switch (profile) {
      case 'FAST_ITERATE': return 500;
      case 'STRUCTURE_LONGCTX': return 2000;
      case 'JUDGE_SCORER': return 2000;
      default: return 1000;
    }
  }

  enableDegradedMode(): void { this.degradedMode = true; }

  getHealthReport(): HealthReport {
    const profiles: Record<string, BudgetStatus> = {};
    const statuses: BudgetStatus[] = [];
    for (const p of this.metrics.keys()) {
      const status = this.checkBudget(p as Profile);
      profiles[p] = status;
      statuses.push(status);
    }
    const overallHealthy = statuses.every(s => s.within);
    const recommendations: string[] = [];
    if (!overallHealthy) recommendations.push('Enable caching / shorter prompts');
    if (this.degradedMode) recommendations.push('Degraded mode active: consider scaling providers');
    return { overallHealthy, profiles, recommendations };
  }
}
