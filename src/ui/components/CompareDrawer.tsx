import React, { useMemo } from "react";
import useCompare from "@/hooks/useCompare";
import MetricPill from "@/ui/components/MetricPill";

export default function CompareDrawer() {
  const { pinnedCandidates, pinnedAnalyses, unpin } = useCompare();
  const open = pinnedCandidates.length >= 2;

  const rows = useMemo(() => {
    return pinnedCandidates.map((c) => {
      const a = pinnedAnalyses.find((x) => x.candidateId === c.id);
      return {
        id: c.id,
        hook: 0, // placeholder; use analysis scores when available
        spoilers: a ? a.spoilerCount : 0,
        burden: a ? a.editBurdenPercent : 0,
        confidence: a ? a.confidence : 0,
      };
    });
  }, [pinnedAnalyses, pinnedCandidates]);

  const maxConf = Math.max(0, ...rows.map((r) => r.confidence));

  return (
    <div className={`compare-drawer-ui ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-inner animate-slide-up">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-sm">Compare ({rows.length})</div>
          <div className="text-[10px] text-neutral-500">Pin 2–4 candidates to compare</div>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, rows.length)}, minmax(0, 1fr))` }}>
          {rows.map((r) => (
            <div key={r.id} className="p-2 rounded border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60">
              <div className="flex items-center justify-between">
                <div className="font-medium text-xs truncate" title={r.id}>{r.id}</div>
                <button className="text-[10px] text-red-600 hover:underline" onClick={() => unpin(r.id)}>Unpin</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 items-center">
                <MetricPill label="Hook" value={r.hook} type="score" />
                <MetricPill label="Spoilers" value={r.spoilers} type="count" />
                <MetricPill label="Burden" value={r.burden} type="count" />
                <MetricPill label="Confidence" value={r.confidence} type="percent" />
                {maxConf > 0 ? (
                  <span className="text-[10px] ml-2 px-1 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                    Δ{Math.round((r.confidence - maxConf) * 100)}%
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
