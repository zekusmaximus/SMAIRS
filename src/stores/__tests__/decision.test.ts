import { describe, it, expect, beforeEach } from "vitest";
import { useDecisionStore, type Decision } from "@/stores/decision.store";

describe("decision.store", () => {
  beforeEach(() => {
    // reset store
    useDecisionStore.getState().clearAll();
  });

  it("sets, gets and clears decisions", () => {
    const d: Decision = { choice: "accept", rationale: "Looks strong" } as unknown as Decision;
    useDecisionStore.getState().setDecision("cand-1", d);
    expect(useDecisionStore.getState().getDecision("cand-1")).toEqual(d);
    useDecisionStore.getState().clearDecision("cand-1");
    expect(useDecisionStore.getState().getDecision("cand-1")).toBeUndefined();
  });
});
