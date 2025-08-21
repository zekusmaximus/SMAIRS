import type { Profile } from './providers.js';
import { globalLLMCache } from './cache-manager.js';
import type { UsageTracker } from './usage-tracker.js';

export interface PerformanceMetrics { p50: number; p95: number; p99: number; failures: number; totalRequests: number; failureRate: number; }
export interface BudgetStatus { within: boolean; latency: number; target: number; degradedMode: boolean; }
export interface HealthReport { overallHealthy: boolean; profiles: Record<string, BudgetStatus>; recommendations: string[]; }

export interface DegradedModeConfig {
  latencyThreshold: { p95: number; p99: number };
  failureRateThreshold: number; // e.g. 0.1 = 10%
  costPerHourThreshold: number; // USD
  recoveryPeriodMs: number; // ms
}

export class PerformanceManager {
  private metrics: Map<Profile, { latencies: number[]; failures: number; total: number }> = new Map();
  private degradedSince: number | null = null;
  private config: DegradedModeConfig = {
    latencyThreshold: { p95: 3000, p99: 5000 },
    failureRateThreshold: 0.1,
    costPerHourThreshold: 10.0,
    recoveryPeriodMs: 300_000, // 5m
  };
  private usageTracker?: UsageTracker; // injected lazily

  attachUsageTracker(ut: UsageTracker) { this.usageTracker = ut; }

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
    if (m.latencies.length > 2000) m.latencies.splice(0, m.latencies.length - 2000); // bound
    this.metrics.set(profile, m);
  }

  private percentile(arr: number[], p: number): number {
    if (!arr.length) return 0;
    const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))));
  return arr[idx] ?? 0;
  }

  getMetrics(): PerformanceMetrics {
    // Combine all profiles for global metrics
    const all: number[] = [];
    let failures = 0; let total = 0;
    for (const m of this.metrics.values()) { all.push(...m.latencies); failures += m.failures; total += m.total; }
    all.sort((a, b) => a - b);
    const p50 = this.percentile(all, 0.5);
    const p95 = this.percentile(all, 0.95);
    const p99 = this.percentile(all, 0.99);
    const failureRate = total ? failures / total : 0;
    return { p50, p95, p99, failures, totalRequests: total, failureRate };
  }

  checkBudget(profile: Profile): BudgetStatus {
    const target = this.getTarget(profile);
    const m = this.metrics.get(profile);
    const latest = m?.latencies[m.latencies.length - 1] || 0;
    const within = latest <= target * (this.isDegraded() ? 2 : 1);
    return { within, latency: latest, target, degradedMode: this.isDegraded() };
  }

  checkAndUpdateDegradedMode(): void {
    const metrics = this.getMetrics();
    const hourlyCost = this.usageTracker ? this.usageTracker.getCostSummary().totalCost : 0; // window = 1h
    const failureRate = metrics.failureRate;
    const shouldDegrade =
      metrics.p95 > this.config.latencyThreshold.p95 ||
      metrics.p99 > this.config.latencyThreshold.p99 ||
      failureRate > this.config.failureRateThreshold ||
      hourlyCost > this.config.costPerHourThreshold;
    if (shouldDegrade && !this.degradedSince) {
      this.enableDegradedMode();
    } else if (!shouldDegrade && this.degradedSince && (Date.now() - this.degradedSince > this.config.recoveryPeriodMs)) {
      this.disableDegradedMode();
    }
  }

  private getTarget(profile: Profile): number {
    switch (profile) {
      case 'FAST_ITERATE': return 500;
      case 'STRUCTURE_LONGCTX': return 2000;
      case 'JUDGE_SCORER': return 2000;
      default: return 1000;
    }
  }

  private enableDegradedMode(): void {
    this.degradedSince = Date.now();
    this.log('warn', 'Entering degraded mode', this.getMetrics());
    globalLLMCache.extendTTLs(2.0);
  }

  private disableDegradedMode(): void {
    this.log('info', 'Exiting degraded mode', { duration: this.degradedSince ? Date.now() - this.degradedSince : 0 });
    this.degradedSince = null;
    globalLLMCache.restoreTTLs();
  }

  isDegraded(): boolean { return this.degradedSince != null; }
  getDegradedSince(): number | null { return this.degradedSince; }
  getConfig(): DegradedModeConfig { return this.config; }

  forceEnterDegraded(): void { if (!this.degradedSince) this.enableDegradedMode(); }
  forceExitDegraded(): void { if (this.degradedSince) this.disableDegradedMode(); }

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
    const m = this.getMetrics();
    if (m.p95 > this.config.latencyThreshold.p95 * 0.8) recommendations.push('Latency rising: trim prompts or increase caching');
    if (m.failureRate > 0.05) recommendations.push('Investigate elevated failure rate');
    if (this.isDegraded()) recommendations.push('Degraded mode active: consider scaling providers');
    return { overallHealthy, profiles, recommendations };
  }

  private log(level: 'info'|'warn'|'debug', msg: string, data?: unknown) {
    if (level === 'debug' && (readEnv('DEBUG')||'').toLowerCase() !== 'true' && (readEnv('DEBUG')||'') !== '1') return;
    console[level === 'debug' ? 'debug' : level](`[perf:${level}] ${msg}` + (data ? ' ' + JSON.stringify(data) : ''));
  }
}

function readEnv(name: string): string | undefined { // local
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}
