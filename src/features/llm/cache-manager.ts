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

  async getOrCompute<T>(key: string, compute: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();
    if (entry) {
      entry.hits++;
      if (now < entry.staleAfter) return entry.value; // fresh
      if (now < entry.revalidateAfter) { this.revalidateAsync(key, compute, options).catch(() => {}); return entry.value; }
      // fully expired -> fall through to compute synchronously
    }
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
    const maxAge = options?.maxAgeMs ?? 60 * 60 * 1000;
    const staleAfter = now + (options?.staleAfterMs ?? maxAge);
    const revalidateAfter = staleAfter + (options?.revalidateAfterMs ?? Math.min(maxAge / 2, 10 * 60_000));
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
}

export const globalLLMCache = new CacheManager();
