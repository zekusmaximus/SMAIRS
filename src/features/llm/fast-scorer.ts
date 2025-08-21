import { resolveProfile } from './providers.js';
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

const CONCURRENCY_LIMIT = 5;
let active = 0;
const queue: (() => void)[] = [];

function acquire(): Promise<void> { return new Promise(res => { if (active < CONCURRENCY_LIMIT) { active++; res(); } else queue.push(res); }); }
function release() { active--; const n = queue.shift(); if (n) { active++; n(); } }

export async function scoreCandidate(req: FastScoringRequest): Promise<FastScoringResponse> {
  const cacheKey = globalLLMCache.generateCacheKey('FAST_ITERATE', { id: req.candidate.id, metrics: req.focusMetrics });
  return globalLLMCache.getOrCompute(cacheKey, () => computeScore(req), { maxAgeMs: 30 * 60_000 });
}

async function computeScore(req: FastScoringRequest): Promise<FastScoringResponse> {
  await acquire();
  try {
    const caller = resolveProfile('FAST_ITERATE');
    const { system, template, temperature } = PROMPTS.SCORING;
    const prompt = template(req);
    const result = await caller.callWithRetry({ system, prompt, temperature, profile: 'FAST_ITERATE' }, 3);
    const json = (result.json || safeExtractJSON(result.text));
    const parsed = ResponseSchema.safeParse(json);
    if (parsed.success) {
      const { reasoning, ...rest } = parsed.data; // omit reasoning for persistence later if needed
      return { ...rest, reasoning };
    }
    // fallback minimal stats from candidate itself
    return { hookScore: req.candidate.hookScore, actionDensity: req.candidate.actionDensity, mysteryQuotient: req.candidate.mysteryQuotient, characterIntros: req.candidate.characterIntros, confidence: 0.5 };
  } finally { release(); }
}

function safeExtractJSON(text: string): unknown { try { const s = text.indexOf('{'); const e = text.lastIndexOf('}'); if (s>=0 && e>s) return JSON.parse(text.slice(s,e+1)); } catch { /* ignore */ } return {}; }
