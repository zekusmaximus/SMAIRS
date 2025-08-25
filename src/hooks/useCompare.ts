import { useCallback, useMemo } from "react";
import { useAnalysisStore } from "@/stores/analysis.store";

export const MAX_COMPARE = 4;

export function useCompare() {
  const {
    candidates,
    analyses,
    comparisonIds,
    toggleComparison,
  } = useAnalysisStore();

  const pinned = useMemo(() => comparisonIds, [comparisonIds]);
  const pinnedCandidates = useMemo(
    () => pinned.map((id) => candidates[id]).filter((x): x is NonNullable<typeof x> => Boolean(x)),
    [pinned, candidates]
  );
  const pinnedAnalyses = useMemo(
    () => pinned.map((id) => analyses[id]).filter((x): x is NonNullable<typeof x> => Boolean(x)),
    [pinned, analyses]
  );

  const isPinned = useCallback((id?: string) => (id ? pinned.includes(id) : false), [pinned]);
  const canPin = useMemo(() => pinned.length < MAX_COMPARE, [pinned.length]);

  const pinToggle = useCallback((id: string) => {
    if (!id) return { ok: false, reason: "invalid" as const };
    const already = pinned.includes(id);
    if (!already && pinned.length >= MAX_COMPARE) {
      return { ok: false, reason: "limit" as const };
    }
    toggleComparison(id);
    return { ok: true as const };
  }, [pinned, toggleComparison]);

  const unpin = useCallback((id: string) => {
    if (!id) return;
    if (pinned.includes(id)) toggleComparison(id);
  }, [pinned, toggleComparison]);

  const clear = useCallback(() => {
    for (const id of [...pinned]) toggleComparison(id);
  }, [pinned, toggleComparison]);

  return {
    pinned,
    pinnedCandidates,
    pinnedAnalyses,
    isPinned,
    canPin,
    pinToggle,
    unpin,
    clear,
  };
}

export default useCompare;
