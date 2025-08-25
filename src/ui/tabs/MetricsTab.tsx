import React from "react";
import type { OpeningAnalysis } from "@/stores/analysis.store";
import MetricPill from "@/ui/components/MetricPill";

export interface MetricsTabProps { analysis?: OpeningAnalysis; candidateId: string }

export default function MetricsTab({ analysis }: MetricsTabProps) {
  if (!analysis) return <div className="p-3 text-sm text-neutral-500">No analysis available.</div>;

  // In absence of full breakdowns, show core metrics and threshold hints
  const thresholds = { confidence: 0.7, spoilers: 1, burden: 0.3 };
  const confGood = analysis.confidence >= thresholds.confidence;
  const spoilersGood = analysis.spoilerCount <= thresholds.spoilers;
  const burdenGood = analysis.editBurdenPercent <= thresholds.burden;

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <MetricPill label="Confidence" value={analysis.confidence} type="percent" />
        <MetricPill label="Spoilers" value={analysis.spoilerCount} type="count" />
        <MetricPill label="Burden" value={analysis.editBurdenPercent} type="percent" />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="p-2 rounded border border-neutral-200 dark:border-neutral-800">
          <div className="font-semibold text-sm mb-1">Confidence</div>
          <div className={`text-sm ${confGood ? "text-green-700" : "text-amber-700"}`}>
            {Math.round(analysis.confidence * 100)}% vs ≥ {Math.round(thresholds.confidence * 100)}%
          </div>
        </div>
        <div className="p-2 rounded border border-neutral-200 dark:border-neutral-800">
          <div className="font-semibold text-sm mb-1">Spoilers</div>
          <div className={`text-sm ${spoilersGood ? "text-green-700" : "text-red-700"}`}>
            {analysis.spoilerCount} vs ≤ {thresholds.spoilers}
          </div>
        </div>
        <div className="p-2 rounded border border-neutral-200 dark:border-neutral-800">
          <div className="font-semibold text-sm mb-1">Edit Burden</div>
          <div className={`text-sm ${burdenGood ? "text-green-700" : "text-amber-700"}`}>
            {Math.round(analysis.editBurdenPercent * 100)}% vs ≤ {Math.round(thresholds.burden * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
