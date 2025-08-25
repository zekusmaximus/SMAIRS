import { create } from "zustand";

// Shared types from Specta-generated file
import type { OpeningCandidate as SharedOpeningCandidate, OpeningAnalysis as SharedOpeningAnalysis } from "@/types";

export type OpeningCandidate = SharedOpeningCandidate;
export type OpeningAnalysis = SharedOpeningAnalysis;

export type AnalysisStoreState = {
  candidates: Record<string, OpeningCandidate>;
  analyses: Record<string, OpeningAnalysis>;
  selectedCandidateId?: string;
  comparisonIds: string[];
  addCandidate: (c: OpeningCandidate) => void;
  addAnalysis: (a: OpeningAnalysis) => void;
  toggleComparison: (candidateId: string) => void;
  getAnalysis: (candidateId: string) => OpeningAnalysis | undefined;
  getAllAnalyses: () => OpeningAnalysis[];
  selectCandidate: (id?: string) => void;
  clearAll: () => void;
};

export const useAnalysisStore = create<AnalysisStoreState>((set, get) => ({
  candidates: {},
  analyses: {},
  selectedCandidateId: undefined,
  comparisonIds: [],
  addCandidate(c) {
    set((s) => ({ candidates: { ...s.candidates, [c.id]: c } }));
  },
  addAnalysis(a) {
    set((s) => ({ analyses: { ...s.analyses, [a.candidateId]: a } }));
  },
  toggleComparison(candidateId) {
    set((s) => {
      const exists = s.comparisonIds.includes(candidateId);
      return { comparisonIds: exists ? s.comparisonIds.filter((id) => id !== candidateId) : [...s.comparisonIds, candidateId] };
    });
  },
  getAnalysis(candidateId) {
    return get().analyses[candidateId];
  },
  getAllAnalyses() {
    return Object.values(get().analyses);
  },
  selectCandidate(id) {
    set({ selectedCandidateId: id });
  },
  clearAll() {
    set({ candidates: {}, analyses: {}, selectedCandidateId: undefined, comparisonIds: [] });
  },
}));
