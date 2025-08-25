import { globalProviderAdapter } from "./provider-adapter.js";
import { buildAnalysisPrompt, buildCandidateGenPrompt, OpeningAnalysisSchema, CandidateListSchema, estimateTokens } from "./prompts.js";
import { persistentGetOrCompute } from "./cache.js";
import { emitJobEvent } from "@/lib/events";
import type { OpeningAnalysis, OpeningCandidate } from "@/types";

export type AnalyzeCandidateArgs = {
  candidateId: string;
  manuscriptText: string;
  candidateText?: string; // optional pre-joined text of selected scenes
  sceneTexts?: string[]; // alternative: list of scene texts to join
  jobId?: string; // optional for progress events
  temperature?: number;
};

export type GenerateCandidatesArgs = {
  manuscriptText: string;
  maxCandidates?: number;
  jobId?: string;
  temperature?: number;
};

export class OpeningLabOrchestrator {
  // Analyze a single candidate end-to-end with caching, queuing, and fallback
  async analyzeCandidate(args: AnalyzeCandidateArgs): Promise<OpeningAnalysis> {
    const { candidateId, manuscriptText, candidateText, sceneTexts, jobId, temperature } = args;
    const joined = candidateText ?? (sceneTexts ? sceneTexts.join("\n\n") : "");
    const progress = async (percent: number, step?: string) => { if (jobId) await emitJobEvent(jobId, "progress", { id: jobId, percent, step }); };
    const log = async (message: string, level: "info"|"warn"|"error" = "info") => { if (jobId) await emitJobEvent(jobId, "log", { id: jobId, level, message }); };

    await progress(1, "prepare");
    const { system, prompt, schema } = buildAnalysisPrompt({ manuscriptText, candidateId, candidateText: joined });
    const cacheKey = `analysis:${candidateId}:${hash(prompt)}`;
    const estimatedIn = estimateTokens(prompt);
    await log(`tokens~in=${estimatedIn}`);

    // Use provider adapter for queuing, rate limiting, retries, and fallback
  const result = await persistentGetOrCompute(
      "opening-analysis",
      cacheKey,
      async () => {
        await progress(10, "queue");
        const res = await globalProviderAdapter.executeWithFallback<OpeningAnalysis>("STRUCTURE_LONGCTX", { system, prompt, schema, temperature: temperature ?? 0.2 }, { dedupeKey: cacheKey, priority: 5 });
    const parsed = res.json ? OpeningAnalysisSchema.safeParse(res.json) : null;
    if (parsed && parsed.success) return parsed.data as OpeningAnalysis;
    return coerceAnalysisFromText(candidateId, res.text);
      },
      { ttlMs: 6 * 60 * 60 * 1000, sizeLimitBytes: 256_000 }
    );

    await progress(100, "complete");
    if (jobId) await emitJobEvent(jobId, "done", { id: jobId, result });
    return normalizeAnalysis(candidateId, result);
  }

  // Generate candidate suggestions from a manuscript
  async generateCandidates(args: GenerateCandidatesArgs): Promise<OpeningCandidate[]> {
    const { manuscriptText, maxCandidates = 5, jobId, temperature } = args;
    const progress = async (percent: number, step?: string) => { if (jobId) await emitJobEvent(jobId, "progress", { id: jobId, percent, step }); };
    const { system, prompt, schema } = buildCandidateGenPrompt({ manuscriptText, maxCandidates });
    const cacheKey = `cands:${hash(prompt)}`;
    await progress(1, "prepare");
    const out = await persistentGetOrCompute(
      "candidate-gen",
      cacheKey,
      async () => {
        await progress(10, "queue");
        const res = await globalProviderAdapter.executeWithFallback<{ candidates: OpeningCandidate[] }>("FAST_ITERATE", { system, prompt, schema, temperature: temperature ?? 0.2 }, { dedupeKey: cacheKey, priority: 4 });
        if (res.json) {
          const parsed = CandidateListSchema.safeParse(res.json);
          if (parsed.success) return parsed.data as { candidates: OpeningCandidate[] };
        }
        return coerceCandidatesFromText(res.text, maxCandidates);
      },
      { ttlMs: 3 * 60 * 60 * 1000, sizeLimitBytes: 256_000 }
    );
    await progress(100, "complete");
    const list = Array.isArray((out as unknown as { candidates?: unknown }).candidates) ? (out as { candidates: OpeningCandidate[] }).candidates : (out as unknown as OpeningCandidate[]);
    return list.map(normalizeCandidate);
  }
}

// --- Helpers ---------------------------------------------------------
function normalizeAnalysis(candidateId: string, a: OpeningAnalysis): OpeningAnalysis {
  return {
    id: a.id || `${candidateId}::analysis`,
    candidateId: a.candidateId || candidateId,
    confidence: clamp(Number(a.confidence ?? 0.7), 0, 1),
    spoilerCount: Math.max(0, Number(a.spoilerCount ?? 0)) | 0,
    editBurdenPercent: clamp(Number(a.editBurdenPercent ?? 0.3), 0, 1),
    rationale: a.rationale || "",
  };
}

function normalizeCandidate(c: OpeningCandidate): OpeningCandidate {
  return { id: String(c.id), sceneIds: Array.isArray(c.sceneIds) ? c.sceneIds.map(String) : [], type: c.type || "unknown" };
}

function coerceAnalysisFromText(candidateId: string, text: string): OpeningAnalysis {
  const confidence = inferNumber(text, /confidence\s*[:=]\s*(\d+(?:\.\d+)?)/i, 0.7);
  const spoilerCount = Math.round(inferNumber(text, /spoiler\s*count\s*[:=]\s*(\d+)/i, 0));
  const editBurdenPercent = inferNumber(text, /edit\s*burden\s*[:=]\s*(\d+(?:\.\d+)?)/i, 0.3);
  const rationale = text.slice(0, 800);
  return { id: `${candidateId}::analysis`, candidateId, confidence: clamp(confidence, 0, 1), spoilerCount, editBurdenPercent: clamp(editBurdenPercent, 0, 1), rationale };
}

function coerceCandidatesFromText(text: string, max: number): OpeningCandidate[] {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, max);
  return lines.map((ln, i) => ({ id: `cand${i + 1}`, sceneIds: ln.match(/sc\d+/g) || [], type: "llm" }));
}

function inferNumber(text: string, re: RegExp, dflt: number): number { const m = text.match(re); return m ? Number(m[1]) : dflt; }
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, isFinite(v) ? v : lo)); }
function hash(input: string): string { let h = 2166136261 >>> 0; for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

export default OpeningLabOrchestrator;
