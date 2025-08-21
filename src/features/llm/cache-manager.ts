/**
 * Simple in-memory cache manager with stale-while-revalidate semantics.
 * Keeps memory footprint small via Map + size bounding. (<<10MB target)
 */

export interface CacheOptions { maxAgeMs?: number; staleWhileRevalidateMs?: number; forceRefresh?: boolean; staleAfterMs?: number; revalidateAfterMs?: number; }

interface CacheEntry<T> { value: T; timestamp: number; hits: number; staleAfter: number; revalidateAfter: number; size: number; }

export class CacheManager {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private maxSize = 100; // entries
  private maxMemory = 10 * 1024 * 1024; // 10MB rough estimate
  private ttlMultiplier = 1.0;
  private hits = 0;
  private lookups = 0;

  async getOrCompute<T>(key: string, compute: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();
    if (entry) {
      this.lookups++;
      entry.hits++;
      if (now < entry.staleAfter) { this.hits++; return entry.value; } // fresh
      if (now < entry.revalidateAfter) { this.hits++; this.revalidateAsync(key, compute, options).catch(() => {}); return entry.value; }
      // fully expired -> fall through to compute synchronously
    }
    this.lookups++;
    const value = await compute();
    this.set(key, value, options);
    return value;
  }

  private async revalidateAsync<T>(key: string, compute: () => Promise<T>, options?: CacheOptions): Promise<void> {
    try {
      const value = await compute();
      this.set(key, value, options);
    } catch { /* keep old */ }
  }

  private set<T>(key: string, value: T, options?: CacheOptions): void {
    if (this.cache.size >= this.maxSize) this.evictLRU();
    while (this.totalMemory() > this.maxMemory) this.evictLRU();
    const now = Date.now();
  const baseMax = options?.maxAgeMs ?? 60 * 60 * 1000;
  const effective = Math.floor(baseMax * this.ttlMultiplier);
  const staleAfter = now + (options?.staleAfterMs ?? effective);
  const revalidateAfter = staleAfter + (options?.revalidateAfterMs ?? Math.min(effective / 2, 10 * 60_000));
    const size = this.estimateSize(value);
    this.cache.set(key, { value, timestamp: now, hits: 0, staleAfter, revalidateAfter, size });
  }

  generateCacheKey(profile: string, request: unknown): string {
    const stable = JSON.stringify(request, (_k, v) => (v instanceof Map ? Array.from(v.entries()) : v));
    let h = 2166136261 >>> 0; const str = profile + '|' + stable; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  private evictLRU(): void {
    let lruKey: string | undefined; let minHits = Infinity; let oldest = Infinity;
    for (const [k, v] of this.cache.entries()) {
      if (v.hits < minHits || (v.hits === minHits && v.timestamp < oldest)) { lruKey = k; minHits = v.hits; oldest = v.timestamp; }
    }
    if (lruKey) this.cache.delete(lruKey);
  }

  private estimateSize(value: unknown): number { try { return JSON.stringify(value).length; } catch { return 100; } }
  private totalMemory(): number { let sum = 0; for (const v of this.cache.values()) sum += v.size; return sum; }

  // --- Degraded mode TTL controls ------------------------------------
  extendTTLs(multiplier: number): void { this.ttlMultiplier = multiplier; this.log('info', 'Cache TTLs extended', { multiplier }); }
  restoreTTLs(): void { this.ttlMultiplier = 1.0; this.log('info', 'Cache TTLs restored to normal'); }
  getTTLMultiplier(): number { return this.ttlMultiplier; }

  // --- Metrics -------------------------------------------------------
  getHitRate(): number { return this.lookups ? this.hits / this.lookups : 1; }
  getSize(): number { return this.cache.size; }

  private log(level: 'info'|'warn'|'debug', msg: string, data?: unknown) {
    if ((level === 'debug' && (readEnv('DEBUG')||'').toLowerCase() !== 'true' && (readEnv('DEBUG')||'') !== '1')) return;
    console[level === 'debug' ? 'debug' : level](`[cache:${level}] ${msg}` + (data ? ' ' + JSON.stringify(data) : ''));
  }
}

export const globalLLMCache = new CacheManager();

function readEnv(name: string): string | undefined { // local helper
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}
