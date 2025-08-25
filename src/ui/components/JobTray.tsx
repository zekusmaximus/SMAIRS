import React, { useMemo, useState } from "react";
import { useJobProgress } from "@/hooks/useJobProgress";
import JobLogModal from "@/ui/modals/JobLogModal";
import { queueSize } from "@/lib/jobQueue";

// Simple global to track latest job id; in a real app, lift to a store.
let latestJobId: string | undefined;
export function setActiveJob(id?: string) { latestJobId = id; }

export default function JobTray() {
  const [open, setOpen] = useState(false);
  const jobId = latestJobId;
  const { status, progress, step, error, logs } = useJobProgress(jobId);
  const active = status === "running" || status === "queued" || status === "error";
  const count = useMemo(() => queueSize(), [status, progress]);

  if (!active) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40" role="region" aria-live="polite" aria-label="Background job status">
      <div className="mx-auto max-w-screen-2xl">
        <div className="m-2 p-2 rounded shadow bg-white/95 dark:bg-neutral-900/95 border border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
          <button className="text-sm px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800" onClick={()=> setOpen(true)} aria-haspopup="dialog" aria-controls="job-log-modal">
            View Log
          </button>
          <div className="flex-1">
            <div className="text-xs text-neutral-600">{error ? `Error: ${error}` : (step || "Working…")}</div>
            <div className="h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden mt-1 progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Job progress">
              <div className="h-full bg-blue-600 progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800" title="Jobs in queue">
            {count}
          </div>
        </div>
      </div>
      <JobLogModal open={open} onClose={()=> setOpen(false)} logs={logs} filterJobId={jobId} onClearCompleted={()=> {/* no-op placeholder */}} />
    </div>
  );
}
