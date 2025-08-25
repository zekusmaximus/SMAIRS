// Typed event helpers for job progress/log/done/error with Tauri-aware fallback
import { useEffect } from "react";

export type JobEventType = "progress" | "log" | "done" | "error";

export interface JobProgressPayload {
  id: string;
  percent: number; // 0..100
  step?: string;
}

export interface JobLogPayload {
  id: string;
  level?: "info" | "warn" | "error";
  message: string;
  timestamp?: number;
}

export interface JobDonePayload<T = unknown> {
  id: string;
  result?: T;
}

export interface JobErrorPayload {
  id: string;
  error: string;
  code?: string;
  details?: unknown;
}

export type JobPayloadMap = {
  progress: JobProgressPayload;
  log: JobLogPayload;
  done: JobDonePayload;
  error: JobErrorPayload;
};

export const jobTopic = (id: string, type: JobEventType) => `job::${id}::${type}`;

type TauriEventApi = {
  emit: (topic: string, payload?: unknown) => Promise<void>;
  listen: (topic: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
};

async function withTauriEvent<T>(fn: (event: TauriEventApi) => Promise<T>): Promise<T | undefined> {
  const g = globalThis as Record<string, unknown>;
  const hasTauri = typeof g.__TAURI__ !== "undefined";
  if (!hasTauri) return undefined;
  try {
    const dynamicImport = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
    const mod = await dynamicImport("@tauri-apps/api/event") as { emit: TauriEventApi['emit']; listen: TauriEventApi['listen'] };
    return await fn(mod);
  } catch {
    return undefined;
  }
}

export async function emitJobEvent<K extends JobEventType>(id: string, type: K, payload: JobPayloadMap[K]): Promise<void> {
  const topic = jobTopic(id, type);
  const didTauri = await withTauriEvent(async (ev) => {
    await ev.emit(topic, payload);
    return true;
  });
  if (!didTauri && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(topic, { detail: payload }));
  }
}

export async function listenJobEvent<K extends JobEventType>(id: string, type: K, handler: (payload: JobPayloadMap[K]) => void): Promise<() => void> {
  const topic = jobTopic(id, type);
  const unlisten = await withTauriEvent(async (ev) => {
    const un = await ev.listen(topic, (e) => handler(e.payload as JobPayloadMap[K]));
    return () => un();
  });
  if (unlisten) return unlisten;
  const onWindow = (e: Event) => handler((e as CustomEvent).detail as JobPayloadMap[K]);
  if (typeof window !== "undefined") {
    window.addEventListener(topic, onWindow as EventListener);
    return () => window.removeEventListener(topic, onWindow as EventListener);
  }
  return () => {};
}

// React helper for auto-cleanup on unmount
export function useJobEvent<K extends JobEventType>(id: string | undefined, type: K, handler: (payload: JobPayloadMap[K]) => void) {
  useEffect(() => {
    if (!id) return;
    let active = true;
  let disposer: undefined | (() => void);
  listenJobEvent(id, type, (p: JobPayloadMap[K]) => active && handler(p)).then((un) => {
      disposer = un;
    });
    return () => {
      active = false;
      if (disposer) disposer();
    };
  }, [id, type, handler]);
}
