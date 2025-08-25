import React, { useMemo } from "react";
import { useAnalysisStore } from "@/stores/analysis.store";
import CandidateCard from "@/ui/components/CandidateCard";

export default function CandidateGrid() {
  const { candidates, analyses } = useAnalysisStore();
  const list = useMemo(() => Object.values(candidates), [candidates]);

  // Loading / empty states – for now we infer from absence
  const loading = false; // integrate generator status later
  const empty = !loading && list.length === 0;

  if (loading) {
    return (
      <div className="p-4 text-sm text-neutral-500">Generating opening candidates…</div>
    );
  }
  if (empty) {
    return (
      <div className="p-6 text-center text-sm text-neutral-600">
        <div className="mb-1 font-medium">No candidates yet</div>
        <div className="opacity-80">Run the Opening Lab to generate candidates.</div>
      </div>
    );
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}
    >
      {list.map((c) => (
        <CandidateCard key={c.id} candidate={c} analysis={analyses[c.id]} />
      ))}
    </div>
  );
}
