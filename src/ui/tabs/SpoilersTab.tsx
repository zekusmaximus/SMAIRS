import React, { useMemo, useState } from "react";
import type { OpeningAnalysis } from "@/stores/analysis.store";

export interface SpoilersTabProps { analysis?: OpeningAnalysis; candidateId: string }

type WonTFix = { id: string; reason?: string };

export default function SpoilersTab({ analysis }: SpoilersTabProps) {
  // Placeholder grouping: we only have spoilerCount; real data would include violations
  const [wontFix, setWontFix] = useState<Record<string, WonTFix>>({});

  if (!analysis) return <div className="p-3 text-sm text-neutral-500">No spoiler details available.</div>;

  const items = useMemo(() => {
    // synthesize N items from count
    return Array.from({ length: analysis.spoilerCount }).map((_, i) => ({
      id: `${analysis.id}-spoiler-${i + 1}`,
      reveal: `Reveal ${i + 1}`,
      impact: Math.round(((i + 1) / Math.max(1, analysis.spoilerCount)) * 100) / 100,
      quote: "…quoted passage around the spoiler…",
    }));
  }, [analysis]);

  const applyToPreview = (id: string) => {
    console.log("apply fix to preview", id);
  };

  return (
    <div className="p-3 space-y-3">
      {items.length === 0 ? (
        <div className="text-sm text-neutral-500">No spoilers detected.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="p-2 rounded border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{it.reveal}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Impact {Math.round(it.impact*100)}%</span>
                  <button className="text-xs text-blue-600 hover:underline" onClick={()=>applyToPreview(it.id)}>Apply to Preview</button>
                </div>
              </div>
              <blockquote className="mt-1 text-xs text-neutral-600 italic">{it.quote}</blockquote>
              <div className="mt-2 flex items-center gap-2">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(wontFix[it.id])}
                    onChange={(e)=>{
                      if (e.target.checked) setWontFix({ ...wontFix, [it.id]: { id: it.id } });
                      else {
                        const next = { ...wontFix };
                        delete next[it.id];
                        setWontFix(next);
                      }
                    }}
                  />
                  <span className="text-xs">Won't Fix</span>
                </label>
                {wontFix[it.id] ? (
                  <input
                    className="flex-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-xs"
                    placeholder="Reason (optional)"
                    value={wontFix[it.id]?.reason || ""}
                    onChange={(e)=> setWontFix({ ...wontFix, [it.id]: { id: it.id, reason: e.target.value } })}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
