import { globalLLMCache } from "./cache-manager.js";

type PersistOptions = { ttlMs?: number; sizeLimitBytes?: number };

// Simple disk persistence using localStorage when in browser, and Node fs when available.
// Keys are namespaced; values compressed (JSON string) and truncated if over sizeLimitBytes.

const NS = ".smairs.llm";

export async function persistentGetOrCompute<T>(namespace: string, key: string, compute: () => Promise<T>, opts?: PersistOptions): Promise<T> {
  const full = `${NS}:${namespace}:${key}`;
  const now = Date.now();
  // Try disk first
  const stored = await readDisk(full);
  if (stored && (!stored.expiresAt || stored.expiresAt > now)) {
    return stored.value as T;
  }
  // Fall back to in-memory cache manager
  const memKey = `${namespace}:${key}`;
  const value = await globalLLMCache.getOrCompute<T>(memKey, compute, { maxAgeMs: opts?.ttlMs ?? 60 * 60 * 1000 });
  // Persist best-effort
  const size = byteLength(value);
  if (!opts?.sizeLimitBytes || size <= opts.sizeLimitBytes) {
    await writeDisk(full, { value, expiresAt: now + (opts?.ttlMs ?? 60 * 60 * 1000), size });
  }
  return value;
}

type DiskRecord<T = unknown> = { value: T; expiresAt?: number; size?: number };

async function readDisk<T>(key: string): Promise<DiskRecord<T> | null> {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as DiskRecord<T>;
    }
  } catch { /* ignore */ }
  // Node / Tauri backend: store under .smairs/cache.json lazily
  try {
    // dynamic import without bundler static resolution (Node/Tauri only)
    const g = globalThis as unknown as { require?: (m: string) => unknown };
    const req = (g.require as ((m: string) => unknown) | undefined) || (new Function("m", "return import(m)") as (m: string) => Promise<unknown>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs: any = await req("fs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const path: any = await req("path");
    const dir = path.join((typeof process !== "undefined" && (process as unknown as { cwd?: () => string }).cwd?.()) || ".", ".smairs");
    const file = path.join(dir, "cache.json");
    if (!fs.existsSync(file)) return null;
    const json = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, DiskRecord<T>>;
    return json[key] || null;
  } catch { return null; }
}

async function writeDisk<T>(key: string, rec: DiskRecord<T>): Promise<void> {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(rec));
      return;
    }
  } catch { /* ignore */ }
  try {
    const g = globalThis as unknown as { require?: (m: string) => unknown };
    const req = (g.require as ((m: string) => unknown) | undefined) || (new Function("m", "return import(m)") as (m: string) => Promise<unknown>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs: any = await req("fs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const path: any = await req("path");
    const dir = path.join((typeof process !== "undefined" && (process as unknown as { cwd?: () => string }).cwd?.()) || ".", ".smairs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "cache.json");
    let json: Record<string, DiskRecord<T>> = {};
    if (fs.existsSync(file)) {
      try { json = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { json = {}; }
    }
    json[key] = rec as DiskRecord<T>;
    fs.writeFileSync(file, JSON.stringify(json));
  } catch { /* ignore */ }
}

function byteLength(v: unknown): number {
  try {
    const str = JSON.stringify(v);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str).length;
    // Node fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as unknown as { Buffer?: unknown };
    if (g.Buffer && typeof g.Buffer.byteLength === "function") return g.Buffer.byteLength(str);
    return str.length;
  } catch { return 0; }
}
