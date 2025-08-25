import type { OpeningAnalysis, OpeningCandidate } from "@/types";

export type PreflightItem = {
  key: string;
  label: string;
  pass: boolean;
  critical?: boolean;
  message?: string;
};

export function runPreflight(input: { candidate?: OpeningCandidate; analysis?: OpeningAnalysis }): PreflightItem[] {
  const items: PreflightItem[] = [];
  const { candidate, analysis } = input;

  items.push({ key: "candidate-selected", label: "Candidate selected", pass: !!candidate, critical: true, message: !candidate ? "Select a candidate to export." : undefined });
  items.push({ key: "analysis-present", label: "Analysis available", pass: !!analysis, critical: true, message: !analysis ? "Run analysis before export." : undefined });
  if (analysis) {
    items.push({ key: "confidence-threshold", label: "Confidence >= 0.6", pass: (analysis.confidence ?? 0) >= 0.6, critical: false, message: (analysis.confidence ?? 0) >= 0.6 ? undefined : "Consider re-running analysis for higher confidence." });
    items.push({ key: "spoiler-check", label: "No critical spoilers", pass: (analysis.spoilerCount ?? 0) === 0, critical: true, message: (analysis.spoilerCount ?? 0) === 0 ? undefined : "Fix spoilers before exporting." });
    items.push({ key: "edit-burden", label: "Edit burden acceptable", pass: (analysis.editBurdenPercent ?? 0) <= 0.5, critical: false, message: (analysis.editBurdenPercent ?? 0) <= 0.5 ? undefined : "High edit burden; consider revisions." });
  }

  return items;
}
