import type { Profile } from './providers.js';
import { globalLLMCache } from './cache-manager.js';

export interface Span {
  id: string;
  operation: string;
  start: number;
  metadata?: Record<string, unknown>;
  end: (result?: Record<string, unknown>) => void;
}

export type Alert = { severity: 'critical' | 'warning'; message: string; timestamp: Date };

export interface LLMMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    cached: number;
    byProfile: Map<Profile, number>;
  };
  performance: {
    p50: number;
    p95: number;
    p99: number;
    avgLatency: number;
    slowestOperation: string;
  };
  tokens: {
    totalIn: number;
    totalOut: number;
    byProvider: Map<string, { in: number; out: number }>;
  };
  costs: {
    total: number;
    byProvider: Map<string, number>;
    byProfile: Map<Profile, number>;
    projectedMonthly: number;
  };
  cache: {
    hitRate: number;
    size: number;
    oldestEntry: Date;
    savings: number; // $ saved by cache hits
  };
  errors: {
    byType: Map<string, number>;
    lastError?: { time: Date; message: string; provider: string };
  };
}

export class LLMMonitor {
  private metrics: LLMMetrics;
  private spans: Map<string, Span> = new Map();
  private recentLatencies: number[] = [];
  private latenciesByOperation: Map<string, number[]> = new Map();
  private latenciesByProvider: Map<string, number[]> = new Map();
  private recentCosts: Array<{ t: number; cost: number }> = [];

  constructor() {
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0, cached: 0, byProfile: new Map() },
      performance: { p50: 0, p95: 0, p99: 0, avgLatency: 0, slowestOperation: '' },
      tokens: { totalIn: 0, totalOut: 0, byProvider: new Map() },
      costs: { total: 0, byProvider: new Map(), byProfile: new Map(), projectedMonthly: 0 },
      cache: { hitRate: 0, size: 0, oldestEntry: new Date(0), savings: 0 },
      errors: { byType: new Map(), lastError: undefined },
    };
  }

  startSpan(operation: string, metadata?: Record<string, unknown>): Span {
    const id = `${operation}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
    const span: Span = {
      id,
      operation,
      start: Date.now(),
      metadata,
      end: (result?: Record<string, unknown>) => {
        const ms = Date.now() - span.start;
        this.recordLatency(operation, ms);
        const provider = (result?.provider as string) || (metadata?.provider as string) || 'unknown';
        if (provider) this.recordProviderLatency(provider, ms);
        this.spans.delete(id);
      },
    };
    this.spans.set(id, span);
    return span;
  }

  recordRequest(profile: Profile, success: boolean, cached: boolean): void {
    this.metrics.requests.total++;
    if (success) this.metrics.requests.successful++; else this.metrics.requests.failed++;
    if (cached) this.metrics.requests.cached++;
    const cur = this.metrics.requests.byProfile.get(profile) || 0;
    this.metrics.requests.byProfile.set(profile, cur + 1);
    // update cache hit rate estimate from global cache (preferred) or derive
    const hit = globalLLMCache.getHitRate();
    this.metrics.cache.hitRate = Number.isFinite(hit) ? hit : (this.metrics.requests.cached / Math.max(1, this.metrics.requests.total));
    this.metrics.cache.size = globalLLMCache.getSize();
    // savings approximation
    const avgCost = this.metrics.costs.total / Math.max(1, this.metrics.requests.successful);
    this.metrics.cache.savings = Math.round(this.metrics.requests.cached * avgCost * 100) / 100;
    this.refreshProjectedMonthly();
  }

  recordLatency(operation: string, ms: number): void {
    this.recentLatencies.push(ms);
    if (this.recentLatencies.length > 500) this.recentLatencies.shift();
    const list = this.latenciesByOperation.get(operation) || [];
    list.push(ms); if (list.length > 200) list.shift();
    this.latenciesByOperation.set(operation, list);
    this.recomputeLatencyStats();
  }

  private recordProviderLatency(provider: string, ms: number): void {
    const list = this.latenciesByProvider.get(provider) || [];
    list.push(ms); if (list.length > 200) list.shift();
    this.latenciesByProvider.set(provider, list);
  }

  recordTokens(provider: string, input: number, output: number): void {
    this.metrics.tokens.totalIn += input;
    this.metrics.tokens.totalOut += output;
    const cur = this.metrics.tokens.byProvider.get(provider) || { in: 0, out: 0 };
    cur.in += input; cur.out += output;
    this.metrics.tokens.byProvider.set(provider, cur);
  }

  recordCost(source: string | Profile, amount: number): void {
    const provider = String(source);
    this.metrics.costs.total += amount;
    const byProv = (this.metrics.costs.byProvider.get(provider) || 0) + amount;
    this.metrics.costs.byProvider.set(provider, byProv);
    // If a known profile name, also track byProfile
    const maybeProfile = provider as Profile;
    if (['STRUCTURE_LONGCTX', 'FAST_ITERATE', 'JUDGE_SCORER'].includes(maybeProfile)) {
      const cur = (this.metrics.costs.byProfile.get(maybeProfile) || 0) + amount;
      this.metrics.costs.byProfile.set(maybeProfile, cur);
    }
    this.recentCosts.push({ t: Date.now(), cost: amount });
    if (this.recentCosts.length > 1000) this.recentCosts.shift();
    this.refreshProjectedMonthly();
  }

  recordError(type: string, message: string, provider: string): void {
    const cur = this.metrics.errors.byType.get(provider) || 0;
    this.metrics.errors.byType.set(provider, cur + 1);
    this.metrics.errors.lastError = { time: new Date(), message: `${type}: ${message}`, provider };
  }

  getMetrics(): LLMMetrics { return this.metrics; }

  getDashboard(): string {
    const m = this.metrics;
    const now = new Date().toISOString().split('T')[1]!.split('.')[0]!;
    const providers = ['anthropic', 'openai', 'google'];
    const lines = providers.map(p => `║   ${p[0]!.toUpperCase()}${p.slice(1).padEnd(9)}: ${this.getProviderStatus(p).padEnd(22)}║`);
    return `
╔═══════════════════════════════════════════════════════════════╗
║                    LLM System Monitor [${now}]                 ║
╠═══════════════════════════════════════════════════════════════╣
║ PROVIDERS                                                     ║
${lines.join('\n')}
║                                                               ║
║ PERFORMANCE (last hour)                                       ║
║   Requests   : ${m.requests.total} (${m.requests.successful} success, ${m.requests.cached} cached) ║
║   Latency    : P50=${m.performance.p50}ms P95=${m.performance.p95}ms P99=${m.performance.p99}ms ║
║   Cache Hit  : ${(m.cache.hitRate * 100).toFixed(1)}% (saved $${m.cache.savings.toFixed(2)}) ║
║                                                               ║
║ USAGE                                                         ║
║   Tokens In  : ${this.formatNumber(m.tokens.totalIn)}        ║
║   Tokens Out : ${this.formatNumber(m.tokens.totalOut)}       ║
║   Cost Today : $${m.costs.total.toFixed(2)}                  ║
║   Projected  : $${m.costs.projectedMonthly.toFixed(2)}/month ║
║                                                               ║
║ PROFILES                                                      ║
║   STRUCTURE  : ${m.requests.byProfile.get('STRUCTURE_LONGCTX' as Profile) || 0} calls, $${(m.costs.byProfile.get('STRUCTURE_LONGCTX' as Profile) || 0).toFixed(2)} ║
║   FAST_ITER  : ${m.requests.byProfile.get('FAST_ITERATE' as Profile) || 0} calls, $${(m.costs.byProfile.get('FAST_ITERATE' as Profile) || 0).toFixed(2)} ║
║   JUDGE      : ${m.requests.byProfile.get('JUDGE_SCORER' as Profile) || 0} calls, $${(m.costs.byProfile.get('JUDGE_SCORER' as Profile) || 0).toFixed(2)} ║
║                                                               ║
║ ALERTS                                                        ║
${this.formatAlerts()}
╚════════════════════════════════════════════════════════════╝`;
  }

  private getProviderStatus(provider: string): string {
    const lat = this.getProviderLatency(provider);
    const errors = this.metrics.errors.byType.get(provider) || 0;
    const apiKeyPresent = !!this.readEnvKeyForProvider(provider);
    if (!apiKeyPresent) return '✗ No API Key     ';
    if (errors > 5) return `⚠ ${errors} errors      `;
    if (lat > 1000) return `⚠ Slow (${lat}ms)`;
    return `✓ OK (${lat}ms)    `;
  }

  private formatAlerts(): string {
    const alerts = this.getAlerts();
    if (alerts.length === 0) return '║   ✓ No alerts                                                ║';
    return alerts
      .slice(0, 3)
      .map((a) => `║   ${a.severity === 'critical' ? '🔴' : '⚠️'} ${a.message.padEnd(57)} ║`)
      .join('\n');
  }

  getHealthScore(): number {
    let score = 100;
    const failed = this.metrics.requests.failed;
    const total = Math.max(1, this.metrics.requests.total);
    const errorRate = failed / total;
    score -= errorRate * 50;
    if (this.metrics.performance.p95 > 2000) score -= 10;
    if (this.metrics.performance.p99 > 5000) score -= 10;
    if (this.metrics.cache.hitRate < 0.1) score -= 10;
    const hourlyRate = this.getHourlyRate();
    if (hourlyRate > 5) score -= 20;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  getAlerts(): Alert[] {
    const alerts: Alert[] = [];
    if (this.metrics.requests.failed > 10) {
      alerts.push({ severity: 'critical', message: `High failure rate: ${this.metrics.requests.failed} failed requests`, timestamp: new Date() });
    }
    const hourlyRate = this.getHourlyRate();
    if (hourlyRate > 10) alerts.push({ severity: 'critical', message: `High cost rate: $${hourlyRate.toFixed(2)}/hour`, timestamp: new Date() });
    if (this.metrics.performance.p95 > 5000) alerts.push({ severity: 'warning', message: `Slow responses: P95=${this.metrics.performance.p95}ms`, timestamp: new Date() });
    for (const [provider, errors] of this.metrics.errors.byType) {
      if (errors > 5) alerts.push({ severity: 'warning', message: `${provider}: ${errors} errors`, timestamp: new Date() });
    }
    return alerts.sort((a, b) => (a.severity === 'critical' ? -1 : b.severity === 'critical' ? 1 : 0));
  }

  // --- Helpers -----------------------------------------------------------
  private recomputeLatencyStats(): void {
    const arr = this.recentLatencies.slice().sort((a, b) => a - b);
    const pick = (q: number) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * (arr.length - 1)))] : 0);
  const p50 = Number(pick(0.5) || 0);
  const p95 = Number(pick(0.95) || 0);
  const p99 = Number(pick(0.99) || 0);
  const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    // slowest operation by average
    let slowOp = '';
    let slowAvg = -1;
    for (const [op, list] of this.latenciesByOperation) {
      const a = list.length ? list.reduce((x, y) => x + y, 0) / list.length : 0;
      if (a > slowAvg) { slowAvg = a; slowOp = op; }
    }
    this.metrics.performance = { p50, p95, p99, avgLatency: avg, slowestOperation: slowOp };
  }

  private getProviderLatency(provider: string): number {
    const list = this.latenciesByProvider.get(provider) || [];
    if (!list.length) return this.metrics.performance.avgLatency || 0;
    return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  }

  private formatNumber(n: number): string { return n.toLocaleString(); }

  private refreshProjectedMonthly(): void {
    const hourly = this.getHourlyRate();
    this.metrics.costs.projectedMonthly = Math.round(hourly * 24 * 30 * 100) / 100;
  }

  private getHourlyRate(): number {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const recent = this.recentCosts.filter((c) => c.t >= hourAgo);
    const sum = recent.reduce((a, b) => a + b.cost, 0);
    return Math.round(sum * 100) / 100;
  }

  private readEnvKeyForProvider(provider: string): string | undefined {
    const env = (typeof process !== 'undefined' ? process.env : undefined) as Record<string, string | undefined> | undefined;
    if (!env) return undefined;
    if (provider === 'anthropic') return env.ANTHROPIC_API_KEY;
    if (provider === 'openai') return env.OPENAI_API_KEY;
    if (provider === 'google') return env.GOOGLE_API_KEY || env.GOOGLE_VERTEX_KEY;
    return undefined;
  }
}

export const globalLLMMonitor = new LLMMonitor();

export default LLMMonitor;
