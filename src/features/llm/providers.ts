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
  call<T>(args: { system?: string; prompt: string; schema?: unknown }): Promise<LLMResult<T>>;
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
class MockCaller implements LLMCaller {
  profile: Profile;
  modelId: string;
  constructor(profile: Profile, modelId: string) {
    this.profile = profile;
    this.modelId = modelId;
  }
  async call<T>(args: { system?: string; prompt: string; schema?: unknown }): Promise<LLMResult<T>> {
    const base = `[MOCK:${this.profile}:${this.modelId}]`;
    const text = `${base} ${args.prompt.slice(0, 160)}`;
    let json: unknown = undefined;
    if (args.schema) {
      // naive fake JSON adhering to a very small subset: if object with string props, fill placeholders
      try {
        if (args.schema && typeof args.schema === 'object' && 'safeParse' in args.schema) {
          // Zod-like schema: attempt to build a shape by inspecting ._def if available (best-effort)
          // We avoid deep introspection here; just return an empty object.
          json = {};
        }
      } catch {
        json = {};
      }
    }
    return { text, json: json as T, usage: { in: args.prompt.length / 4, out: text.length / 4 }, raw: { mock: true } };
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
