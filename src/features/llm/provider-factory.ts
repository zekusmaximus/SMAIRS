import { MockCaller } from './providers.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/google.js';
import type { LLMCaller } from './providers.js';

export interface ProviderMetadata {
  id: string; // vendor:model
  vendor: string;
  model: string;
  maxContext: number; // tokens
  costPer1M: { input: number; output: number }; // USD
  capabilities?: string[]; // e.g., ['streaming','json','cache_control']
}

function parseVendorModel(id: string): { vendor: string; model: string } {
  const [vendor, model] = id.split(':');
  return { vendor: vendor || 'mock', model: model || 'generic' };
}

export class ProviderFactory {
  private static registry: Map<string, (modelId: string) => LLMCaller> = new Map();
  private static metadata: Map<string, ProviderMetadata> = new Map();
  private static activeOverrides: Map<string, string> = new Map(); // profile->modelId

  static register(vendorModel: string, factory: (modelId: string) => LLMCaller, meta?: Partial<ProviderMetadata>): void {
    this.registry.set(vendorModel, factory);
    if (meta) {
      const { vendor, model } = parseVendorModel(vendorModel.replace(':*', ':generic'));
      this.metadata.set(vendorModel, {
        id: `${vendor}:${model}`,
        vendor,
        model,
        maxContext: meta.maxContext ?? 200_000,
        costPer1M: meta.costPer1M || { input: 2, output: 2 },
        capabilities: meta.capabilities || [],
      });
    }
  }

  static create(vendorModel: string): LLMCaller {
    const offline = (readEnv('LLM_OFFLINE') || '0') === '1';
    if (offline) return new MockCaller('FAST_ITERATE', 'mock:offline');
    // In browser/Vite or Tauri dev webview, direct fetch to vendor APIs will hit CORS.
    // Unless explicitly allowed, force mock provider to avoid noisy failures.
    if (shouldForceOfflineInRenderer()) {
      console.warn('[llm] Forcing offline mock provider in browser dev (CORS protection). Set VITE_ALLOW_BROWSER_LLM=1 to enable direct API calls.');
      return new MockCaller('FAST_ITERATE', 'mock:browser-dev');
    }
    // API key validation: return MockCaller with clear diagnostics if missing keys
    const { vendor: vend } = parseVendorModel(vendorModel);
    if (vend === 'anthropic' && !readEnv('ANTHROPIC_API_KEY')) return new MockCaller('FAST_ITERATE', 'mock:anthropic-missing-key');
    if (vend === 'openai' && !readEnv('OPENAI_API_KEY')) return new MockCaller('FAST_ITERATE', 'mock:openai-missing-key');
    if (vend === 'google' && !(readEnv('GOOGLE_API_KEY') || readEnv('GEMINI_API_KEY'))) return new MockCaller('FAST_ITERATE', 'mock:google-missing-key');
    const exact = this.registry.get(vendorModel);
    if (exact) return exact(vendorModel);
    // Wildcard support vendor:* registration
    const [vendorName] = vendorModel.split(':');
    const wildcard = this.registry.get(`${vendorName}:*`);
    if (wildcard) return wildcard(vendorModel);
    return new MockCaller('FAST_ITERATE', vendorModel || 'mock:missing');
  }

  static getMetadata(vendorModel: string): ProviderMetadata {
    const meta = this.metadata.get(vendorModel) || this.metadata.get(vendorModel.split(':')[0] + ':*');
    if (meta) return meta;
    const { vendor, model } = parseVendorModel(vendorModel);
    return { id: vendorModel, vendor, model, maxContext: 200_000, costPer1M: { input: 2, output: 2 }, capabilities: [] };
  }

  static health(modelId: string): { id: string; configured: boolean; apiKeyPresent: boolean; capabilities: string[]; maxContext: number; costPer1M: { input: number; output: number } } {
    const meta = this.getMetadata(modelId);
    const vendor = meta.vendor;
    const apiKeyPresent =
      vendor === 'anthropic' ? !!readEnv('ANTHROPIC_API_KEY')
      : vendor === 'openai' ? !!readEnv('OPENAI_API_KEY')
      : vendor === 'google' ? (!!readEnv('GOOGLE_API_KEY') || !!readEnv('GEMINI_API_KEY'))
      : true;
    return { id: modelId, configured: true, apiKeyPresent, capabilities: meta.capabilities || [], maxContext: meta.maxContext, costPer1M: meta.costPer1M };
  }

  // --- Runtime switching helpers -----------------------------------
  static setProfileOverride(profile: string, modelId: string | undefined): void {
    if (!modelId) { this.activeOverrides.delete(profile); return; }
    this.activeOverrides.set(profile, modelId);
  }
  static getProfileOverride(profile: string): string | undefined { return this.activeOverrides.get(profile); }
}

function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}

// Detect when we're running in a browser (or Tauri webview) hitting the Vite dev server,
// where cross-origin requests to vendor APIs will fail due to CORS.
function shouldForceOfflineInRenderer(): boolean {
  const allow = ((readEnv('ALLOW_BROWSER_LLM') || readEnv('VITE_ALLOW_BROWSER_LLM') || '').toLowerCase() === '1');
  if (allow) return false;
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  if (!isBrowser) return false;
  const origin = (window.location && window.location.origin) || '';
  const isViteDev = /:\/\/localhost:5173$/.test(origin) || /:\/\/127\.0\.0\.1:5173$/.test(origin);
  // In Tauri dev, origin is also the Vite dev URL; treat it the same unless explicitly allowed.
  return isViteDev;
}

// Register mock provider
ProviderFactory.register('mock:*', (modelId) => new MockCaller('FAST_ITERATE', `mock:${modelId.split(':')[0] || 'generic'}`), { maxContext: 128_000, costPer1M: { input: 2, output: 2 }, capabilities: ['streaming','json'] });

// Register real providers with capability metadata
ProviderFactory.register('anthropic:*', (modelId) => new AnthropicProvider(modelId), { maxContext: 1_000_000, costPer1M: { input: 3, output: 15 }, capabilities: ['streaming','json','cache_control'] });
ProviderFactory.register('openai:*', (modelId) => new OpenAIProvider(modelId), { maxContext: 128_000, costPer1M: { input: 10, output: 30 }, capabilities: ['streaming','json'] });
ProviderFactory.register('google:*', (modelId) => new GeminiProvider(modelId), { maxContext: 1_000_000, costPer1M: { input: 10, output: 40 }, capabilities: ['streaming','json','grounding','safety'] });

// Helper to resolve providers respecting offline mode
export function resolveProvider(modelId: string): LLMCaller {
  const offline = (readEnv('LLM_OFFLINE') || '0') === '1';
  if (offline) return new MockCaller('FAST_ITERATE', 'mock:offline');
  return ProviderFactory.create(modelId);
}

// Optional startup validation
export function validateProvidersOnStartup(): void {
  const vendors = ['anthropic', 'openai', 'google'] as const;
  for (const v of vendors) {
    const ok = v === 'anthropic' ? !!readEnv('ANTHROPIC_API_KEY')
      : v === 'openai' ? !!readEnv('OPENAI_API_KEY')
      : !!(readEnv('GOOGLE_API_KEY') || readEnv('GEMINI_API_KEY'));
    if (!ok) {
      console.warn(`[llm] ${v} API key missing; calls will fall back to mock provider.`);
    }
  }
}

// Perform a best-effort validation when this module is loaded
validateProvidersOnStartup();
