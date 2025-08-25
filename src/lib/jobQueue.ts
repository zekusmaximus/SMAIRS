import { emitJobEvent } from "@/lib/events";

export type JobFn<T = unknown> = () => Promise<T> | T;

export interface JobOptions {
  id?: string; // if omitted, computed from hash
  hash?: string; // used for deduplication
  retries?: number;
  backoffMs?: number; // initial backoff
  maxConcurrent?: number; // override global
}

export interface EnqueuedJob<T = unknown> {
  id: string;
  hash: string;
  run: JobFn<T>;
  retries: number;
  backoffMs: number;
}

const DEFAULT_CONCURRENCY = 2;
let maxConcurrent = DEFAULT_CONCURRENCY;
let activeCount = 0;
const queue: EnqueuedJob[] = [];
const inFlightByHash = new Set<string>();

export function setMaxConcurrent(n: number) {
  maxConcurrent = Math.max(1, Math.floor(n));
}

function simpleHash(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function queueSize() {
  return queue.length + activeCount;
}

async function processQueue() {
  while (activeCount < maxConcurrent && queue.length > 0) {
    const job = queue.shift()!;
    activeCount++;
    runJob(job)
      .finally(() => {
        activeCount--;
        inFlightByHash.delete(job.hash);
        void processQueue();
      });
  }
}

async function runJob(job: EnqueuedJob) {
  const { id } = job;
  await emitJobEvent(id, "log", { id, message: "Job started" });
  try {
    const result = await job.run();
    await emitJobEvent(id, "progress", { id, percent: 100, step: "complete" });
    await emitJobEvent(id, "done", { id, result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (job.retries > 0) {
      await emitJobEvent(id, "log", { id, level: "warn", message: `Retrying after error: ${msg}` });
      const delay = job.backoffMs;
      await new Promise((r) => setTimeout(r, delay));
      queue.unshift({ ...job, retries: job.retries - 1, backoffMs: Math.floor(delay * 2) });
      await processQueue();
      return;
    }
    await emitJobEvent(id, "error", { id, error: msg });
  }
}

export function enqueue<T = unknown>(run: JobFn<T>, opts: JobOptions = {}): string {
  const hash = opts.hash ?? simpleHash(String(run));
  if (inFlightByHash.has(hash)) {
    // Already enqueued or running; do not duplicate.
    return opts.id ?? hash;
  }
  const id = opts.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const job: EnqueuedJob<T> = {
    id,
    hash,
    run,
    retries: opts.retries ?? 2,
    backoffMs: opts.backoffMs ?? 500,
  };
  queue.push(job);
  inFlightByHash.add(hash);
  void processQueue();
  return id;
}
