import React, { useMemo, useEffect } from "react";
import { VersionSelector } from "@/ui/components/VersionSelector";
import { PreflightPill, type PillStatus } from "@/ui/components/PreflightPill";
import { useAnalysisStore } from "@/stores/analysis.store";
import { useManuscriptStore } from "@/stores/manuscript.store";
import { usePreferences } from "@/stores/preferences.store";
import { generateCandidates } from "@/features/manuscript/opening-candidates";

export function DecisionBar({ onToggleCompare }: { onToggleCompare?: () => void }) {
  const selectedCandidateId = useAnalysisStore((s) => s.selectedCandidateId);
  const getAnalysis = useAnalysisStore((s) => s.getAnalysis);
  const addCandidate = useAnalysisStore((s) => s.addCandidate);
  const candidateCount = useAnalysisStore((s) => Object.keys(s.candidates).length);
  const scenes = useManuscriptStore((s) => s.scenes);

  // Auto-generate candidates when scenes are loaded (only if none exist)
  useEffect(() => {
    if (scenes.length > 0 && candidateCount === 0) {
      console.log("Auto-generating opening candidates...");
      const localCandidates = generateCandidates(scenes, {
        minHookScore: 0.2,
        minDialogueRatio: 0,
        minWordCount: 100,
        requireDialogue: false,
        maxCandidates: 10
      });

      console.log(`Auto-generated ${localCandidates.length} candidates`);

      localCandidates.forEach(candidate => {
        const convertedCandidate = {
          id: candidate.id,
          sceneIds: candidate.scenes,
          type: candidate.type
        };
        addCandidate(convertedCandidate);
      });

      // Auto-select the first candidate
      if (localCandidates.length > 0 && localCandidates[0]) {
        useAnalysisStore.getState().selectCandidate(localCandidates[0].id);
      }
    }
  }, [scenes.length, candidateCount, addCandidate]);

  const handleGenerate = () => {
    if (scenes.length === 0) {
      console.warn("No scenes available for candidate generation");
      return;
    }

    console.log("Generating opening candidates...");
    const localCandidates = generateCandidates(scenes, {
      minHookScore: 0.2,
      minDialogueRatio: 0,
      minWordCount: 100,  // Much lower word count threshold
      requireDialogue: false,
      maxCandidates: 10
    });

    console.log(`Generated ${localCandidates.length} candidates`);

    // Convert to expected format for the UI store
    localCandidates.forEach(candidate => {
      const convertedCandidate = {
        id: candidate.id,
        sceneIds: candidate.scenes, // Map 'scenes' to 'sceneIds'
        type: candidate.type
      };
      addCandidate(convertedCandidate);
    });

    // Auto-select the first candidate if none is selected
    if (localCandidates.length > 0 && localCandidates[0] && !selectedCandidateId) {
      useAnalysisStore.getState().selectCandidate(localCandidates[0].id);
    }
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
        <button className="btn" title="Generate (G)" aria-label="Generate" onClick={handleGenerate}>G</button>
        <button className="btn" title="Compare (C)" aria-label="Compare" onClick={onToggleCompare}>C</button>
        <button className="btn primary" title="Export (E)" aria-label="Export" disabled={!allPass}>E</button>
      </div>
    </div>
  );
}

export default DecisionBar;
