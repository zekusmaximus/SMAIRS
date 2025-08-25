import React, { useMemo } from "react";
import type { OpeningAnalysis } from "@/stores/analysis.store";

export interface ContextTabProps { analysis?: OpeningAnalysis; candidateId: string }

export default function ContextTab({ analysis }: ContextTabProps) {
  if (!analysis) return <div className="p-3 text-sm text-neutral-500">No context gaps identified.</div>;

  const missing = useMemo(() => {
    // Synthesize 0-3 missing items from low confidence
    const n = analysis.confidence < 0.6 ? 3 : analysis.confidence < 0.75 ? 2 : analysis.confidence < 0.9 ? 1 : 0;
    return Array.from({ length: n }).map((_, i) => ({ id: `${analysis.id}-ctx-${i+1}`, text: `Missing context item ${i+1}` }));
  }, [analysis]);

  return (
    <div className="p-3 space-y-3">
      {missing.length ? (
        <div>
          <div className="font-semibold text-sm mb-1">Missing context</div>
          <ul className="space-y-2">
            {missing.map((m) => (
              <li key={m.id} className="p-2 rounded border border-neutral-200 dark:border-neutral-800">
                <div className="text-sm">{m.text}</div>
                <div className="mt-1 text-xs text-neutral-500">Suggested bridge: Provide a 2–3 sentence explanation with a character anchor.</div>
                <div className="mt-2 flex gap-2">
                  <button className="text-xs text-blue-600 hover:underline" onClick={()=>navigator.clipboard?.writeText(`Bridge for: ${m.text}`)}>Copy Suggestion</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-sm text-neutral-600">No missing context detected.</div>
      )}

      <div className="p-2 rounded border border-neutral-200 dark:border-neutral-800">
        <div className="font-semibold text-sm mb-1">Edit Burden</div>
        <div className="text-sm">Estimated effort: {Math.round((analysis.editBurdenPercent || 0) * 100)}%</div>
      </div>
    </div>
  );
}
