/* Lightweight performance metrics and budgets utility. */
import { nanoid } from "../lib/nanoid-fallback";

type NumericBudget = { limit: number; warnOnly?: boolean };
export type BudgetConfig = Record<string, NumericBudget>;

type MetricEntry = {
  id: string;
  name: string;
  value: number;
  unit?: string;
  ts: number;
  meta?: Record<string, unknown>;
};

const defaultBudgets: BudgetConfig = {
  "first-render-ms": { limit: 1000 },
  "idle-memory-mb": { limit: 200 },
  "scroll-jank-ms": { limit: 16 }, // 60fps budget (per frame)
};

let budgets: BudgetConfig = { ...defaultBudgets };
export function setBudgets(b: BudgetConfig) {
  budgets = { ...budgets, ...b };
}

export function now() {
  return (typeof performance !== "undefined" ? performance.now() : Date.now());
}

const startMarks = new Map<string, number>();
export function markStart(name: string) {
  startMarks.set(name, now());
}

export function markEnd(name: string, meta?: Record<string, unknown>) {
  const s = startMarks.get(name);
  if (s == null) return 0;
  const v = now() - s;
  record(name, v, "ms", meta);
  startMarks.delete(name);
  return v;
}

export async function measure<T>(name: string, fn: () => Promise<T> | T, meta?: Record<string, unknown>) {
  markStart(name);
  try {
    const r = await fn();
    markEnd(name, meta);
    return r;
  } catch (e) {
    markEnd(name, { ...meta, error: String(e) });
    throw e;
  }
}

// Telemetry buffer and periodic flush
const buffer: MetricEntry[] = [];
let flushTimer: number | null = null;

export function record(name: string, value: number, unit?: string, meta?: Record<string, unknown>) {
  const entry: MetricEntry = { id: nanoid(), name, value, unit, ts: Date.now(), meta };
  buffer.push(entry);
  maybeWarn(name, value, unit, meta);
  scheduleFlush();
}

function maybeWarn(name: string, value: number, unit?: string, meta?: Record<string, unknown>) {
  const b = budgets[name];
  if (!b) return;
  if (value > b.limit) {
    const msg = `[PerfBudget] ${name}=${value}${unit || ""} exceeds ${b.limit}${unit || ""}`;
    if (b.warnOnly) console.warn(msg, meta || "");
    else console.warn(msg, meta || "");
  }
}

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = (typeof window !== "undefined" ? window.setTimeout : setTimeout)(async () => {
    flushTimer = null;
    await flushToDisk();
  }, 2000) as unknown as number;
}

async function flushToDisk() {
  if (buffer.length === 0) return;
  const entries = buffer.splice(0, buffer.length);
  const text = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  // Try Tauri fs first
  try {
    const api = await import("@tauri-apps/api");
    interface TauriFs {
      writeTextFile: (file: unknown, opts?: unknown) => Promise<void>;
      BaseDirectory: { AppData: unknown };
      createDir: (path: string, opts?: unknown) => Promise<void>;
    }
    const maybeFs: unknown = (api as unknown as { fs?: unknown }).fs;
    const fsApi = (maybeFs && typeof maybeFs === "object" ? (maybeFs as TauriFs) : undefined);
    if (fsApi && typeof fsApi.writeTextFile === "function") {
      try {
        await fsApi.createDir(".smairs", { dir: fsApi.BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // directory may already exist; log at debug level
        console.debug("metrics: createDir issue", e);
      }
      await fsApi.writeTextFile({ contents: text, path: ".smairs/perf.log" }, { dir: fsApi.BaseDirectory.AppData });
      return;
    }
  } catch (e) {
    // not in Tauri or API unavailable
    console.debug("metrics: tauri fs not available", e);
  }
  // Node fallback (dev/test)
  try {
    const fs = await import("fs");
    const p = ".smairs/perf.log";
    try { fs.mkdirSync(".smairs", { recursive: true }); } catch (e) { console.debug("metrics: mkdir issue", e); }
    fs.appendFileSync(p, text);
  } catch (e) {
    // last resort: console
    console.debug("[PerfTelemetry]", text, e);
  }
}

// Frame budget helper: call during scroll handlers or RAF to track jank.
let lastFrame = 0;
export function trackFrame() {
  const t = now();
  if (lastFrame) {
    const delta = t - lastFrame;
    record("scroll-jank-ms", delta, "ms");
  }
  lastFrame = t;
}

// Memory snapshot, browser-only (approximate)
export function snapshotMemory() {
  const w = typeof window !== "undefined" ? (window as unknown as { performance?: { memory?: { usedJSHeapSize?: number } } }) : undefined;
  const mem = w?.performance?.memory;
  if (mem && typeof mem.usedJSHeapSize === "number") {
    const mb = mem.usedJSHeapSize / (1024 * 1024);
    record("idle-memory-mb", Math.round(mb * 10) / 10, "MB");
  }
}
