import React, { useMemo, useRef } from "react";
import type { JobLogPayload } from "@/lib/events";

export interface JobLogModalProps {
  open: boolean;
  onClose: () => void;
  logs: (JobLogPayload & { timestamp: number })[];
  filterJobId?: string;
  onClearCompleted?: () => void;
}

export default function JobLogModal({ open, onClose, logs, filterJobId, onClearCompleted }: JobLogModalProps) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const filtered = useMemo(() => logs.filter(l => !filterJobId || l.id === filterJobId), [logs, filterJobId]);

  const copy = async () => {
    const text = filtered.map(l => {
      const ts = new Date(l.timestamp).toISOString();
      const level = l.level?.toUpperCase() ?? "INFO";
      return `[${ts}] [${level}] (${l.id}) ${l.message}`;
    }).join("\n");
    try { await navigator.clipboard.writeText(text); } catch (e) {
      // ignore clipboard errors in environments without permissions
      console.debug('Copy failed', e);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="job-log-title" id="job-log-modal" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 w-full md:w-[800px] max-h-[80vh] rounded-t md:rounded shadow-xl" onClick={(e)=> e.stopPropagation()}>
        <header className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div id="job-log-title" className="font-semibold">Job Logs {filterJobId ? `(Job ${filterJobId})` : ''}</div>
          <div className="flex items-center gap-2">
            <button className="text-sm text-blue-600" onClick={copy}>Copy</button>
            {onClearCompleted ? (<button className="text-sm text-amber-600" onClick={onClearCompleted}>Clear Completed</button>) : null}
            <button className="text-sm" onClick={onClose} aria-label="Close job log dialog">Close</button>
          </div>
        </header>
        <div ref={areaRef} className="p-3 overflow-auto max-h-[70vh] text-sm font-mono whitespace-pre-wrap">
          {filtered.length === 0 ? (
            <div className="text-neutral-500">No logs.</div>
          ) : (
            filtered.map((l, idx) => (
              <div key={idx} className="py-1">
                <span className="text-neutral-500">[{new Date(l.timestamp).toLocaleTimeString()}]</span>{' '}
                <span className={l.level === 'error' ? 'text-red-600' : l.level === 'warn' ? 'text-amber-600' : 'text-neutral-700'}>
                  {l.level?.toUpperCase() ?? 'INFO'}
                </span>{' '}
                <span className="text-neutral-500">(job {l.id})</span>{' '}
                <span>{l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
