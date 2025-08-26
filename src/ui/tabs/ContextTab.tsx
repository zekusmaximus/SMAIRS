import React, { useEffect, useState } from "react";
import type { OpeningAnalysis } from "@/stores/analysis.store";
import { useAnalysisStore } from "@/stores/analysis.store";
import { useManuscriptStore } from "@/stores/manuscript.store";
import { analyzeContext, type ContextGap } from "@/features/manuscript/context-analyzer";
import { globalBridgeCache } from "@/features/llm/bridge-cache";
import { BridgeGenerator, type BridgeGenerationRequest, type BridgeParagraph as GeneratedBridge } from "@/features/llm/bridge-generator";
import BridgeReview from "@/ui/BridgeReview";
import { StyleAnalyzer } from "@/features/manuscript/style-analyzer";
import { BridgeRefiner } from "@/features/llm/bridge-refiner";
import type { Scene as ManuscriptScene } from "@/features/manuscript/types";

export interface ContextTabProps { analysis?: OpeningAnalysis; candidateId: string }

export default function ContextTab({ analysis, candidateId }: ContextTabProps) {
  const { candidates } = useAnalysisStore();
  const { scenes, getSceneById } = useManuscriptStore();
  const candidate = candidates[candidateId!];

  const [gaps, setGaps] = useState<ContextGap[]>([]);
  const [bridges, setBridges] = useState<GeneratedBridge[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute real context gaps for the first candidate scene
  useEffect(() => {
    setError(null);
    setBridges(null);
    if (!candidate || !candidate.sceneIds?.length || scenes.length === 0) { setGaps([]); return; }
    const firstId = candidate.sceneIds[0];
    const target = (firstId ? getSceneById(firstId) : undefined) as ManuscriptScene | undefined;
    if (!target) { setGaps([]); return; }
    // Analyze against original scenes (full manuscript scenes array)
    try {
      const g = analyzeContext(target, scenes as unknown as ManuscriptScene[], scenes.findIndex(s => s.id === target.id));
      setGaps(g);
    } catch (e) {
      console.warn('context analysis failed', e);
      setGaps([]);
    }
  }, [candidateId, candidates, scenes, getSceneById]);

  // Generate bridges for the highest severity gap (or first)
  useEffect(() => {
    const run = async () => {
      if (!gaps.length) { setBridges([]); return; }
      const gap = gaps[0]!; // heuristic: first gap
      const sceneId = gap.entity.firstReference.sceneId;
      const target = getSceneById(sceneId) as ManuscriptScene | undefined;
      if (!target) { setBridges([]); return; }
      setLoading(true);
      try {
        const style = new StyleAnalyzer().analyzeLocalContext(target, 500);
        const req: BridgeGenerationRequest = { gap, targetScene: target, manuscriptStyle: style, maxWords: Math.max(40, Math.min(90, gap.requiredInfo.wordCount || 80)) };
        const options = await globalBridgeCache.getOrGenerate(req, new BridgeGenerator());
        setBridges(options);
      } catch (e) {
        setError('Failed to generate bridges');
        console.warn(e);
        setBridges([]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [gaps, getSceneById]);

  if (!analysis) return <div className="p-3 text-sm text-neutral-500">No context gaps identified.</div>;

  return (
    <div className="p-3 space-y-3">
      <div className="font-semibold text-sm">Context Gaps</div>
      {gaps.length === 0 && (
        <div className="text-sm text-neutral-600">No missing context detected.</div>
      )}
      {gaps.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-neutral-700">Top gap: {gaps[0]!.confusion.readerQuestion}</div>
          {loading && <div className="text-xs text-neutral-500">Generating bridge options…</div>}
          {error && <div className="text-xs text-red-600">{error}</div>}
          {bridges && bridges.length > 0 && (
            <BridgeReview
              gap={gaps[0]!}
              bridges={bridges}
              onSelect={(b) => {
                void navigator.clipboard?.writeText(b.text);
              }}
              onRefine={async (b, feedback) => {
                try {
                  const target = getSceneById(b.insertionPoint.sceneId) as ManuscriptScene | undefined;
                  if (!target) return;
                  // If feedback appears to be a direct rewrite, apply it; else, run refiner
                  if (feedback && feedback.trim() && feedback.trim() !== b.text.trim()) {
                    const analyzer = new StyleAnalyzer();
                    const base = analyzer.analyzeLocalContext(target, 500);
                    const styleMatch = analyzer.compareStyles(base, analyzer.analyzeText(feedback));
                    const updated = { ...b, text: feedback, wordCount: (feedback.match(/\b\w+\b/g) || []).length, styleMatch } as GeneratedBridge;
                    setBridges((prev) => {
                      if (!prev) return prev;
                      const i = prev.findIndex(x => x.text === b.text);
                      const next = prev.slice();
                      if (i >= 0) next[i] = updated;
                      return next;
                    });
                  } else {
                    const refiner = new BridgeRefiner();
                    const revised = await refiner.refine(b as unknown as GeneratedBridge, { issues: [], suggestions: ['Tighten prose', 'Maintain voice'] }, target);
                    setBridges((prev) => {
                      if (!prev) return prev;
                      const i = prev.findIndex(x => x.text === b.text);
                      const next = prev.slice();
                      if (i >= 0) next[i] = revised as GeneratedBridge;
                      return next;
                    });
                  }
                } catch (e) {
                  console.warn('refine failed', e);
                }
              }}
            />
          )}
        </div>
      )}

      <div className="p-2 rounded border border-neutral-200 dark:border-neutral-800">
        <div className="font-semibold text-sm mb-1">Edit Burden</div>
        <div className="text-sm">Estimated effort: {Math.round((analysis.editBurdenPercent || 0) * 100)}%</div>
      </div>
    </div>
  );
}
