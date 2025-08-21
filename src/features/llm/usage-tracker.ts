import type { Profile } from './providers.js';

export interface UsageRecord {
  timestamp: number;
  profile: Profile;
  provider: string;
  tokens: { input: number; output: number };
  cost: number;
  duration: number; // ms
  success: boolean;
  error?: string;
}

export interface CostSummary {
  totalCost: number;
  byProfile: Record<string, number>;
  byProvider: Record<string, number>;
  successRate: number;
  totalRequests: number;
}

export interface UsageMetrics extends CostSummary {
  latency: { p50: number; p95: number; p99: number };
  reliabilityByProvider: Record<string, number>; // success rate
}

export class UsageTracker {
  private records: UsageRecord[] = [];
  private costLimits: Map<Profile, number> = new Map();
  private windowSize = 60 * 60 * 1000; // 1h

  track(record: Omit<UsageRecord, 'timestamp'>): void {
    const full: UsageRecord = { ...record, timestamp: Date.now() };
    this.records.push(full);
    this.gc();
  }

  setBudget(profile: Profile, usdPerHour: number): void { this.costLimits.set(profile, usdPerHour); }

  private gc(): void {
    const cutoff = Date.now() - this.windowSize;
    if (this.records.length > 10_000) this.records = this.records.filter(r => r.timestamp >= cutoff);
  }

  getCostSummary(profile?: Profile): CostSummary {
    const cutoff = Date.now() - this.windowSize;
    const recent = this.records.filter(r => r.timestamp >= cutoff && (!profile || r.profile === profile));
    const byProfile: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    let totalCost = 0; let success = 0;
    for (const r of recent) {
      totalCost += r.cost;
      byProfile[r.profile] = (byProfile[r.profile] || 0) + r.cost;
      byProvider[r.provider] = (byProvider[r.provider] || 0) + r.cost;
      if (r.success) success++;
    }
    return { totalCost, byProfile, byProvider, successRate: recent.length ? success / recent.length : 1, totalRequests: recent.length };
  }

  isWithinBudget(profile: Profile, estimatedCost: number): boolean {
    const limit = this.costLimits.get(profile);
    if (!limit) return true;
    const { byProfile } = this.getCostSummary(profile);
    const current = byProfile[profile] || 0;
    return current + estimatedCost <= limit;
  }

  exportMetrics(): UsageMetrics {
    const cutoff = Date.now() - this.windowSize;
    const recent = this.records.filter(r => r.timestamp >= cutoff);
    const latencies = recent.map(r => r.duration).sort((a, b) => a - b);
    const pct = (p: number) => {
      if (!latencies.length) return 0;
      const idx = Math.min(latencies.length - 1, Math.max(0, Math.floor(p * (latencies.length - 1))));
      return latencies[idx] ?? 0;
    };
    const reliabilityByProvider: Record<string, number> = {};
    const providerTotals: Record<string, { ok: number; total: number }> = {};
    for (const r of recent) {
      if (!providerTotals[r.provider]) providerTotals[r.provider] = { ok: 0, total: 0 };
      const bucket = providerTotals[r.provider]!;
      bucket.total++;
      if (r.success) bucket.ok++;
    }
    for (const k of Object.keys(providerTotals)) {
      const v = providerTotals[k]!; reliabilityByProvider[k] = v.ok / v.total;
    }
    const cost = this.getCostSummary();
    return { ...cost, latency: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) }, reliabilityByProvider };
  }

  getHourlyCost(): number { return this.getCostSummary().totalCost; }
}
