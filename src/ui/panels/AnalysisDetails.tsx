import React, { Suspense, useEffect, useState } from "react";
import { useAnalysisStore } from "@/stores/analysis.store";

// Simple candidate selector component
function CandidateSelector() {
  const { candidates, selectedCandidateId, selectCandidate } = useAnalysisStore();
  const candidateList = Object.values(candidates);

  if (candidateList.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 p-3 bg-gray-800 rounded-lg">
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Select Candidate ({candidateList.length} available):
      </label>
      <select 
        value={selectedCandidateId || ''} 
        onChange={(e) => selectCandidate(e.target.value || undefined)}
        className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded text-white"
      >
        <option value="">Choose a candidate...</option>
        {candidateList.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.id} ({candidate.type})
          </option>
        ))}
      </select>
    </div>
  );
}

const DecisionTab = React.lazy(() => import("@/ui/tabs/DecisionTab"));
const MetricsTab = React.lazy(() => import("@/ui/tabs/MetricsTab"));
const SpoilersTab = React.lazy(() => import("@/ui/tabs/SpoilersTab"));
const ContextTab = React.lazy(() => import("@/ui/tabs/ContextTab"));
const EditsTab = React.lazy(() => import("@/ui/tabs/EditsTab"));
const PreviewTab = React.lazy(() => import("@/ui/tabs/PreviewTab"));

const TABS = ["Decision", "Metrics", "Spoilers", "Context", "Edits", "Preview"] as const;
export type TabKey = typeof TABS[number];

export default function AnalysisDetails() {
  const { selectedCandidateId, analyses, candidates } = useAnalysisStore();
  const [tab, setTab] = useState<TabKey>("Decision");
  const analysis = selectedCandidateId ? analyses[selectedCandidateId] : undefined;
  const candidate = selectedCandidateId ? candidates[selectedCandidateId] : undefined;

  // Keyboard shortcuts 1..6
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key >= "1" && e.key <= "6") {
        const idx = Number(e.key) - 1;
        setTab(TABS[idx] || "Decision");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const renderTab = () => {
    if (!selectedCandidateId) return null;
    
    switch (tab) {
      case "Decision":
        return <DecisionTab candidateId={selectedCandidateId} analysis={analysis} />;
      case "Metrics":
        return <MetricsTab analysis={analysis} candidateId={selectedCandidateId} />;
      case "Spoilers":
        return <SpoilersTab analysis={analysis} candidateId={selectedCandidateId} />;
      case "Context":
        return <ContextTab analysis={analysis} candidateId={selectedCandidateId} />;
      case "Edits":
        return <EditsTab analysis={analysis} candidateId={selectedCandidateId} />;
      case "Preview":
        return <PreviewTab analysis={analysis} candidateId={selectedCandidateId} />;
      default:
        return null;
    }
  };

  return (
    <div>
      <CandidateSelector />
      
      {/* Empty state */}
      {(!selectedCandidateId || !candidate) ? (
        <div className="p-6 text-sm text-neutral-600">
          Select a candidate to view detailed analysis.
        </div>
      ) : (
        <div className="flex flex-col h-full">
          <nav className="border-b border-neutral-200 dark:border-neutral-800">
            <ul className="flex gap-2 px-2 py-1 overflow-auto">
              {TABS.map((t, i) => (
                <li key={t}>
                  <button
                    className={`px-2 py-1 rounded text-sm ${tab === t ? "bg-blue-600 text-white" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
                    onClick={() => setTab(t)}
                    title={`${t} (press ${i + 1})`}
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex-1 overflow-auto">
            <Suspense fallback={<div className="p-4 text-sm text-neutral-500">Loading…</div>}>
              {renderTab()}
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
