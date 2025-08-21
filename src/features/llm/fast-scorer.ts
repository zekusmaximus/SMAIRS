import { globalProviderAdapter } from './provider-adapter.js';
import { PROMPTS } from './prompt-templates.js';
import type { OpeningCandidate } from '../manuscript/opening-candidates.js';
import { z } from 'zod';
import { globalLLMCache } from './cache-manager.js';

export interface FastScoringRequest { candidate: OpeningCandidate; globalSynopsis: string; focusMetrics: ('hook'|'action'|'mystery'|'character')[]; }
export interface FastScoringResponse { hookScore: number; actionDensity: number; mysteryQuotient: number; characterIntros: number; confidence: number; reasoning?: string; }

const ResponseSchema = z.object({
  hookScore: z.number().min(0).max(1),
  actionDensity: z.number().min(0).max(1),
  mysteryQuotient: z.number().min(0).max(1),
  characterIntros: z.number().int().min(0).max(20),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

// Concurrency now handled by ProviderAdapter queue

export async function scoreCandidate(req: FastScoringRequest): Promise<FastScoringResponse> {
  const cacheKey = globalLLMCache.generateCacheKey('FAST_ITERATE', { id: req.candidate.id, metrics: req.focusMetrics });
  return globalLLMCache.getOrCompute(cacheKey, () => computeScore(req), { maxAgeMs: 30 * 60_000 });
}

async function computeScore(req: FastScoringRequest): Promise<FastScoringResponse> {
  try {
    const { system, template, temperature } = PROMPTS.SCORING;
    const prompt = template(req);
    const result = await globalProviderAdapter.executeWithFallback('FAST_ITERATE', { system, prompt, temperature, profile: 'FAST_ITERATE' });
    const json = (result.json || safeExtractJSON(result.text));
    const parsed = ResponseSchema.safeParse(json);
    if (parsed.success) {
      const { reasoning, ...rest } = parsed.data; // omit reasoning for persistence later if needed
      return { ...rest, reasoning };
    }
    // fallback minimal stats from candidate itself
    return { hookScore: req.candidate.hookScore, actionDensity: req.candidate.actionDensity, mysteryQuotient: req.candidate.mysteryQuotient, characterIntros: req.candidate.characterIntros, confidence: 0.5 };
  } finally { /* adapter handles concurrency */ }
}

function safeExtractJSON(text: string): unknown { try { const s = text.indexOf('{'); const e = text.lastIndexOf('}'); if (s>=0 && e>s) return JSON.parse(text.slice(s,e+1)); } catch { /* ignore */ } return {}; }
