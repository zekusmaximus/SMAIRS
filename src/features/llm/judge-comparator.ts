import { resolveProfile } from './providers.js';
import { PROMPTS } from './prompt-templates.js';
import { z } from 'zod';

export interface ScoredCandidate { candidateId: string; hookScore: number; actionDensity: number; mysteryQuotient: number; characterIntros: number; confidence: number; }
export interface MarketAppealCriteria { originality: number; clarity: number; pace: number; voice: number; }
export interface JudgeScoringRequest { candidates: ScoredCandidate[]; criteria: MarketAppealCriteria; genre: string; targetAudience: string; }
export interface CandidateRanking { candidateId: string; rank: number; strengths: string[]; weaknesses: string[]; fixableIssues: string[]; }
export interface ValidationMetrics { agreement: number; divergences: string[]; }
export interface JudgeScoringResponse { rankings: CandidateRanking[]; marketAppeal: Map<string, number>; agentReadability: Map<string, number>; crossValidation: ValidationMetrics; winnerRationale: string; }

const Schema = z.object({
  rankings: z.array(z.object({ candidateId: z.string(), rank: z.number().int().min(1), strengths: z.array(z.string()), weaknesses: z.array(z.string()), fixableIssues: z.array(z.string()) })),
  marketAppeal: z.record(z.number().min(0).max(1)).optional(),
  agentReadability: z.record(z.number().min(0).max(1)).optional(),
  crossValidation: z.object({ agreement: z.number().min(0).max(1), divergences: z.array(z.string()) }).optional(),
  winnerRationale: z.string().optional(),
});

export async function judgeCandidates(req: JudgeScoringRequest): Promise<JudgeScoringResponse> {
  const caller = resolveProfile('JUDGE_SCORER');
  const { system, template, temperature } = PROMPTS.JUDGE;
  const prompt = template(req);
  const result = await caller.callWithRetry({ system, prompt, temperature, profile: 'JUDGE_SCORER' }, 2);
  const json = (result.json || safeExtractJSON(result.text));
  const parsed = Schema.safeParse(json);
  if (!parsed.success) {
    return baseline(req, 'Parsing failed');
  }
  const data = parsed.data;
  const rankings = data.rankings.sort((a, b) => a.rank - b.rank).slice(0, req.candidates.length);
  const winnerRationale = data.winnerRationale || (rankings[0] ? `Selected ${rankings[0].candidateId}` : '');
  return {
    rankings,
    marketAppeal: mapFromObj(data.marketAppeal || {}),
    agentReadability: mapFromObj(data.agentReadability || {}),
    crossValidation: data.crossValidation || { agreement: 1, divergences: [] },
    winnerRationale,
  };
}

function baseline(req: JudgeScoringRequest, reason: string): JudgeScoringResponse {
  const sorted = req.candidates.slice().sort((a, b) => (b.hookScore + b.actionDensity) - (a.hookScore + a.actionDensity));
  const rankings: CandidateRanking[] = sorted.map((c, i) => ({ candidateId: c.candidateId, rank: i + 1, strengths: ['hook'], weaknesses: [], fixableIssues: [] }));
  const map = new Map<string, number>(); sorted.forEach((c, i) => map.set(c.candidateId, Math.max(0, 1 - i * 0.1)));
  return { rankings, marketAppeal: map, agentReadability: map, crossValidation: { agreement: 1, divergences: [reason] }, winnerRationale: reason };
}

function mapFromObj(obj: Record<string, number>): Map<string, number> { const m = new Map<string, number>(); for (const k of Object.keys(obj)) m.set(k, obj[k]!); return m; }
function safeExtractJSON(text: string): unknown { try { const s = text.indexOf('{'); const e = text.lastIndexOf('}'); if (s>=0 && e>s) return JSON.parse(text.slice(s,e+1)); } catch { /* swallow parse error */ } return {}; }
