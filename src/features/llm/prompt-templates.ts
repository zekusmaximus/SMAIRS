import type { Profile } from './providers.js';
import type { Scene, Reveal } from '../manuscript/types.js';

// Minimal interface declarations to avoid circular imports across new modules
export interface StructuralAnalysisRequest { manuscript: string; scenes: Scene[]; reveals: Reveal[]; mode: 'full' | 'incremental'; }
export interface FastScoringRequest { candidate: OpeningCandidate; globalSynopsis: string; focusMetrics: ('hook'|'action'|'mystery'|'character')[]; }
export interface JudgeScoringRequest { candidates: unknown[]; criteria: unknown; genre: string; targetAudience: string; }

type TemplateFn<T> = (req: T) => string;

interface PromptSpec<T> { system: string; template: TemplateFn<T>; temperature: number; }

interface PromptRegistry {
  STRUCTURE: PromptSpec<StructuralAnalysisRequest>;
  SCORING: PromptSpec<FastScoringRequest>;
  JUDGE: PromptSpec<JudgeScoringRequest>;
}

export const PROMPTS: PromptRegistry = {
  STRUCTURE: {
    system: 'You are a manuscript structure analyst specializing in commercial fiction. Provide concise JSON only. No explanations, no internal reasoning.',
    temperature: 0.3,
    template: (req: StructuralAnalysisRequest) => {
      const sceneSumm = req.scenes.slice(0, 40).map(s => ({ id: s.id, wc: s.wordCount, ch: s.chapterId })).slice(0, 40);
      return `TASK: Structural pass (${req.mode}).\nSCENES_META=${JSON.stringify(sceneSumm)}\nREQ_JSON_SCHEMA={"hotspots":[{"sceneId":"string","tensionScore":0.0,"type":"action|revelation|emotional|cliffhanger","startOffset":0,"endOffset":0}],"pacing":{"overall":0.0,"byChapter":{"ch01":0.0},"slowPoints":[{"sceneId":"string","offset":0}],"recommendations":["string"]},"themes":[{"theme":"string","confidence":0.0}],"globalSynopsis":"string(<=500 words)","revealImportance":{"revealId":0.0}}\nRETURN ONLY JSON.`;
    }
  },
  SCORING: {
    system: 'You are a rapid manuscript opening scorer. Output strict JSON only. No commentary.',
    temperature: 0.5,
    template: (req: FastScoringRequest) => {
      return `Evaluate opening candidate ${req.candidate.id}. Focus metrics=${req.focusMetrics.join(',')} SYNOPSIS=${req.globalSynopsis.slice(0, 800)} JSON_SCHEMA={"hookScore":0.0,"actionDensity":0.0,"mysteryQuotient":0.0,"characterIntros":0,"confidence":0.0,"reasoning":"string(optional)"} OUTPUT JSON ONLY.`;
    }
  },
  JUDGE: {
    system: 'You are a comparative manuscript judge with market expertise. Output concise JSON only.',
    temperature: 0.7,
    template: (req: JudgeScoringRequest) => `Compare ${req.candidates.length} candidates for genre=${req.genre} audience=${req.targetAudience}. JSON_SCHEMA={"rankings":[{"candidateId":"string","rank":1,"strengths":[""],"weaknesses":[""],"fixableIssues":[""]}],"marketAppeal":{"candidateId":0.0},"agentReadability":{"candidateId":0.0},"crossValidation":{"agreement":0.0,"divergences":[""]},"winnerRationale":"string"} OUTPUT JSON ONLY.`
  }
};

export function profileToPromptKey(profile: Profile): keyof typeof PROMPTS {
  if (profile === 'STRUCTURE_LONGCTX') return 'STRUCTURE';
  if (profile === 'FAST_ITERATE') return 'SCORING';
  return 'JUDGE';
}

// Opening Scorer specialized prompts
import type { OpeningCandidate } from '../manuscript/opening-candidates.js';

export const OPENING_SCORER_PROMPTS = {
  QUICK: {
    system: "You are a literary agent's first reader. Evaluate opening pages for immediate hook and professional appeal. Be harsh but fair. Return strict JSON.",
    temperature: 0.3,
    template: (params: { candidate: { id: string; totalWords: number; hookScore: number; actionDensity: number; mysteryQuotient: number; dialogueRatio: number }; synopsis: string; genre: string }) => {
      const { candidate, synopsis, genre } = params;
      return `GENRE: ${genre}\nSYNOPSIS (context): ${synopsis.slice(0, 300)}\n\nOPENING META:\n- id: ${candidate.id}\n- totalWords: ${candidate.totalWords}\n- hookScore(seed): ${candidate.hookScore}\n- actionDensity: ${candidate.actionDensity}\n- mysteryQuotient: ${candidate.mysteryQuotient}\n- dialogueRatio: ${candidate.dialogueRatio}\n\nScore these dimensions (0.0-1.0):\n- hookStrength: Does it grab immediately?\n- agentReadability: Would an agent keep reading?\n- clarityScore: Is it immediately clear?\n- voiceDistinction: Is the voice unique?\n\nReturn JSON only: {"scores": {"hookStrength":0-1,"agentReadability":0-1,"clarityScore":0-1,"voiceDistinction":0-1}, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."]}`;
    }
  },
  THOROUGH: {
    system: 'You are a senior acquisitions editor. Analyze openings with full structural context. Return strict JSON.',
    temperature: 0.4,
    template: (params: { candidate: { id: string; totalWords: number; hookScore: number; actionDensity: number; mysteryQuotient: number; dialogueRatio: number }; synopsis: string; genre: string; audience: string }) => {
      const { candidate, synopsis, genre, audience } = params;
      return `GENRE: ${genre}\nAUDIENCE: ${audience}\nSYNOPSIS (full context excerpt <=800): ${synopsis.slice(0, 800)}\n\nOPENING META:\n- id: ${candidate.id}\n- totalWords: ${candidate.totalWords}\n- hookScore(seed): ${candidate.hookScore}\n- actionDensity: ${candidate.actionDensity}\n- mysteryQuotient: ${candidate.mysteryQuotient}\n- dialogueRatio: ${candidate.dialogueRatio}\n\nEvaluate and score 0.0-1.0: hookStrength, marketAppeal, agentReadability, clarityScore, voiceDistinction.\nReturn JSON only: {"scores": {"hookStrength":0-1,"marketAppeal":0-1,"agentReadability":0-1,"clarityScore":0-1,"voiceDistinction":0-1}, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."]}`;
    }
  },
  COMPARATIVE: {
    system: 'You are a comparative first-page judge using genre standards and market comps. Return strict JSON.',
    temperature: 0.5,
    template: (params: { candidate: { id: string; totalWords: number; hookScore: number; actionDensity: number; mysteryQuotient: number; dialogueRatio: number }; synopsis: string; genre: string; audience: string }) => {
      const { candidate, synopsis, genre, audience } = params;
      return `GENRE: ${genre}\nAUDIENCE: ${audience}\nSYNOPSIS (<=400): ${synopsis.slice(0, 400)}\nOPENING META:\n- id: ${candidate.id}\n- totalWords: ${candidate.totalWords}\n- hookScore(seed): ${candidate.hookScore}\n- actionDensity: ${candidate.actionDensity}\n- mysteryQuotient: ${candidate.mysteryQuotient}\n- dialogueRatio: ${candidate.dialogueRatio}\n\nScore for agent-read first pass: hookStrength, marketAppeal, agentReadability, clarityScore, voiceDistinction (0.0-1.0).\nReturn JSON: {"scores": {"hookStrength":0-1,"marketAppeal":0-1,"agentReadability":0-1,"clarityScore":0-1,"voiceDistinction":0-1}, "strengths": [], "weaknesses": [], "suggestions": []}`;
    }
  }
};
