import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Profile, CallArgs } from '@/features/llm/providers';
import { ProviderFactory } from '@/features/llm/provider-factory';

type Props = { profileId: Profile; prompt: string; system?: string; temperature?: number };

export function StreamingResponse({ profileId, prompt, system, temperature }: Props) {
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [tokens, setTokens] = useState({ in: 0, out: 0 });
  const [cost, setCost] = useState(0);
  const cancelRef = useRef<{ cancel: () => void } | null>(null);

  const args: CallArgs = useMemo(() => ({ profile: profileId, prompt, system, temperature }), [profileId, prompt, system, temperature]);

  useEffect(() => {
    let cancelled = false;
    const provider = ProviderFactory.create(profileToDefaultModel(profileId));
    setRunning(true); setError(undefined); setText(''); setTokens({ in: 0, out: 0 }); setCost(0);

    const controller = new AbortController();
    cancelRef.current = { cancel: () => controller.abort() };

    (async () => {
      // Try streaming if provider has streamText; else fall back to call
      const streamable = (provider as unknown as { streamText?: (a: CallArgs) => AsyncIterable<string> }).streamText;
      try {
        if (streamable) {
          let outTokens = 0;
          for await (const chunk of streamable.call(provider, args)) {
            if (cancelled) break;
            setText(prev => prev + chunk);
            outTokens += Math.ceil((chunk || '').length / 4);
            setTokens(prev => ({ ...prev, out: outTokens }));
          }
          // finalize cost estimate
          const inTok = Math.ceil((args.prompt || '').length / 4);
          setTokens({ in: inTok, out: outTokens });
          setCost(provider.estimateCost({ input: inTok, output: outTokens }));
        } else {
          const res = await provider.call<string>(args);
          if (cancelled) return;
          setText(res.text);
          setTokens({ in: res.usage.in, out: res.usage.out });
          setCost(provider.estimateCost({ input: res.usage.in, output: res.usage.out }));
        }
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
      } finally {
        if (!cancelled) setRunning(false);
      }
    })();

    return () => { cancelled = true; cancelRef.current = null; };
  }, [profileId, args]);

  const onCancel = () => { cancelRef.current?.cancel(); setRunning(false); };

  return (
    <div className="rounded border p-3 text-sm bg-white/70 dark:bg-neutral-900/70">
      <div className="flex items-center gap-2 mb-2">
        <strong className="text-neutral-700 dark:text-neutral-200">Streaming</strong>
        {running && <span className="animate-pulse text-blue-600">●</span>}
        {!running && text && <span className="text-green-600">done</span>}
        {error && <span className="text-red-600">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <span title="tokens" className="text-neutral-500">{tokens.in} ▸ {tokens.out}</span>
          <span title="estimated cost" className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">${cost.toFixed(4)}</span>
          {running && <button onClick={onCancel} className="px-2 py-1 rounded bg-neutral-200 dark:bg-neutral-800">Cancel</button>}
        </div>
      </div>
      <div className="whitespace-pre-wrap font-mono text-xs min-h-[4rem]">
        {text || (running ? '…' : 'No output')}
      </div>
    </div>
  );
}

function readEnv(name: string): string | undefined {
  const metaEnv = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined);
  return (metaEnv && metaEnv[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}

function profileToDefaultModel(profile: Profile): string {
  switch (profile) {
    case 'STRUCTURE_LONGCTX': return readEnv('LLM_PROFILE__STRUCTURE') || 'anthropic:claude-3-5-sonnet-20241022';
    case 'FAST_ITERATE': return readEnv('LLM_PROFILE__FAST') || 'openai:gpt-5-mini';
    case 'JUDGE_SCORER': return readEnv('LLM_PROFILE__JUDGE') || 'google:gemini-2.5-pro';
    default: return 'openai:gpt-5-mini';
  }
}

export default StreamingResponse;
