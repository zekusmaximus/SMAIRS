/**
 * Simple in-memory cache manager with stale-while-revalidate semantics.
 * Keeps memory footprint small via Map + size bounding. (<<10MB target)
 */

export interface CacheOptions {
  maxAgeMs?: number; // override default
  staleWhileRevalidateMs?: number; // allow stale serve window
  forceRefresh?: boolean;
}

interface CachedResult {
  value: unknown;
  created: number;
  refreshed: number;
  maxAge: number;
}

export class CacheManager {
  private cache = new Map<string, CachedResult>();
  private maxAge = 60 * 60 * 1000; // 1h
  private maxEntries = 200; // defensively bound

  async getOrCompute<T>(key: string, compute: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const now = Date.now();
    const entry = this.cache.get(key);
    const maxAge = options?.maxAgeMs ?? this.maxAge;
    const staleWindow = options?.staleWhileRevalidateMs ?? Math.min(maxAge / 2, 5 * 60_000);

    if (options?.forceRefresh) {
      const fresh = await compute();
      this.set(key, fresh, maxAge);
      return fresh;
    }

    if (entry) {
      const age = now - entry.created;
      if (age < maxAge) {
        // Fresh
        return entry.value as T;
      }
      if (age < maxAge + staleWindow) {
        // Serve stale & background refresh
        this.backgroundRefresh(key, compute, maxAge).catch(() => {});
        return entry.value as T;
      }
    }

    const val = await compute();
    this.set(key, val, maxAge);
    return val;
  }

  private set(key: string, value: unknown, maxAge: number) {
    if (this.cache.size >= this.maxEntries) {
      // simple LRU-ish eviction: remove oldest
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, v] of this.cache.entries()) {
        if (v.created < oldest) { oldest = v.created; oldestKey = k; }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, created: Date.now(), refreshed: Date.now(), maxAge });
  }

  private async backgroundRefresh<T>(key: string, compute: () => Promise<T>, maxAge: number) {
    try {
      const v = await compute();
      this.set(key, v, maxAge);
    } catch {
      // swallow
    }
  }

  generateCacheKey(profile: string, request: unknown): string {
    const stable = JSON.stringify(request, (_k, v) => (v instanceof Map ? Array.from(v.entries()) : v));
    // Lightweight hash (FNV-1a) to avoid importing crypto synchronously
    let h = 2166136261 >>> 0;
    const str = profile + '|' + stable;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
}

export const globalLLMCache = new CacheManager();
