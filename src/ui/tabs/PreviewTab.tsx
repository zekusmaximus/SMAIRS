import React, { useMemo, useState } from "react";
import type { OpeningAnalysis } from "@/stores/analysis.store";

export interface PreviewTabProps { analysis?: OpeningAnalysis; candidateId: string }

export default function PreviewTab({ analysis }: PreviewTabProps) {
  const [tracked, setTracked] = useState(false);

  const content = useMemo(() => {
    // Placeholder: synthesize preview text from rationale
    const base = analysis?.rationale || "Preview not available.";
    return tracked ? `${base}\n\n[tracked changes visible]` : base;
  }, [analysis, tracked]);

  const wc = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-600">Word count: {wc}</div>
        <label className="inline-flex items-center gap-1 text-sm">
          <input type="checkbox" checked={tracked} onChange={(e)=> setTracked(e.target.checked)} />
          Tracked changes
        </label>
      </div>
      <div className="p-3 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 whitespace-pre-wrap text-sm">
        {content}
      </div>
      <div className="flex justify-end">
        <button className="text-sm text-blue-600 hover:underline">Export Preview</button>
      </div>
    </div>
  );
}
