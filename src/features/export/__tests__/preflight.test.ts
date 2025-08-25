import { describe, it, expect } from "vitest";
import { runPreflight } from "@/features/export/preflight";
import type { OpeningAnalysis, OpeningCandidate } from "@/types";

describe("export preflight", () => {
  it("fails when candidate or analysis missing", () => {
    const a = runPreflight({});
    const map = new Map(a.map(i => [i.key, i]));
    expect(map.has("candidate-selected")).toBe(true);
    expect(map.get("candidate-selected")!.pass).toBe(false);
    expect(map.has("analysis-present")).toBe(true);
    expect(map.get("analysis-present")!.pass).toBe(false);
  });

  it("checks thresholds when analysis provided", () => {
    const candidate: OpeningCandidate = { id: "c1", sceneIds: [], type: "auto" };
    const analysis: OpeningAnalysis = {
      id: "a1",
      candidateId: candidate.id,
      confidence: 0.55,
      spoilerCount: 1,
      editBurdenPercent: 0.6,
      rationale: "test"
    };
    const res = runPreflight({ candidate, analysis });
    const map = new Map(res.map(i => [i.key, i]));
    expect(map.get("candidate-selected")!.pass).toBe(true);
    expect(map.get("analysis-present")!.pass).toBe(true);
    expect(map.get("confidence-threshold")!.pass).toBe(false);
    expect(map.get("spoiler-check")!.pass).toBe(false);
    expect(map.get("edit-burden")!.pass).toBe(false);
  });
});
