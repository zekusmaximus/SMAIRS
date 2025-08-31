import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useManuscriptStore } from "@/stores/manuscript.store";
import { useAnalysisStore } from "@/stores/analysis.store";
import type { OpeningCandidate, OpeningAnalysis, Scene } from "@/types";
// Local Opening Lab pathway for per-scene analysis
import { OpeningLab } from "@/features/manuscript/opening-lab";
import { extractReveals } from "@/features/manuscript/reveal-extraction";
import { calculateActionDensity, calculateMysteryQuotient } from "@/features/manuscript/opening-candidates";
import { analyzeScenes } from "@/features/manuscript/analyzer";

type TauriApi = { invoke?: (cmd: string, args: Record<string, unknown>) => Promise<unknown> };

async function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    const mod = (await import("@tauri-apps/api")) as unknown as TauriApi;
    if (typeof mod.invoke === "function") {
      return (await mod.invoke(cmd, args)) as T;
    }
  } catch {
    // not in tauri runtime; fall back to mock behavior
  }
  // Simple fallback: echo args for tests/dev
  return args as unknown as T;
}

export function useManuscript(path: string | undefined) {
  const loadManuscript = useManuscriptStore((s) => s.loadManuscript);
  return useQuery({
    queryKey: ["manuscript", path],
    enabled: Boolean(path),
    queryFn: async () => {
      await loadManuscript(path as string);
      return true;
    },
  });
}

export function useGenerateCandidates() {
  const qc = useQueryClient();
  const addCandidate = useAnalysisStore((s) => s.addCandidate);
  return useMutation({
    mutationKey: ["generate-candidates"],
    mutationFn: async (payload: { scenes: Scene[]; strategy?: string }): Promise<OpeningCandidate[]> => {
      const result = await tauriInvoke<OpeningCandidate[]>("generate_candidates", payload);
      return result;
    },
    onSuccess(cands) {
      cands.forEach(addCandidate);
      qc.invalidateQueries({ queryKey: ["candidates"] }).catch(() => {});
    },
  });
}

export function useAnalyzeCandidate() {
  const addAnalysis = useAnalysisStore((s) => s.addAnalysis);
  return useMutation({
    mutationKey: ["analyze-candidate"],
    mutationFn: async (payload: { candidateId: string }): Promise<OpeningAnalysis> => {
      const result = await tauriInvoke<OpeningAnalysis>("analyze_candidate", payload);
      return result;
    },
    onSuccess(analysis) {
      addAnalysis(analysis);
    },
  });
}

// Analyze a single scene locally with Opening Lab (AI + heuristics) and store a simplified result
export function useAnalyzeSceneLocal() {
  const { fullText, scenes } = useManuscriptStore((s) => ({ fullText: s.fullText, scenes: s.scenes }));
  const addCandidate = useAnalysisStore((s) => s.addCandidate);
  const addAnalysis = useAnalysisStore((s) => s.addAnalysis);
  return useMutation({
    mutationKey: ["analyze-scene-local"],
    mutationFn: async (payload: { sceneId: string }): Promise<OpeningAnalysis> => {
      if (!payload.sceneId) throw new Error("sceneId required");
      const scene = scenes.find((s) => s.id === payload.sceneId);
      if (!scene) throw new Error(`Scene ${payload.sceneId} not found`);

      // Build a minimal OpeningCandidate from this scene
      const hookScores = analyzeScenes(scenes).hookScores;
      const candidate = {
        id: `single:${scene.id}`,
        type: "single" as const,
        scenes: [scene.id],
        startOffset: scene.startOffset,
        endOffset: scene.endOffset,
        totalWords: scene.wordCount,
        hookScore: hookScores.get(scene.id) ?? 0.5,
        actionDensity: calculateActionDensity(scene.text),
        mysteryQuotient: calculateMysteryQuotient(scene.text),
        characterIntros: 0,
        dialogueRatio: scene.dialogueRatio,
      } as unknown as import("@/features/manuscript/opening-candidates").OpeningCandidate;

      // Gather reveals on demand
      const reveals = scenes.flatMap(extractReveals);

      // Run Opening Lab analysis
      const lab = new OpeningLab();
      const rich = await lab.analyzeCandidate(candidate, fullText, scenes as unknown as import("@/features/manuscript/types").Scene[], reveals);

      // Map to simplified UI analysis type
      const simplified: OpeningAnalysis = {
        id: `${candidate.id}::analysis`,
        candidateId: candidate.id,
        confidence: rich.confidence,
        spoilerCount: rich.violations.length,
        editBurdenPercent: (rich.burden?.metrics as { percentageOfText?: number } | undefined)?.percentageOfText ?? 0,
        rationale: `${rich.recommendation.toUpperCase()} · hook=${(rich.scores.scores.hookStrength ?? 0).toFixed(2)} · spoilers=${rich.violations.length}`,
      };

      // Ensure candidate exists in UI store
      addCandidate({ id: candidate.id, sceneIds: candidate.scenes, type: candidate.type } as unknown as OpeningCandidate);
      return simplified;
    },
    onSuccess(analysis) {
      addAnalysis(analysis);
      // Auto-select candidate for details
      try { useAnalysisStore.getState().selectCandidate(analysis.candidateId); } catch { /* no-op */ }
    },
  });
}

export function useExportBundle() {
  return useMutation({
    mutationKey: ["export-bundle"],
    mutationFn: async (payload: { destination: string; candidateIds: string[] }) => {
      await tauriInvoke<unknown>("export_bundle", payload);
      return true;
    },
  });
}
