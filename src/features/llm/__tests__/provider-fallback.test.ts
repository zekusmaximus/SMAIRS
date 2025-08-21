import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../provider-factory.js';
import { ProviderAdapter } from '../provider-adapter.js';

// Simulate failure of primary by registering a provider that always throws for first attempt.
import type { LLMResult, CallArgs } from '../providers.js';

class FlakyMock {
  estimateCost() { return 0.000001; }
  async call<T>(args: CallArgs): Promise<LLMResult<T>> {
    return { text: 'PRIMARY_OK', usage: { in: 10, out: 2 }, raw: { args } } as unknown as LLMResult<T>;
  }
  async callBatch<T>(requests: CallArgs[]): Promise<LLMResult<T>[]> { return Promise.all(requests.map(r => this.call<T>(r))); }
  async callWithRetry<T>(args: CallArgs): Promise<LLMResult<T>> { return this.call<T>(args); }
}

class AlwaysFails {
  estimateCost() { return 0.000001; }
  async call<T>(/* no args */): Promise<LLMResult<T>> { throw new Error('always fails'); }
  async callBatch<T>(/* no requests */): Promise<LLMResult<T>[]> { return []; }
  async callWithRetry<T>(): Promise<LLMResult<T>> { return this.call<T>(); }
}

describe('provider fallback switching', () => {
  it('switches to fallback when primary exhausts retries', async () => {
    // Register test providers
    ProviderFactory.register('testPrimary:*', () => new AlwaysFails());
    ProviderFactory.register('testFallback:*', () => new FlakyMock());

    // Monkey patch adapter config for FAST_ITERATE profile
    const adapter = new ProviderAdapter();
    // Inject test config (bypass private)
  (adapter as unknown as { configs: Map<string, unknown> }).configs.set('FAST_ITERATE', { primary: 'testPrimary:bad', fallback: 'testFallback:ok', maxRetries: 0, timeout: 2000 });

  const res = await adapter.executeWithFallback('FAST_ITERATE', { prompt: 'Hello world short' });
    expect(res.text).toContain('PRIMARY_OK');
  });
});
