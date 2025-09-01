import type { OpeningCandidate } from '../manuscript/opening-candidates.js';
import { globalProviderAdapter as adapter } from './provider-adapter.js';
import { globalLLMCache } from './cache-manager.js';
import { OPENING_SCORER_PROMPTS } from './prompt-templates.js';
import { z } from 'zod';
// Use Vite raw import to avoid node:fs in browser bundles
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – Vite provides this query import as string
import fixtureRaw from './fixtures/opening-scores.json?raw';

export interface OpeningScoringRequest {
  candidate: OpeningCandidate;
  manuscript: { synopsis: string; genre: string; targetAudience: string };
  scoringMode: 'quick' | 'thorough' | 'comparative';
}

export interface OpeningScoringResult {
  candidateId: string;
  scores: {
    hookStrength: number;      // 0-1, grab factor
    marketAppeal: number;      // 0-1, commercial viability
    agentReadability: number;  // 0-1, first-page professional appeal
    clarityScore: number;      // 0-1, immediate comprehension
    voiceDistinction: number;  // 0-1, unique style
  };
  analysis: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  };
  confidence: number;
  profile: 'STRUCTURE_LONGCTX' | 'FAST_ITERATE' | 'JUDGE_SCORER';
}

const ScoreSchema = z.object({
  scores: z.object({
    hookStrength: z.number().min(0).max(1),
    marketAppeal: z.number().min(0).max(1).optional().default(0.5),
    agentReadability: z.number().min(0).max(1).optional().default(0.5),
    clarityScore: z.number().min(0).max(1).optional().default(0.5),
    voiceDistinction: z.number().min(0).max(1).optional().default(0.5),
  }),
  strengths: z.array(z.string()).optional().default([]),
  weaknesses: z.array(z.string()).optional().default([]),
  suggestions: z.array(z.string()).optional().default([]),
});

export class OpeningScorer {
  async scoreCandidate(request: OpeningScoringRequest): Promise<OpeningScoringResult> {
    const cacheKey = this.getCacheKey(request);
    return globalLLMCache.getOrCompute(cacheKey, async () => {
      switch (request.scoringMode) {
        case 'quick':
          return this.quickScore(request);
        case 'thorough':
          return this.thoroughScore(request);
        case 'comparative':
          return this.comparativeScore(request);
      }
    }, { maxAgeMs: 30 * 60_000 });
  }

  private async quickScore(req: OpeningScoringRequest): Promise<OpeningScoringResult> {
    // Use FAST_ITERATE profile; focus on hook/readability; <500ms target
    const offline = isOffline();
    if (offline) return this.fromFixture(req, 'FAST_ITERATE');
    const { system, template, temperature } = OPENING_SCORER_PROMPTS.QUICK;
    const prompt = template({ candidate: req.candidate, synopsis: req.manuscript.synopsis, genre: req.manuscript.genre });
    const result = await adapter.executeWithFallback('FAST_ITERATE', { system, prompt, temperature, profile: 'FAST_ITERATE' });
    const parsed = parseOpeningScores(result.text, result.json);
    return {
      candidateId: req.candidate.id,
      scores: ensureAllScores(parsed.scores, req.candidate),
      analysis: {
        strengths: parsed.strengths,
        weaknesses: parsed.weaknesses,
        suggestions: parsed.suggestions,
      },
      confidence: clamp01(0.6 + (req.candidate.hookScore - 0.5) * 0.3),
      profile: 'FAST_ITERATE',
    };
  }

  private async thoroughScore(req: OpeningScoringRequest): Promise<OpeningScoringResult> {
    // Use STRUCTURE_LONGCTX profile; full context; all dimensions
    const offline = isOffline();
    if (offline) return this.fromFixture(req, 'STRUCTURE_LONGCTX');
    const { system, template, temperature } = OPENING_SCORER_PROMPTS.THOROUGH;
    const prompt = template({ candidate: req.candidate, synopsis: req.manuscript.synopsis, genre: req.manuscript.genre, audience: req.manuscript.targetAudience });
    const result = await adapter.executeWithFallback('STRUCTURE_LONGCTX', { system, prompt, temperature, profile: 'STRUCTURE_LONGCTX' });
    const parsed = parseOpeningScores(result.text, result.json);
    return {
      candidateId: req.candidate.id,
      scores: ensureAllScores(parsed.scores, req.candidate),
      analysis: { strengths: parsed.strengths, weaknesses: parsed.weaknesses, suggestions: parsed.suggestions },
      confidence: clamp01(0.7 + (req.candidate.hookScore - 0.5) * 0.4),
      profile: 'STRUCTURE_LONGCTX',
    };
  }

  private async comparativeScore(req: OpeningScoringRequest): Promise<OpeningScoringResult> {
    // Use JUDGE_SCORER profile; genre standards & market positioning
    const offline = isOffline();
    if (offline) return this.fromFixture(req, 'JUDGE_SCORER');
    const { system, template, temperature } = OPENING_SCORER_PROMPTS.COMPARATIVE;
    const prompt = template({ candidate: req.candidate, synopsis: req.manuscript.synopsis, genre: req.manuscript.genre, audience: req.manuscript.targetAudience });
    const result = await adapter.executeWithFallback('JUDGE_SCORER', { system, prompt, temperature, profile: 'JUDGE_SCORER' });
    const parsed = parseOpeningScores(result.text, result.json);
    return {
      candidateId: req.candidate.id,
      scores: ensureAllScores(parsed.scores, req.candidate),
      analysis: { strengths: parsed.strengths, weaknesses: parsed.weaknesses, suggestions: parsed.suggestions },
      confidence: 0.65,
      profile: 'JUDGE_SCORER',
    };
  }

  async scoreBatch(candidates: OpeningCandidate[], mode: 'quick' | 'thorough' = 'quick'): Promise<Map<string, OpeningScoringResult>> {
    // Parallel scoring with adapter-level rate limiting
    const manuscriptStub = { synopsis: '', genre: 'general', targetAudience: 'adult' };
    const promises = candidates.map(c => this.scoreCandidate({ candidate: c, manuscript: manuscriptStub, scoringMode: mode }));
    const results = await Promise.all(promises);
    const map = new Map<string, OpeningScoringResult>();
    results.forEach(r => map.set(r.candidateId, r));
    return map;
  }

  private getCacheKey(req: OpeningScoringRequest): string {
    return globalLLMCache.generateCacheKey('OPENING_SCORER', { id: req.candidate.id, mode: req.scoringMode, synopsis: req.manuscript.synopsis.slice(0, 200), genre: req.manuscript.genre });
  }

  private fromFixture(req: OpeningScoringRequest, profile: OpeningScoringResult['profile']): OpeningScoringResult {
    const base = readFixture();
    const scores = ensureAllScores(base.scores, req.candidate);
    return {
      candidateId: req.candidate.id,
      scores,
      analysis: base.analysis,
      confidence: 0.9,
      profile,
    };
  }
}

function parseOpeningScores(text: string, jsonUnknown: unknown): z.infer<typeof ScoreSchema> {
  const candidate = (jsonUnknown !== undefined && jsonUnknown !== null) ? jsonUnknown : (safeExtractJSON(text) ?? {});
  const parsed = ScoreSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  // try common alt shape: { scores:{...}, analysis:{...} }
  const fallback = safeExtractJSON(text);
  const parsed2 = ScoreSchema.safeParse(fallback);
  if (parsed2.success) return parsed2.data;
  // minimal fallback
  return { scores: { hookStrength: 0.5, marketAppeal: 0.5, agentReadability: 0.5, clarityScore: 0.5, voiceDistinction: 0.5 }, strengths: [], weaknesses: [], suggestions: [] };
}

function ensureAllScores(incoming: OpeningScoringResult['scores'], candidate: OpeningCandidate): OpeningScoringResult['scores'] {
  return {
    hookStrength: clamp01(incoming.hookStrength ?? candidate.hookScore ?? 0.5),
    marketAppeal: clamp01(incoming.marketAppeal ?? Math.min(1, 0.5 + candidate.actionDensity * 0.3 + candidate.mysteryQuotient * 0.2)),
    agentReadability: clamp01(incoming.agentReadability ?? (candidate.dialogueRatio > 0.3 ? 0.7 : 0.5)),
    clarityScore: clamp01(incoming.clarityScore ?? (candidate.mysteryQuotient < 0.2 ? 0.7 : 0.5)),
    voiceDistinction: clamp01(incoming.voiceDistinction ?? 0.5),
  };
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); }

function safeExtractJSON(text: string): unknown { try { const s = text.indexOf('{'); const e = text.lastIndexOf('}'); if (s>=0 && e>s) return JSON.parse(text.slice(s,e+1)); } catch { /* ignore */ } return undefined; }

function isOffline(): boolean { const val = readEnv('LLM_OFFLINE'); return val === '1' || String(val).toLowerCase() === 'true'; }
function readEnv(name: string): string | undefined { // esm safe env reader
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}

function readFixture(): { scores: OpeningScoringResult['scores']; analysis: OpeningScoringResult['analysis'] } {
  try {
    const data = JSON.parse(fixtureRaw) as unknown;
    // Allow either default export style or direct object
    const obj = (data && typeof data === 'object' && 'default' in (data as Record<string, unknown>))
      ? (data as Record<string, unknown>).default as unknown
      : data;
    return obj as { scores: OpeningScoringResult['scores']; analysis: OpeningScoringResult['analysis'] };
  } catch {
    return { scores: { hookStrength: 0.7, marketAppeal: 0.6, agentReadability: 0.7, clarityScore: 0.7, voiceDistinction: 0.6 }, analysis: { strengths: [], weaknesses: [], suggestions: [] } };
  }
}

export default OpeningScorer;
