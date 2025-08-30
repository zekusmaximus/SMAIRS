import React, { useMemo, useState, useEffect } from "react";
import { useAnalysisStore } from "@/stores/analysis.store";
import CandidateCard from "@/ui/components/CandidateCard";
import { LoadingSkeleton, AnalysisLoadingState } from "@/ui/components/LoadingStates";
import { useJobProgress } from "@/hooks/useJobProgress";

// Skeleton card component for loading states
const CandidateCardSkeleton: React.FC<{ delay?: number }> = ({ delay = 0 }) => (
  <div
    className="card"
    style={{
      animationDelay: `${delay}ms`,
      animation: `card-in 180ms ease-out ${delay}ms both`
    }}
    role="progressbar"
    aria-label="Loading candidate"
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <LoadingSkeleton width="60%" height="1rem" className="rounded" />
      <LoadingSkeleton width="3rem" height="1rem" className="rounded" />
    </div>

    <div className="mb-2">
      <LoadingSkeleton width="100%" height="0.75rem" className="rounded" />
    </div>

    <div className="flex flex-wrap gap-1 items-center mb-3">
      {Array.from({ length: 4 }, (_, i) => (
        <React.Fragment key={i}>
          <LoadingSkeleton width="2.5rem" height="1.25rem" className="rounded" />
          {i < 3 && <span className="text-[10px] opacity-60">·</span>}
        </React.Fragment>
      ))}
    </div>

    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <LoadingSkeleton width="1rem" height="1rem" className="rounded" />
        <LoadingSkeleton width="4rem" height="0.75rem" className="rounded" />
      </div>
      <LoadingSkeleton width="3rem" height="0.75rem" className="rounded" />
    </div>
  </div>
);

export interface CandidateGridProps {
  jobId?: string;
  onJobStart?: (jobId: string) => void;
}

export default function CandidateGrid({ jobId, onJobStart }: CandidateGridProps = {}) {
  const { candidates, analyses } = useAnalysisStore();
  const list = useMemo(() => Object.values(candidates), [candidates]);

  // Job progress tracking for candidate generation
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(jobId);
  const { status: jobStatus, progress, step, error: jobError } = useJobProgress(currentJobId);

  // Update job tracking when prop changes
  useEffect(() => {
    if (jobId && jobId !== currentJobId) {
      setCurrentJobId(jobId);
      onJobStart?.(jobId);
    }
  }, [jobId, currentJobId, onJobStart]);

  // Loading states
  const isGenerating = jobStatus === "running" || jobStatus === "queued";
  const hasError = jobStatus === "error";
  const isEmpty = !isGenerating && list.length === 0;

  // Track completed candidates for staggered animations
  const [completedCandidates, setCompletedCandidates] = useState<Set<string>>(new Set());

  // Update completed candidates when new ones arrive
  useEffect(() => {
    const newCompleted = new Set(completedCandidates);
    list.forEach(candidate => {
      if (!newCompleted.has(candidate.id)) {
        newCompleted.add(candidate.id);
      }
    });
    setCompletedCandidates(newCompleted);
  }, [list, completedCandidates]);

  // Show generation progress when actively generating
  if (isGenerating) {
    return (
      <div className="space-y-6">
        <AnalysisLoadingState
          progress={progress}
          currentStep={step || "Generating opening candidates..."}
        />

        {/* Show skeleton cards for expected candidates */}
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            maxWidth: "100%"
          }}
        >
          {Array.from({ length: Math.max(3, list.length + 2) }, (_, i) => (
            <CandidateCardSkeleton key={`skeleton-${i}`} delay={i * 100} />
          ))}
        </div>
      </div>
    );
  }

  // Show error state
  if (hasError) {
    return (
      <div className="p-6 text-center text-sm text-red-600">
        <div className="mb-1 font-medium">Generation failed</div>
        <div className="opacity-80 mb-4">
          {jobError || "An error occurred while generating candidates."}
        </div>
        <button
          onClick={() => {
            setCurrentJobId(undefined);
            // Clear completed candidates to reset animation state
            setCompletedCandidates(new Set());
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Show empty state
  if (isEmpty) {
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
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        maxWidth: "100%"
      }}
    >
      {list.map((c, index) => (
        <div
          key={c.id}
          style={{
            animationDelay: `${index * 50}ms`,
            animation: completedCandidates.has(c.id)
              ? `card-in 180ms ease-out ${index * 50}ms both`
              : undefined
          }}
        >
          <CandidateCard
            candidate={c}
            analysis={analyses[c.id]}
            status={analyses[c.id] ? "Ready" : "Analyzing"}
          />
        </div>
      ))}
    </div>
  );
}
