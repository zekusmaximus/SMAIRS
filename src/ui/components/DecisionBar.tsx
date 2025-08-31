import React, { useMemo, useEffect, useRef } from "react";
import { VersionSelector } from "@/ui/components/VersionSelector";
import { PreflightPill, type PillStatus } from "@/ui/components/PreflightPill";
import { useAnalysisStore } from "@/stores/analysis.store";
import { useManuscriptStore } from "@/stores/manuscript.store";
import { usePreferences } from "@/stores/preferences.store";
import { useGenerateCandidates } from "@/lib/queries";

export function DecisionBar({ onToggleCompare }: { onToggleCompare?: () => void }) {
  const selectedCandidateId = useAnalysisStore((s) => s.selectedCandidateId);
  const getAnalysis = useAnalysisStore((s) => s.getAnalysis);
  const candidateCount = useAnalysisStore((s) => Object.keys(s.candidates).length);
  const scenes = useManuscriptStore((s) => s.scenes);
  const generate = useGenerateCandidates();
  const autoRun = useRef(false);

  // Auto-generate candidates when scenes are loaded (only if none exist)
  useEffect(() => {
    if (scenes.length > 0 && candidateCount === 0 && !autoRun.current) {
      autoRun.current = true;
      generate.mutate({ scenes }, {
        onSuccess: (c) => {
          const first = c && c.length > 0 ? c[0] : undefined;
          if (first?.id) {
            useAnalysisStore.getState().selectCandidate(first.id);
          }
        }
      });
    }
  }, [scenes, candidateCount, generate]);

  const handleGenerate = () => {
    if (scenes.length === 0) {
      console.warn("No scenes available for candidate generation");
      return;
    }
    generate.mutate({ scenes }, {
      onSuccess: (c) => {
        const first = c && c.length > 0 ? c[0] : undefined;
        if (first?.id && !selectedCandidateId) {
          useAnalysisStore.getState().selectCandidate(first.id);
        }
      }
    });
  };

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
  const prefs = usePreferences();

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
        <div className="flex items-center gap-2 mr-2">
          <select aria-label="Theme" value={prefs.theme} onChange={(e)=> prefs.set('theme', e.target.value as 'light' | 'dark' | 'auto')} className="text-xs">
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <label className="text-xs">A<sup>−</sup>
            <input aria-label="Editor font size" type="range" min={12} max={22} value={prefs.editorFontSize} onChange={(e)=> prefs.set('editorFontSize', Number(e.target.value))} />A<sup>+</sup>
          </label>
        </div>
        {generate.error ? (
          <span className="text-xs text-red-600 mr-2">{String((generate.error as Error).message)}</span>
        ) : null}
        <button
          className="btn"
          title="Generate (G)"
          aria-label="Generate"
          onClick={handleGenerate}
          disabled={generate.isPending}
        >
          {generate.isPending ? "…" : "G"}
        </button>
        <button className="btn" title="Compare (C)" aria-label="Compare" onClick={onToggleCompare}>C</button>
        <button className="btn primary" title="Export (E)" aria-label="Export" disabled={!allPass}>E</button>
      </div>
    </div>
  );
}

export default DecisionBar;
