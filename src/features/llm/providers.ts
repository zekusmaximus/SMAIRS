// Capability profile abstraction (Phase 1 stub implementation)
// Profiles decouple the rest of the codebase from concrete provider model IDs.

export type Profile = 'STRUCTURE_LONGCTX' | 'FAST_ITERATE' | 'JUDGE_SCORER';

export interface LLMResult<T = unknown> {
  text: string;
  json?: T;
  usage: { in: number; out: number }; // normalized token counts
  raw: unknown; // provider raw response for debugging
}

export interface LLMCaller {
  /** Basic single call */
  call<T>(args: CallArgs): Promise<LLMResult<T>>;
  /** Call with retry + backoff */
  callWithRetry<T>(args: CallArgs, maxRetries?: number): Promise<LLMResult<T>>;
  /** Fire multiple prompts (subject to provider rate limits) */
  callBatch<T>(requests: CallArgs[]): Promise<LLMResult<T>[]>;
  /** Rough cost estimator (USD) for budgeting */
  estimateCost(tokens: { input: number; output: number }): number;
}

export interface CallArgs {
  system?: string;
  prompt: string;
  schema?: unknown; // zod schema (optional) – mock ignores shape aside from returning object
  profile?: Profile; // used by mock deterministic generation
  temperature?: number;
}

// Environment variable names for overrides
const ENV_MAP: Record<Profile, string> = {
  STRUCTURE_LONGCTX: 'LLM_PROFILE__STRUCTURE',
  FAST_ITERATE: 'LLM_PROFILE__FAST',
  JUDGE_SCORER: 'LLM_PROFILE__JUDGE',
};

// Default concrete models (can change without refactoring callers)
const DEFAULT_MODELS: Record<Profile, string> = {
  STRUCTURE_LONGCTX: 'anthropic:claude-4-sonnet',
  FAST_ITERATE: 'openai:gpt-5-mini',
  JUDGE_SCORER: 'google:gemini-2.5-pro',
};

function readEnv(name: string): string | undefined {
  // In browser/tauri front-end process, import.meta.env is used; fallback to process.env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}

function getModelId(profile: Profile): string {
  return readEnv(ENV_MAP[profile]) || DEFAULT_MODELS[profile];
}

// Simple deterministic mock for offline mode
export class MockCaller implements LLMCaller {
  profile: Profile;
  modelId: string;
  private static maxConcurrent = 2; // global provider rate limit
  private static active = 0;
  private static queue: (() => void)[] = [];
  constructor(profile: Profile, modelId: string) {
    this.profile = profile;
    this.modelId = modelId;
  }

  async call<T>(args: CallArgs): Promise<LLMResult<T>> {
    await this.acquire();
    const profile = args.profile || this.profile;
    const text = this.generateText(profile, args.prompt);
  const jsonUnknown = this.generateMockResponse(profile, args.prompt);
  const result: LLMResult<T> = { text, json: jsonUnknown as T, usage: { in: Math.round(args.prompt.length / 4), out: Math.round(text.length / 4) }, raw: { mock: true, profile } };
    this.release();
    return result;
  }

  async callWithRetry<T>(args: CallArgs, maxRetries = 2): Promise<LLMResult<T>> {
    let attempt = 0;
    // Mock never fails, but keep structure for interface parity.
    while (true) {
      try {
        return await this.call<T>(args);
      } catch (err) {
        attempt++;
        if (attempt > maxRetries) throw err;
        await new Promise(r => setTimeout(r, 50 * attempt));
      }
    }
  }

  async callBatch<T>(requests: CallArgs[]): Promise<LLMResult<T>[]> {
    return Promise.all(requests.map(r => this.call<T>(r)));
  }

  estimateCost(tokens: { input: number; output: number }): number {
    // Mock: assume flat $2 / 1M tokens
    const total = (tokens.input || 0) + (tokens.output || 0);
    return (total / 1_000_000) * 2;
  }

  // --- Deterministic mock generation ------------------------------------
  private generateText(profile: Profile, prompt: string): string {
    return `[MOCK:${profile}:${this.modelId}] ${prompt.slice(0, 120)} ...`;
  }

  private hashToSeed(str: string): number {
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  private prng(seed: number): () => number {
    let s = seed || 1;
    return () => {
      // xorshift32
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const out = (s >>> 0) / 4294967296;
      return out;
    };
  }

  private generateMockResponse(profile: Profile, prompt: string): unknown { // schema intentionally ignored in mock
    switch (profile) {
      case 'STRUCTURE_LONGCTX':
        return this.generateStructuralMock(prompt);
      case 'FAST_ITERATE':
        return this.generateScoringMock(prompt);
      case 'JUDGE_SCORER':
        return this.generateJudgmentMock(prompt);
      default:
        return {};
    }
  }

  private generateStructuralMock(prompt: string) {
    const seed = this.hashToSeed(prompt);
    const rnd = this.prng(seed);
    const hotspotCount = 5 + Math.floor(rnd() * 3);
    const hotspots = Array.from({ length: hotspotCount }).map((_, i) => ({
      sceneId: `sc${i + 1}`,
      tensionScore: Number((0.6 + rnd() * 0.4).toFixed(3)),
      type: (['action', 'revelation', 'emotional', 'cliffhanger'] as const)[Math.floor(rnd() * 4)],
      startOffset: i * 1000,
      endOffset: i * 1000 + 500,
    }));
    const byChapter = new Map<string, number>();
    for (let c = 1; c <= 5; c++) byChapter.set(`ch0${c}`, Number((0.4 + rnd() * 0.5).toFixed(3)));
    const slowPoints = Array.from({ length: 2 }).map((_, i) => ({ sceneId: `scSlow${i + 1}`, offset: 5000 + i * 800 }));
    const recommendations = ['Tighten mid-act pacing', 'Elevate emotional stakes in climax'];
    const themes = [
      { theme: 'Identity', confidence: Number((0.7 + rnd() * 0.2).toFixed(3)) },
      { theme: 'Redemption', confidence: Number((0.6 + rnd() * 0.3).toFixed(3)) },
    ];
    const revealImportance = new Map<string, number>();
    for (let r = 0; r < 6; r++) revealImportance.set(`rv${r + 1}`, Number((rnd()).toFixed(3)));
    const synopsisWords = Array.from({ length: 500 }).map((_, i) => `word${(i + Math.floor(rnd() * 10))}`);
    return {
      hotspots,
      pacing: { overall: Number((0.5 + rnd() * 0.4).toFixed(3)), byChapter, slowPoints, recommendations },
      themes,
      globalSynopsis: synopsisWords.join(' '),
      revealImportance,
    };
  }

  private generateScoringMock(prompt: string) {
    const seed = this.hashToSeed(prompt);
    const rnd = this.prng(seed);
    const base = () => Number(rnd().toFixed(3));
    return {
      hookScore: base(),
      actionDensity: base(),
      mysteryQuotient: base(),
      characterIntros: Math.floor(rnd() * 4),
      confidence: Number((0.6 + rnd() * 0.35).toFixed(3)),
      reasoning: 'Mock reasoning suppressed',
    };
  }

  private generateJudgmentMock(prompt: string) {
    const seed = this.hashToSeed(prompt);
    const rnd = this.prng(seed);
    const candidateCount = Math.max(2, Math.min(5, 2 + Math.floor(rnd() * 4)));
    const rankings = Array.from({ length: candidateCount }).map((_, i) => ({
      candidateId: `cand${i + 1}`,
      rank: i + 1,
      strengths: ['Strong hook', 'Distinct voice'].slice(0, 1 + Math.floor(rnd() * 2)),
      weaknesses: ['Pacing drag'].slice(0, 1),
      fixableIssues: ['Clarify stakes'],
    }));
    const marketAppeal = new Map<string, number>();
    const agentReadability = new Map<string, number>();
    rankings.forEach(r => { marketAppeal.set(r.candidateId, Number(rnd().toFixed(3))); agentReadability.set(r.candidateId, Number(rnd().toFixed(3))); });
    const crossValidation = { agreement: Number((0.7 + rnd() * 0.2).toFixed(3)), divergences: [] as string[] };
    return { rankings, marketAppeal, agentReadability, crossValidation, winnerRationale: 'Top candidate balances hook, clarity, and momentum.' };
  }

  private async acquire(): Promise<void> {
    if (MockCaller.active < MockCaller.maxConcurrent) {
      MockCaller.active++;
      return;
    }
    await new Promise<void>(res => MockCaller.queue.push(res));
    MockCaller.active++;
  }
  private release() {
    MockCaller.active--;
    const n = MockCaller.queue.shift();
    if (n) n();
  }
}

// Future: dynamic import provider-specific adapters (anthropic.ts, openai.ts, google.ts)
// For now we only return a mock or throw if offline disabled to avoid partial implementations.

export function resolveProfile(p: Profile): LLMCaller {
  const modelId = getModelId(p);
  const offline = (readEnv('LLM_OFFLINE') || '0') === '1';
  if (offline) return new MockCaller(p, modelId);
  // Phase 1 stub – real providers to be implemented in Phase 2.
  return new MockCaller(p, modelId);
}

export function currentProfileModelMap(): Record<Profile, string> {
  return {
    STRUCTURE_LONGCTX: getModelId('STRUCTURE_LONGCTX'),
    FAST_ITERATE: getModelId('FAST_ITERATE'),
    JUDGE_SCORER: getModelId('JUDGE_SCORER'),
  };
}
