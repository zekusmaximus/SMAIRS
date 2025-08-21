import type { Profile, CallArgs, LLMResult } from './providers.js';
import { resolveProfile, getFallbackModelId } from './providers.js';
import { PriorityQueue } from './request-queue.js';
import { UsageTracker } from './usage-tracker.js';
import { CostOptimizer } from './cost-optimizer.js';
import { PerformanceManager } from './performance-manager.js';
import { ProviderFactory } from './provider-factory.js';

export interface ProviderConfig { primary: string; fallback?: string; maxRetries: number; timeout: number; }
export interface ExecutionOptions { priority?: number; dedupeKey?: string; }
export type BatchOptions = ExecutionOptions;

interface QueuedRequest<T> { id: string; profile: Profile; args: CallArgs; resolve: (r: LLMResult<T>) => void; reject: (e: Error) => void; priority: number; timestamp: number; options?: ExecutionOptions; }

const DEFAULT_TIMEOUT = Number(readEnv('LLM_TIMEOUT_MS') || 30_000);

export class ProviderAdapter {
  private configs: Map<Profile, ProviderConfig> = new Map();
  private queue: PriorityQueue<QueuedRequest<unknown>>;
  private active = 0;
  private usageTracker: UsageTracker;
  private costOptimizer: CostOptimizer;
  private performance: PerformanceManager;
  private processing = false;
  private inFlight: Map<string, Promise<LLMResult<unknown>>> = new Map();

  constructor() {
    this.initializeConfigs();
    this.queue = new PriorityQueue((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);
    this.usageTracker = new UsageTracker();
    this.costOptimizer = new CostOptimizer();
    this.performance = new PerformanceManager();
  }

  private initializeConfigs() {
    // Read dynamic profile configs (primary + fallback model IDs)
    const profiles: Profile[] = ['STRUCTURE_LONGCTX', 'FAST_ITERATE', 'JUDGE_SCORER'];
    for (const p of profiles) {
      this.configs.set(p, this.getProfileConfig(p));
    }
  }

  private getProfileConfig(profile: Profile): ProviderConfig {
    const maxRetries = Number(readEnv('LLM_RETRIES') || 2);
    const timeout = Number(readEnv('LLM_TIMEOUT_MS') || DEFAULT_TIMEOUT);
    const fallback = getFallbackModelId(profile);
    // Primary model from providers resolver env mapping via resolveProfile side; but we keep string for logging
    const primaryModel = currentProfileModel()[profile];
    return { primary: primaryModel, fallback, maxRetries, timeout };
  }

  async executeWithFallback<T>(profile: Profile, request: CallArgs, options?: ExecutionOptions): Promise<LLMResult<T>> {
    const key = options?.dedupeKey || this.hashArgs(profile, request);
    if (this.inFlight.has(key)) return this.inFlight.get(key)! as Promise<LLMResult<T>>;
    const prom = new Promise<LLMResult<T>>((resolve, reject) => {
      const qr: QueuedRequest<T> = { id: key, profile, args: request, resolve, reject, priority: options?.priority ?? 5, timestamp: Date.now(), options };
      this.queue.push(qr as unknown as QueuedRequest<unknown>);
  logDebug('queue:enqueue', { depth: this.queue.size(), key, profile, priority: qr.priority });
      this.processQueue();
    });
    this.inFlight.set(key, prom as Promise<LLMResult<unknown>>);
    prom.finally(() => this.inFlight.delete(key));
    return prom;
  }

  async executeBatch<T>(profile: Profile, requests: CallArgs[]): Promise<LLMResult<T>[]> {
  const provider = resolveProfile(profile);
    const optimized: CallArgs[] = [];
    for (const r of requests) optimized.push((await this.costOptimizer.optimizeRequest(profile, r)).args);
    const start = performance.now();
    const res = await this.performance.monitorExecution(profile, () => provider.callBatch<T>(optimized));
    const duration = performance.now() - start;
    res.forEach(r => this.usageTracker.track({ profile, provider: provider.constructor.name, tokens: { input: r.usage.in, output: r.usage.out }, cost: provider.estimateCost({ input: r.usage.in, output: r.usage.out }), duration, success: true }));
    return res;
  }

  private async processQueue(): Promise<void> {
  if (this.processing) return; this.processing = true;
    try {
      while (this.active < getMaxConcurrent() && this.queue.size()) {
        const item = this.queue.pop();
        if (!item) break;
        this.active++;
    logDebug('queue:dequeue', { depth: this.queue.size(), active: this.active });
        this.handleItem(item).finally(() => { this.active--; this.processQueue(); });
      }
    } finally { this.processing = false; }
  }

  private async handleItem<T>(item: QueuedRequest<T>): Promise<void> {
    const cfg = this.configs.get(item.profile)!;
  const provider = ProviderFactory.create(cfg.primary);
    const start = performance.now();
    let attempt = 0; let lastError: Error | undefined; let result: LLMResult<T> | undefined; let success = false;
    const inputTokens = Math.round(item.args.prompt.length / 4);
    const estCost = provider.estimateCost({ input: inputTokens, output: 200 });
    if (!this.usageTracker.isWithinBudget(item.profile, estCost)) {
      logDebug('budget:violation', { profile: item.profile, estimatedCost: estCost });
      item.resolve(this.baseline(item.profile, item.args) as LLMResult<T>);
      return;
    }
  while (attempt <= cfg.maxRetries) {
      try {
    logDebug('request:attempt', { profile: item.profile, attempt, model: cfg.primary });
    result = await this.runWithTimeout<T>(cfg.timeout, () => this.performance.monitorExecution(item.profile, () => provider.call<T>({ ...item.args, profile: item.profile })));
        success = true; break;
      } catch (err) {
        lastError = err as Error;
    if (this.isRetryable(lastError) && attempt < cfg.maxRetries) { const delay = await backoff(attempt); logDebug('request:retry', { profile: item.profile, attempt, delay, error: lastError.message }); attempt++; continue; }
        break;
      }
    }
  if (!success && cfg.fallback) {
      try {
    logDebug('fallback:switch', { profile: item.profile, from: cfg.primary, to: cfg.fallback, reason: lastError?.message });
    const fbProvider = ProviderFactory.create(cfg.fallback);
    result = await this.runWithTimeout<T>(cfg.timeout, () => this.performance.monitorExecution(item.profile, () => fbProvider.call<T>({ ...item.args, profile: item.profile })));
        success = true;
      } catch (err) { lastError = err as Error; }
    }
    if (!success) result = this.baseline(item.profile, item.args) as LLMResult<T>;
    const duration = performance.now() - start;
  const perfStatus = this.performance.checkBudget(item.profile);
  if (!perfStatus.within) logDebug('perf:latency_violation', { profile: item.profile, latency: perfStatus.latency, target: perfStatus.target, degraded: perfStatus.degradedMode });
  if (!success) logDebug('budget:violation', { profile: item.profile, error: lastError?.message });
    this.usageTracker.track({ profile: item.profile, provider: success ? cfg.primary : 'baseline', tokens: { input: inputTokens, output: result!.usage.out }, cost: provider.estimateCost({ input: result!.usage.in, output: result!.usage.out }), duration, success, error: lastError?.message });
    item.resolve(result!);
  }

  private baseline(profile: Profile, args: CallArgs): LLMResult<unknown> { return { text: `[baseline:${profile}] ${args.prompt.slice(0, 40)}`, usage: { in: Math.round(args.prompt.length / 4), out: 5 }, raw: { baseline: true } }; }
  private async runWithTimeout<T>(ms: number, fn: () => Promise<LLMResult<T>>): Promise<LLMResult<T>> { return await Promise.race([fn(), new Promise<LLMResult<T>>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
  private isRetryable(err: Error): boolean { return /timeout|rate|network/i.test(err.message); }
  private hashArgs(profile: Profile, args: CallArgs): string { return fnv(profile + '|' + JSON.stringify(args)); }
  get usage() { return this.usageTracker; }
  get perf() { return this.performance; }
}

export const globalProviderAdapter = new ProviderAdapter();

function getMaxConcurrent(): number { return Number(readEnv('MAX_CONCURRENT_LLM_CALLS') || 2); }
async function backoff(attempt: number): Promise<number> { const base = 100 * Math.pow(2, attempt); const jitter = Math.random() * 50; const delay = base + jitter; await new Promise(r => setTimeout(r, delay)); return delay; }
function fnv(str: string): string { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
function readEnv(name: string): string | undefined { const metaEnv = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string,string> }).env : undefined); return (metaEnv && metaEnv[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined); }
function logDebug(event: string, data: Record<string, unknown>) { const dbg = (readEnv('DEBUG') || '').toLowerCase(); if (dbg === '1' || dbg === 'true') { console.debug(`[llm:${event}]`, JSON.stringify(data)); } }
function currentProfileModel(): Record<Profile,string> { return { STRUCTURE_LONGCTX: readEnv('LLM_PROFILE__STRUCTURE') || 'anthropic:claude-4-sonnet', FAST_ITERATE: readEnv('LLM_PROFILE__FAST') || 'openai:gpt-5-mini', JUDGE_SCORER: readEnv('LLM_PROFILE__JUDGE') || 'google:gemini-2.5-pro' }; }
