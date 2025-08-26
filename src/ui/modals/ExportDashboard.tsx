import React from "react";
import { useAnalysisStore } from "@/stores/analysis.store";
import { ExportPanel } from "@/ui/panels/ExportPanel";

export default function ExportDashboard() {
  const { selectedCandidateId, analyses, candidates } = useAnalysisStore();
  const candidate = selectedCandidateId ? candidates[selectedCandidateId] : undefined;
  const analysis = selectedCandidateId ? analyses[selectedCandidateId] : undefined;

  return (
    <div className="p-4 w-[680px] max-w-full">
      <h2 className="text-lg font-semibold mb-3">Export Dashboard</h2>
      {!candidate || !analysis ? (
        <div className="text-sm text-neutral-600">Select a candidate to export.</div>
      ) : (
        <ExportPanel selectedCandidate={candidate} analysis={analysis} />
      )}
    </div>
  );
}
