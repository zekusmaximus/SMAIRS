import { create } from "zustand";

import type { Decision as SharedDecision } from "@/types";

export type Decision = SharedDecision;

type PersistShape = {
  version: number;
  decisions: Record<string, Decision>;
};

const STORAGE_KEY = "smairs.decisions";
const STORAGE_VERSION = 1;

function loadPersisted(): PersistShape {
  if (typeof localStorage === "undefined") return { version: STORAGE_VERSION, decisions: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: STORAGE_VERSION, decisions: {} };
  const parsed = JSON.parse(raw) as unknown as PersistShape | { decisions: Record<string, Decision> };
    // Handle older shapes without version
    const version = (parsed as PersistShape).version ?? 0;
  const decisions = (parsed as PersistShape).decisions ?? (parsed as { decisions?: Record<string, Decision> }).decisions ?? {};
    if (version !== STORAGE_VERSION) {
      // Perform any migrations here if needed
      return { version: STORAGE_VERSION, decisions };
    }
    return { version, decisions } as PersistShape;
  } catch {
    return { version: STORAGE_VERSION, decisions: {} };
  }
}

function persist(state: PersistShape) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export type DecisionStoreState = {
  decisions: Record<string, Decision>;
  setDecision: (candidateId: string, decision: Decision) => void;
  getDecision: (candidateId: string) => Decision | undefined;
  clearDecision: (candidateId: string) => void;
};

export const useDecisionStore = create<DecisionStoreState>((set, get) => {
  const initial = loadPersisted();
  return {
    decisions: initial.decisions,
    setDecision(candidateId, decision) {
      set((s) => {
        const decisions = { ...s.decisions, [candidateId]: decision };
        persist({ version: STORAGE_VERSION, decisions });
        return { decisions };
      });
    },
    getDecision(candidateId) {
      return get().decisions[candidateId];
    },
    clearDecision(candidateId) {
      set((s) => {
        const decisions = { ...s.decisions };
        delete decisions[candidateId];
        persist({ version: STORAGE_VERSION, decisions });
        return { decisions };
      });
    },
  };
});
