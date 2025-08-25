import React from "react";
import type { OpeningCandidate, OpeningAnalysis } from "@/stores/analysis.store";
import MetricPill from "@/ui/components/MetricPill";
import { useAnalysisStore } from "@/stores/analysis.store";
import useCompare from "@/hooks/useCompare";

export interface CandidateCardProps {
  candidate: OpeningCandidate;
  analysis?: OpeningAnalysis;
  status?: "Ready" | "Analyzing" | "Error";
}

function StatusBadge({ status = "Ready" }: { status?: "Ready" | "Analyzing" | "Error" }) {
  const map: Record<string, string> = {
    Ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    Analyzing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    Error: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${map[status]}`}>{status}</span>;
}

export default function CandidateCard({ candidate, analysis, status = "Ready" }: CandidateCardProps) {
  const { selectCandidate } = useAnalysisStore();
  const { isPinned, canPin, pinToggle } = useCompare();
  const pinned = isPinned(candidate.id);

  const onPin = () => {
    const res = pinToggle(candidate.id);
    if (!res.ok && res.reason === "limit") {
      // TODO: toast
      console.warn("Max 4 items pinned");
    }
  };

  const metrics = {
    hook: 0, // unknown in placeholder generated types, keep neutral
    spoilers: analysis ? analysis.spoilerCount : 0,
    burden: analysis ? analysis.editBurdenPercent : 0,
    confidence: analysis ? analysis.confidence : 0,
  };

  const rationale = analysis?.rationale || "Candidate";

  return (
    <div className="card hover:card-hover animate-card-entry" title={rationale}
      onClick={() => selectCandidate(candidate.id)}
      role="button" aria-label={`Candidate ${candidate.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-sm truncate">{candidate.id}</div>
        <StatusBadge status={status} />
      </div>
  <div className="mt-2 text-xs text-neutral-500 truncate">Scenes: {candidate.sceneIds?.join(", ")}</div>

      <div className="mt-3 flex flex-wrap gap-1 items-center">
        <MetricPill label="Hook" value={metrics.hook} type="score" />
        <span className="text-[10px] opacity-60">·</span>
        <MetricPill label="Spoilers" value={metrics.spoilers} type="count" />
        <span className="text-[10px] opacity-60">·</span>
        <MetricPill label="Burden" value={metrics.burden} type="count" />
        <span className="text-[10px] opacity-60">·</span>
        <MetricPill label="Confidence" value={metrics.confidence} type="percent" />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <label className="inline-flex items-center gap-1 cursor-pointer select-none pin-checkbox">
          <input
            type="checkbox"
            checked={pinned}
            onChange={onPin}
            onClick={(e) => e.stopPropagation()}
            disabled={!pinned && !canPin}
          />
          <span className="text-xs">Pin for compare</span>
        </label>
        <button className="text-xs text-blue-600 hover:underline" onClick={(e)=>{e.stopPropagation(); selectCandidate(candidate.id);}}>Analyze</button>
      </div>
    </div>
  );
}
