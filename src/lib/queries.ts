import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useManuscriptStore } from "@/stores/manuscript.store";
import { useAnalysisStore } from "@/stores/analysis.store";
import type { OpeningCandidate, OpeningAnalysis } from "@/types";
import type { Scene as ManuscriptScene } from "@/features/manuscript/types";
// Local Opening Lab pathway for per-scene analysis
import { OpeningLab } from "@/features/manuscript/opening-lab";
import { extractReveals } from "@/features/manuscript/reveal-extraction";
import { calculateActionDensity, calculateMysteryQuotient } from "@/features/manuscript/opening-candidates";
import { analyzeScenes } from "@/features/manuscript/analyzer";
import { generateCandidates as generateOpeningCandidates } from "@/features/manuscript/opening-candidates";

// (no direct Tauri type import here; loaded dynamically at runtime)

/**
 * Call a backend command using Tauri when available or fall back to HTTP.
 * Throws an explicit error if neither pathway is available.
 */
async function backendInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  // Prefer Tauri invoke when the runtime is available
  try {
    // Tauri v2 exposes invoke from '@tauri-apps/api/core'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const core = (await import("@tauri-apps/api/core")) as any;
    const inv: undefined | ((c: string, a: Record<string, unknown>) => Promise<unknown>) = core?.invoke;
    if (typeof inv === "function") {
      return (await inv(cmd, args)) as T;
    }
  } catch {
    // ignore - not in tauri runtime
  }

  // Optional HTTP fallback only when VITE_API_URL is explicitly configured
  const base = import.meta.env?.VITE_API_URL as string | undefined;
  if (typeof fetch === "function" && base) {
    try {
      const res = await fetch(`${base}/${cmd}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      throw new Error(`HTTP backend unavailable for ${cmd}: ${String((e as Error).message)}`);
    }
  }

  throw new Error(`Backend APIs unavailable for ${cmd}`);
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
    // Try Tauri backend directly; fall back to local heuristics in browser
    mutationFn: async (payload: { scenes: ManuscriptScene[]; strategy?: string }): Promise<OpeningCandidate[]> => {
      // Attempt direct Tauri invoke to avoid any HTTP path
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const core = (await import("@tauri-apps/api/core")) as any;
        const inv: undefined | ((cmd: string, args: Record<string, unknown>) => Promise<unknown>) = core?.invoke;
        if (typeof inv === "function") {
          console.log("[candidates] using Tauri invoke");
          const res = await inv("generate_candidates", { payload: { scenes: payload.scenes, strategy: payload.strategy } }) as OpeningCandidate[];
          return res;
        }
        throw new Error("invoke not available");
      } catch {
        console.log("[candidates] using local heuristics");
        const local = generateOpeningCandidates(payload.scenes as unknown as import("@/features/manuscript/types").Scene[], undefined);
        return local.map(c => ({ id: c.id, sceneIds: c.scenes, type: c.type } as unknown as OpeningCandidate));
      }
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
      const result = await backendInvoke<OpeningAnalysis>("analyze_candidate", payload);
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
      await backendInvoke<unknown>("export_bundle", payload);
      return true;
    },
  });
}
