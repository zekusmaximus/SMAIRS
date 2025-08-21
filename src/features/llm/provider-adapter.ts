import type { Profile, CallArgs, LLMResult } from './providers.js';
import { resolveProfile } from './providers.js';
import { PriorityQueue } from './request-queue.js';
import { UsageTracker } from './usage-tracker.js';
import { CostOptimizer } from './cost-optimizer.js';
import { PerformanceManager } from './performance-manager.js';

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
    this.configs.set('STRUCTURE_LONGCTX', { primary: 'STRUCTURE_LONGCTX', fallback: 'mock:*', maxRetries: 2, timeout: DEFAULT_TIMEOUT });
    this.configs.set('FAST_ITERATE', { primary: 'FAST_ITERATE', fallback: 'mock:*', maxRetries: 2, timeout: DEFAULT_TIMEOUT });
    this.configs.set('JUDGE_SCORER', { primary: 'JUDGE_SCORER', fallback: 'mock:*', maxRetries: 2, timeout: DEFAULT_TIMEOUT });
  }

  async executeWithFallback<T>(profile: Profile, request: CallArgs, options?: ExecutionOptions): Promise<LLMResult<T>> {
    const key = options?.dedupeKey || this.hashArgs(profile, request);
    if (this.inFlight.has(key)) return this.inFlight.get(key)! as Promise<LLMResult<T>>;
    const prom = new Promise<LLMResult<T>>((resolve, reject) => {
      const qr: QueuedRequest<T> = { id: key, profile, args: request, resolve, reject, priority: options?.priority ?? 5, timestamp: Date.now(), options };
      this.queue.push(qr as unknown as QueuedRequest<unknown>);
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
        this.handleItem(item).finally(() => { this.active--; this.processQueue(); });
      }
    } finally { this.processing = false; }
  }

  private async handleItem<T>(item: QueuedRequest<T>): Promise<void> {
    const cfg = this.configs.get(item.profile)!;
    const provider = resolveProfile(item.profile);
    const start = performance.now();
    let attempt = 0; let lastError: Error | undefined; let result: LLMResult<T> | undefined; let success = false;
    const inputTokens = Math.round(item.args.prompt.length / 4);
    const estCost = provider.estimateCost({ input: inputTokens, output: 200 });
    if (!this.usageTracker.isWithinBudget(item.profile, estCost)) {
      item.resolve(this.baseline(item.profile, item.args) as LLMResult<T>);
      return;
    }
    while (attempt <= cfg.maxRetries) {
      try {
        result = await this.runWithTimeout<T>(cfg.timeout, () => provider.call<T>({ ...item.args, profile: item.profile }));
        success = true; break;
      } catch (err) {
        lastError = err as Error;
        if (this.isRetryable(lastError) && attempt < cfg.maxRetries) { await backoff(attempt); attempt++; continue; }
        break;
      }
    }
    if (!success && cfg.fallback) {
      try {
        const fb = resolveProfile(item.profile); // placeholder for distinct fallback
        result = await this.runWithTimeout<T>(cfg.timeout, () => fb.call<T>({ ...item.args, profile: item.profile }));
        success = true;
      } catch (err) { lastError = err as Error; }
    }
    if (!success) result = this.baseline(item.profile, item.args) as LLMResult<T>;
    const duration = performance.now() - start;
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
async function backoff(attempt: number): Promise<void> { const base = 100 * Math.pow(2, attempt); const jitter = Math.random() * 50; return new Promise(r => setTimeout(r, base + jitter)); }
function fnv(str: string): string { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
function readEnv(name: string): string | undefined { const metaEnv = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string,string> }).env : undefined); return (metaEnv && metaEnv[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined); }
