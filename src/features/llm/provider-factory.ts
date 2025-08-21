import { MockCaller } from './providers.js';
import type { LLMCaller } from './providers.js';

export interface ProviderMetadata {
  id: string; // vendor:model
  vendor: string;
  model: string;
  maxContext: number; // tokens
  costPer1M: { input: number; output: number }; // USD
}

function parseVendorModel(id: string): { vendor: string; model: string } {
  const [vendor, model] = id.split(':');
  return { vendor: vendor || 'mock', model: model || 'generic' };
}

export class ProviderFactory {
  private static registry: Map<string, () => LLMCaller> = new Map();
  private static metadata: Map<string, ProviderMetadata> = new Map();

  static register(vendorModel: string, factory: () => LLMCaller, meta?: Partial<ProviderMetadata>): void {
    this.registry.set(vendorModel, factory);
    if (meta) {
      const { vendor, model } = parseVendorModel(vendorModel.replace(':*', ':generic'));
      this.metadata.set(vendorModel, {
        id: `${vendor}:${model}`,
        vendor,
        model,
        maxContext: meta.maxContext ?? 200_000,
        costPer1M: meta.costPer1M || { input: 2, output: 2 },
      });
    }
  }

  static create(vendorModel: string): LLMCaller {
    const offline = (readEnv('LLM_OFFLINE') || '0') === '1';
    if (offline) return new MockCaller('FAST_ITERATE', 'mock:offline');
    const exact = this.registry.get(vendorModel);
    if (exact) return exact();
    // Wildcard support vendor:* registration
    const [vendor] = vendorModel.split(':');
    const wildcard = this.registry.get(`${vendor}:*`);
    if (wildcard) return wildcard();
    return new MockCaller('FAST_ITERATE', vendorModel || 'mock:missing');
  }

  static getMetadata(vendorModel: string): ProviderMetadata {
    const meta = this.metadata.get(vendorModel) || this.metadata.get(vendorModel.split(':')[0] + ':*');
    if (meta) return meta;
    const { vendor, model } = parseVendorModel(vendorModel);
    return { id: vendorModel, vendor, model, maxContext: 200_000, costPer1M: { input: 2, output: 2 } };
  }
}

function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}

// Register mock provider
ProviderFactory.register('mock:*', () => new MockCaller('FAST_ITERATE', 'mock:generic'), { maxContext: 128_000, costPer1M: { input: 2, output: 2 } });

// Stub registrations for future real providers
ProviderFactory.register('anthropic:*', () => new MockCaller('STRUCTURE_LONGCTX', 'anthropic:claude-4-sonnet'), { maxContext: 200_000, costPer1M: { input: 15, output: 75 } });
ProviderFactory.register('openai:*', () => new MockCaller('FAST_ITERATE', 'openai:gpt-5-mini'), { maxContext: 128_000, costPer1M: { input: 10, output: 30 } });
ProviderFactory.register('google:*', () => new MockCaller('JUDGE_SCORER', 'google:gemini-2.5-pro'), { maxContext: 200_000, costPer1M: { input: 10, output: 40 } });
