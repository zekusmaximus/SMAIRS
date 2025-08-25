import { useCallback, useMemo, useState } from "react";
import { useJobEvent, type JobErrorPayload, type JobLogPayload, type JobProgressPayload } from "@/lib/events";

export type JobStatus = "idle" | "queued" | "running" | "error" | "done";

export interface JobLogEntry extends JobLogPayload {
  timestamp: number; // ensure filled
}

export interface UseJobProgress {
  status: JobStatus;
  progress: number; // 0..100
  step?: string;
  error?: string;
  logs: JobLogEntry[];
  clear: () => void;
}

export function useJobProgress(jobId?: string): UseJobProgress {
  const [status, setStatus] = useState<JobStatus>(jobId ? "queued" : "idle");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [logs, setLogs] = useState<JobLogEntry[]>([]);

  const clear = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setStep(undefined);
    setError(undefined);
    setLogs([]);
  }, []);

  useJobEvent(jobId, "progress", (p: JobProgressPayload) => {
    setStatus("running");
    setProgress(Math.max(0, Math.min(100, p.percent ?? 0)));
    setStep(p.step);
  });

  useJobEvent(jobId, "log", (l: JobLogPayload) => {
    setLogs((prev) => [
      ...prev,
      { ...l, timestamp: l.timestamp ?? Date.now() },
    ]);
  });

  useJobEvent(jobId, "error", (e: JobErrorPayload) => {
    setStatus("error");
    setError(e.error);
  });

  useJobEvent(jobId, "done", () => {
    setStatus("done");
    setProgress(100);
  });

  return useMemo(() => ({ status, progress, step, error, logs, clear }), [status, progress, step, error, logs, clear]);
}
