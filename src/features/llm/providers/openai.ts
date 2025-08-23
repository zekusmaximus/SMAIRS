import type { CallArgs, LLMCaller, LLMResult, Profile } from '../providers.js';
import { ProviderFactory } from '../provider-factory.js';
import { globalLLMCache } from '../cache-manager.js';

// --- Error types -----------------------------------------------------
export class OpenAIAPIError extends Error { status?: number; code?: string; raw?: unknown; constructor(msg: string, status?: number, code?: string, raw?: unknown) { super(msg); this.name = 'OpenAIAPIError'; this.status = status; this.code = code; this.raw = raw; } }
export class OpenAIAuthError extends OpenAIAPIError { constructor(msg = 'Invalid OpenAI API key', raw?: unknown) { super(msg, 401, 'authentication_error', raw); this.name = 'OpenAIAuthError'; } }
export class OpenAIRateLimitError extends OpenAIAPIError { retryAfterMs?: number; constructor(msg = 'OpenAI rate limit exceeded', retryAfterMs?: number, raw?: unknown) { super(msg, 429, 'rate_limit_exceeded', raw); this.name = 'OpenAIRateLimitError'; this.retryAfterMs = retryAfterMs; } }
export class OpenAINetworkError extends Error { constructor(msg: string, public cause?: unknown) { super(msg); this.name = 'OpenAINetworkError'; } }
export class OpenAIInvalidRequestError extends OpenAIAPIError { constructor(msg = 'Invalid request to OpenAI API', raw?: unknown) { super(msg, 400, 'invalid_request_error', raw); this.name = 'OpenAIInvalidRequestError'; } }

// --- Types -----------------------------------------------------------
interface OpenAIUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
interface OpenAIChoiceDelta { content?: string }
interface OpenAIStreamChunk { id?: string; object?: string; model?: string; choices?: Array<{ index: number; delta: OpenAIChoiceDelta; finish_reason?: string }>; }
interface OpenAIChatMessage { role: 'system'|'user'|'assistant'; content: string }
interface OpenAIResponse { id: string; model: string; object: string; choices: Array<{ index: number; message: { role: 'assistant'; content: string }; finish_reason?: string }>; usage?: OpenAIUsage }

// --- Utils -----------------------------------------------------------
function readEnv(name: string): string | undefined { const metaEnv = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string,string> }).env : undefined); return (metaEnv && metaEnv[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined); }
function logDebug(event: string, data: Record<string, unknown>) { const dbg = (readEnv('DEBUG') || '').toLowerCase(); if (dbg === '1' || dbg === 'true') console.debug(`[openai:${event}]`, JSON.stringify(data)); }

function estimateTokens(text: string): number {
  if (!text) return 0;
  const chars = text.length;
  const words = (text.match(/\S+/g) || []).length;
  // Heuristic blended: max(chars/4, words*1.3)
  return Math.max(Math.ceil(chars / 4), Math.ceil(words * 1.3));
}

export class OpenAIProvider implements LLMCaller {
  private apiUrl = (readEnv('OPENAI_API_URL') || 'https://api.openai.com/v1/chat/completions');
  private apiKey = readEnv('OPENAI_API_KEY');
  private defaultModel = (readEnv('OPENAI_MODEL') || 'gpt-5-mini');
  private fastModel = (readEnv('OPENAI_MODEL_FAST') || 'gpt-5-mini');
  private fullModel = (readEnv('OPENAI_MODEL_FULL') || 'gpt-5');
  private maxOutputTokens = Number(readEnv('OPENAI_MAX_TOKENS') || 4096);
  private contextWindow = 128_000; // 128k
  private costPer1M = { input: Number(readEnv('OPENAI_COST_INPUT_PER1M') || ProviderFactory.getMetadata('openai:*').costPer1M.input), output: Number(readEnv('OPENAI_COST_OUTPUT_PER1M') || ProviderFactory.getMetadata('openai:*').costPer1M.output) };

  estimateCost(tokens: { input: number; output: number }): number { const inCost = (Math.max(0, tokens.input || 0) / 1_000_000) * this.costPer1M.input; const outCost = (Math.max(0, tokens.output || 0) / 1_000_000) * this.costPer1M.output; return Number((inCost + outCost).toFixed(6)); }

  async call<T>(args: CallArgs): Promise<LLMResult<T>> {
  const request = this.buildRequest(args);
    const cacheKey = globalLLMCache.generateCacheKey('openai', request);
    return await globalLLMCache.getOrCompute(cacheKey, async () => {
      const headers = this.buildHeaders();
      const start = Date.now();
      if (!this.apiKey) throw new OpenAIAuthError('Missing OPENAI_API_KEY');
      const res = await fetch(this.apiUrl, { method: 'POST', headers, body: JSON.stringify(request) });
      if (!res.ok) await this.throwForResponse(res);
  const data = (await res.json()) as OpenAIResponse;
      const text = data.choices?.[0]?.message?.content || '';
      const usage = this.toUsage(data.usage);
  const json = this.maybeParseJSON<T>(text, (request as { response_format?: unknown }).response_format);
  const result: LLMResult<T> = { text, json: json ?? undefined, usage, raw: data };
  logDebug('call:success', { model: (request as { model?: string }).model, ms: Date.now() - start, usage });
      return result;
    }, { maxAgeMs: 60 * 60 * 1000 });
  }

  async callWithRetry<T>(args: CallArgs, maxRetries = Number(readEnv('LLM_RETRIES') || 2)): Promise<LLMResult<T>> {
    let attempt = 0; let lastErr: unknown;
    while (attempt <= maxRetries) {
      try { return await this.call<T>(args); } catch (err) {
        lastErr = err;
        const delay = this.backoffDelay(attempt, err);
        if (delay < 0 || attempt === maxRetries) break;
        await new Promise(r => setTimeout(r, delay));
        attempt++;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('OpenAI call failed');
  }

  async callBatch<T>(requests: CallArgs[]): Promise<LLMResult<T>[]> {
    // Parallel execution; caching handles dedupe for identical prompts
    return await Promise.all(requests.map(r => this.callWithRetry<T>(r)));
  }

  // Streaming text chunks from Chat Completions
  async *streamText(args: CallArgs): AsyncIterable<string> {
    const request = this.buildRequest(args, true);
    const headers = this.buildHeaders(true);
    if (!this.apiKey) throw new OpenAIAuthError('Missing OPENAI_API_KEY');
    const res = await fetch(this.apiUrl, { method: 'POST', headers, body: JSON.stringify(request) });
    if (!res.ok) await this.throwForResponse(res);
    const bodyStream = res.body; if (!bodyStream) throw new OpenAINetworkError('No response body from OpenAI streaming endpoint');
    const reader = bodyStream.getReader(); const decoder = new TextDecoder();
    let buffer = ''; let done = false;
    while (!done) {
      const { value, done: d } = await reader.read(); done = d;
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const packet = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
        for (const line of packet.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload) as OpenAIStreamChunk;
            const delta = evt.choices?.[0]?.delta?.content; if (delta) yield delta;
          } catch { /* ignore */ }
        }
      }
    }
  }

  // --- Helpers -------------------------------------------------------
  private buildHeaders(stream = false): HeadersInit {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'authorization': `Bearer ${this.apiKey || ''}` };
    if (stream) headers['accept'] = 'text/event-stream';
    return headers;
  }

  private resolveModel(profile?: Profile): string {
    if (readEnv('OPENAI_MODEL')) return readEnv('OPENAI_MODEL')!;
    if (profile === 'FAST_ITERATE') return this.fastModel;
    return this.fullModel || this.defaultModel;
  }

  private enforceContext(prompt: string): string {
    const inputTokens = estimateTokens(prompt);
    if (inputTokens + this.maxOutputTokens <= this.contextWindow) return prompt;
    // Trim from the tail; keep prefix context
    const target = Math.max(1000, Math.floor((this.contextWindow - this.maxOutputTokens) * 4));
    const trimmed = prompt.slice(0, target) + '\n[TRIMMED]';
    logDebug('context:trim', { originalChars: prompt.length, trimmedChars: trimmed.length });
    return trimmed;
  }

  private buildRequest(args: CallArgs, stream = false): Record<string, unknown> {
    const profile = args.profile;
    const model = this.resolveModel(profile);
    const system = args.system || '';
    const userPrompt = this.enforceContext(args.prompt || '');
    const temperature = typeof args.temperature === 'number' ? args.temperature : 0.2;
    const response_format = this.buildResponseFormat(args.schema);
    const messages: OpenAIChatMessage[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: userPrompt });
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: this.maxOutputTokens,
      ...(response_format ? { response_format } : {}),
      ...(stream ? { stream: true } : {}),
    };
    return body;
  }

  private buildResponseFormat(schema: unknown): unknown {
    if (!schema) return undefined;
    if (typeof schema === 'object' && schema && 'type' in (schema as Record<string, unknown>)) {
      return { type: 'json_schema', json_schema: { name: 'SMAIRS_Schema', schema: schema as Record<string, unknown> } };
    }
    return { type: 'json_object' };
  }

  private maybeParseJSON<T>(text: string, response_format: unknown): T | null {
    const isJsonMode = !!response_format;
    if (!isJsonMode) return null;
    try { return JSON.parse(text) as T; } catch { return null; }
  }

  private toUsage(u?: OpenAIUsage): { in: number; out: number } { return { in: Math.max(0, u?.prompt_tokens || 0), out: Math.max(0, u?.completion_tokens || 0) }; }

  private async throwForResponse(res: Response): Promise<never> {
    type ErrorBody = { error?: { message?: string; type?: string; code?: string; param?: string } };
    let body: unknown = undefined;
    try { body = await res.json(); } catch { try { body = await res.text(); } catch { body = undefined; } }
    const eb = (typeof body === 'object' && body) ? (body as ErrorBody) : {};
    const msg = eb.error?.message || `${res.status} ${res.statusText}`;
    if (res.status === 401 || res.status === 403) throw new OpenAIAuthError(msg, body);
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      throw new OpenAIRateLimitError(msg, isFinite(ra) ? ra * 1000 : undefined, body);
    }
    if (res.status === 400) throw new OpenAIInvalidRequestError(msg, body);
    throw new OpenAIAPIError(msg, res.status, eb.error?.code, body);
  }

  private backoffDelay(attempt: number, err: unknown): number {
    const isRetryable = (e: unknown) => {
      if (e instanceof OpenAIRateLimitError) return true;
      if (e instanceof OpenAINetworkError) return true;
      if (e instanceof OpenAIAPIError && (e.status && e.status >= 500)) return true;
      const msg = (e as Error)?.message || '';
      // Specific OpenAI error hints
      return /timeout|temporarily unavailable|overloaded|network/i.test(msg);
    };
    if (!isRetryable(err)) return -1;
    const base = 250 * Math.pow(2, Math.max(0, attempt));
    const jitter = Math.floor(Math.random() * 120);
    const delay = Math.min(base + jitter, 4_000);
    const suggested = err instanceof OpenAIRateLimitError && err.retryAfterMs ? err.retryAfterMs : undefined;
    const final = suggested ? Math.max(suggested, delay) : delay;
    logDebug('retry:backoff', { attempt, delay: final });
    return final;
  }
}
