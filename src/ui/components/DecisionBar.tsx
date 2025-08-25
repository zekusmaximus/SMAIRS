import React, { useMemo } from "react";
import { VersionSelector } from "@/ui/components/VersionSelector";
import { PreflightPill, type PillStatus } from "@/ui/components/PreflightPill";
import { useAnalysisStore } from "@/stores/analysis.store";

export function DecisionBar({ onToggleCompare }: { onToggleCompare?: () => void }) {
  const selectedCandidateId = useAnalysisStore((s) => s.selectedCandidateId);
  const getAnalysis = useAnalysisStore((s) => s.getAnalysis);

  // Derive pill statuses from store
  const { confidence, spoilers, burden, rationale } = useMemo(() => {
    const a = selectedCandidateId ? getAnalysis(selectedCandidateId) : undefined;

    const confidence: PillStatus = a ? (a.confidence >= 0.6 ? "pass" : "fail") : "pending";
    const spoilers: PillStatus = a ? (a.spoilerCount === 0 ? "pass" : "fail") : "pending";
    const burden: PillStatus = a ? (a.editBurdenPercent <= 20 ? "pass" : "fail") : "pending";
    const rationale: PillStatus = a ? (a.rationale && a.rationale.trim().length > 0 ? "pass" : "fail") : "pending";

    return { confidence, spoilers, burden, rationale };
  }, [selectedCandidateId, getAnalysis]);

  const allPass = [confidence, spoilers, burden, rationale].every((s) => s === "pass");

  return (
  <div className="decision-bar" role="banner" aria-label="Decision toolbar">
      <div className="left">
        <h1 className="app-title">SMAIRS</h1>
        <VersionSelector />
      </div>
      <div className="center">
        <PreflightPill status={confidence} label="Confidence" />
        <PreflightPill status={spoilers} label="Spoilers" />
        <PreflightPill status={burden} label="Burden" />
        <PreflightPill status={rationale} label="Rationale" />
      </div>
      <div className="right">
        <button className="btn" title="Generate (G)" aria-label="Generate">G</button>
        <button className="btn" title="Compare (C)" aria-label="Compare" onClick={onToggleCompare}>C</button>
        <button className="btn primary" title="Export (E)" aria-label="Export" disabled={!allPass}>E</button>
      </div>
    </div>
  );
}

export default DecisionBar;
