import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '@/features/llm/providers/anthropic';
import { OpenAIProvider } from '@/features/llm/providers/openai';

function readEnv(name: string): string | undefined {
  const metaEnv = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined);
  return (metaEnv && metaEnv[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}
const RUN_LIVE = readEnv('RUN_LIVE_LLM') === '1';

describe('Live Providers (optional)', () => {
  it.skipIf(!RUN_LIVE || !process.env.ANTHROPIC_API_KEY)('anthropic call returns text', async () => {
    const p = new AnthropicProvider('anthropic:claude-3-5-sonnet-20241022');
    const res = await p.call({ prompt: 'Say hi', profile: 'FAST_ITERATE' });
    expect(res.text.length).toBeGreaterThan(0);
    expect(res.usage.in + res.usage.out).toBeGreaterThan(0);
  }, 30_000);

  it.skipIf(!RUN_LIVE || !process.env.OPENAI_API_KEY)('openai call returns text', async () => {
    const p = new OpenAIProvider('openai:gpt-4-turbo');
    const res = await p.call({ prompt: 'Say hi', profile: 'FAST_ITERATE' });
    expect(res.text.length).toBeGreaterThan(0);
    expect(res.usage.in + res.usage.out).toBeGreaterThan(0);
  }, 30_000);
});
