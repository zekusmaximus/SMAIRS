import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useManuscriptStore } from "@/stores/manuscript.store";
import { useAnalysisStore } from "@/stores/analysis.store";
import type { OpeningCandidate, OpeningAnalysis, Scene } from "@/types";

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

export function useExportBundle() {
  return useMutation({
    mutationKey: ["export-bundle"],
    mutationFn: async (payload: { destination: string; candidateIds: string[] }) => {
      await tauriInvoke<unknown>("export_bundle", payload);
      return true;
    },
  });
}
