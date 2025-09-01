import type { CallArgs, LLMCaller, LLMResult, Profile } from '../providers.js';
import { httpFetch } from '../http.js';
import { ProviderFactory } from '../provider-factory.js';
import { globalLLMCache } from '../cache-manager.js';

// Typed errors for clearer handling upstream
export class AnthropicAPIError extends Error { status?: number; code?: string; raw?: unknown; constructor(msg: string, status?: number, code?: string, raw?: unknown) { super(msg); this.name = 'AnthropicAPIError'; this.status = status; this.code = code; this.raw = raw; } }
export class AnthropicAuthError extends AnthropicAPIError { constructor(msg = 'Invalid Anthropic API key', raw?: unknown) { super(msg, 401, 'auth_error', raw); this.name = 'AnthropicAuthError'; } }
export class AnthropicRateLimitError extends AnthropicAPIError { retryAfterMs?: number; constructor(msg = 'Anthropic rate limit exceeded', retryAfterMs?: number, raw?: unknown) { super(msg, 429, 'rate_limit_error', raw); this.name = 'AnthropicRateLimitError'; this.retryAfterMs = retryAfterMs; } }
export class AnthropicNetworkError extends Error { constructor(msg: string, public cause?: unknown) { super(msg); this.name = 'AnthropicNetworkError'; } }
export class AnthropicInvalidRequestError extends AnthropicAPIError { constructor(msg = 'Invalid request to Anthropic API', raw?: unknown) { super(msg, 400, 'invalid_request_error', raw); this.name = 'AnthropicInvalidRequestError'; } }

type JsonSchema = Record<string, unknown>;

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicContentText { type: 'text'; text: string; }

interface AnthropicMessage {
  id: string;
  type: 'message';
  role: 'assistant' | 'user' | 'system';
  content: Array<AnthropicContentText | Record<string, unknown>>;
  model: string;
  stop_reason?: string | null;
  usage?: AnthropicUsage;
}

interface StreamEvent {
  type: string;
  index?: number;
  delta?: { type?: string; text?: string };
  message?: AnthropicMessage;
  usage?: AnthropicUsage;
}

function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}

function logDebug(event: string, data: Record<string, unknown>) {
  const dbg = (readEnv('DEBUG') || '').toLowerCase();
  if (dbg === '1' || dbg === 'true') console.debug(`[anthropic:${event}]`, JSON.stringify(data));
}

export class AnthropicProvider implements LLMCaller {
  private apiUrl = (readEnv('ANTHROPIC_API_URL') || 'https://api.anthropic.com/v1/messages');
  private apiKey = readEnv('ANTHROPIC_API_KEY');
  private version = (readEnv('ANTHROPIC_VERSION') || '2023-06-01');
  // Prompt caching beta header
  private cachingHeader = 'prompt-caching-2024-07-31';
  // Model and pricing config
  private defaultModel = (readEnv('ANTHROPIC_MODEL') || 'claude-3-5-sonnet-20241022');
  private longCtxModel = (readEnv('ANTHROPIC_MODEL_LONGCTX') || 'claude-3-5-sonnet-20241022'); // placeholder; user can override to any 1M-enabled model
  private costPer1M = {
    input: Number(readEnv('ANTHROPIC_COST_INPUT_PER1M') || ProviderFactory.getMetadata('anthropic:*').costPer1M.input),
    output: Number(readEnv('ANTHROPIC_COST_OUTPUT_PER1M') || ProviderFactory.getMetadata('anthropic:*').costPer1M.output),
  };
  private maxTokens = Number(readEnv('ANTHROPIC_MAX_TOKENS') || 4096);
  private modelOverride?: string;

  constructor(modelId?: string) {
    if (!this.apiKey) {
      // Don't throw immediately to allow offline tests; throw on first call
      logDebug('warn:no_api_key', { message: 'ANTHROPIC_API_KEY not set' });
    }
    if (modelId) {
      const parts = modelId.split(':');
      this.modelOverride = parts.length > 1 ? parts[1] : modelId;
    }
  }

  estimateCost(tokens: { input: number; output: number }): number {
    // Account for prompt caching: apply a configurable discount to input tokens if caching is enabled.
    const cachingEnabled = (readEnv('ANTHROPIC_PROMPT_CACHE') || '').toLowerCase() !== '0';
    const discountRatio = Math.min(1, Math.max(0, Number(readEnv('ANTHROPIC_CACHE_DISCOUNT') || 0.5))); // 50% by default
    const effectiveInput = cachingEnabled ? Math.round((tokens.input || 0) * (1 - discountRatio)) + Math.round((tokens.input || 0) * discountRatio * 0.5) : (tokens.input || 0);
    const inCost = (Math.max(0, effectiveInput) / 1_000_000) * this.costPer1M.input;
    const outCost = (Math.max(0, tokens.output || 0) / 1_000_000) * this.costPer1M.output;
    return Number((inCost + outCost).toFixed(6));
  }

  async call<T>(args: CallArgs): Promise<LLMResult<T>> {
    const body = this.buildRequestBody(args);
    const headers = this.buildHeaders({ useCaching: this.shouldUseCaching(args) });
    const model = body.model as string;
    const cacheKey = globalLLMCache.generateCacheKey('anthropic', { model, body: { ...body, stream: false } });
    return await globalLLMCache.getOrCompute(cacheKey, async () => {
      const start = Date.now();
      try {
        if (!this.apiKey) throw new AnthropicAuthError('Missing ANTHROPIC_API_KEY');
  const res = await httpFetch(this.apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) {
          await this.throwForResponse(res);
        }
        const data = (await res.json()) as AnthropicMessage;
        const text = this.extractText(data);
        const usage = this.toUsage(data.usage);
        const json = this.maybeParseJSON<T>(text, args.schema);
        const result: LLMResult<T> = { text, json: json ?? undefined, usage, raw: { id: data.id, model: data.model, usage: data.usage } };
        logDebug('call:success', { model, ms: Date.now() - start, usage });
        return result;
      } catch (err) {
        logDebug('call:error', { model, ms: Date.now() - start, error: (err as Error).message });
        throw err;
      }
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
    throw lastErr instanceof Error ? lastErr : new Error('Anthropic call failed');
  }

  async callBatch<T>(requests: CallArgs[]): Promise<LLMResult<T>[]> {
    return Promise.all(requests.map(r => this.callWithRetry<T>(r)));
  }

  // Optional streaming support for callers that know to use it.
  async *streamText(args: CallArgs): AsyncIterable<string> {
    const body = this.buildRequestBody(args, true);
    const headers = this.buildHeaders({ useCaching: this.shouldUseCaching(args), stream: true });
    if (!this.apiKey) throw new AnthropicAuthError('Missing ANTHROPIC_API_KEY');
  const res = await httpFetch(this.apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) await this.throwForResponse(res);
  const bodyStream = res.body;
  if (!bodyStream) throw new AnthropicNetworkError('No response body from Anthropic streaming endpoint');
  const reader = bodyStream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done: boolean | undefined;
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const packet = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of packet.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') { done = true; break; }
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload) as StreamEvent;
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              yield evt.delta.text;
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    }
  }

  // --- Helpers -------------------------------------------------------
  private buildHeaders(opts?: { useCaching?: boolean; stream?: boolean }): HeadersInit {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': this.apiKey || '',
      'anthropic-version': this.version,
    };
    if (opts?.useCaching) headers['anthropic-beta'] = this.cachingHeader;
    if (opts?.stream) headers['accept'] = 'text/event-stream';
    return headers;
  }

  private buildRequestBody(args: CallArgs, stream = false): Record<string, unknown> {
    const {
      system,
      prompt,
      temperature,
      schema,
    } = args;

    const useLong = (readEnv('LLM_LONGCTX_ENABLE') || '0') === '1';
    const model = this.resolveModel(args.profile, useLong);
    const useCaching = this.shouldUseCaching(args);
  type CacheCtl = { cache_control?: { type: 'ephemeral' } };
  const userContent: (AnthropicContentText & CacheCtl) = { type: 'text', text: prompt, ...(useCaching ? { cache_control: { type: 'ephemeral' } } : {}) };

  const sys = system
    ? (useCaching
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system)
    : undefined;

    const response_format = this.buildResponseFormat(schema);

    const body: Record<string, unknown> = {
      model,
      max_tokens: this.maxTokens,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
  system: sys,
  messages: [ { role: 'user', content: [userContent] } ],
      ...(response_format ? { response_format } : {}),
      ...(stream ? { stream: true } : {}),
    };
    return body;
  }

  private resolveModel(_profile: Profile | undefined, useLong: boolean): string {
    if (this.modelOverride) return this.modelOverride;
    const override = readEnv('ANTHROPIC_MODEL');
    if (override) return override;
    return useLong ? this.longCtxModel : this.defaultModel;
  }

  private shouldUseCaching(args: CallArgs): boolean {
    const disabled = (readEnv('ANTHROPIC_PROMPT_CACHE') || '').toLowerCase() === '0';
    if (disabled) return false;
    // Use caching for long prompts or structure profile by default
    const isLong = (args.prompt?.length || 0) > 5000;
    const isStructural = args.profile === 'STRUCTURE_LONGCTX';
    return isLong || isStructural;
  }

  private buildResponseFormat(schema: unknown): unknown {
    if (!schema) return undefined;
    // If provided a JSON schema object, pass through; else use generic json_object mode.
    if (typeof schema === 'object' && schema && 'type' in (schema as Record<string, unknown>)) {
      return { type: 'json_schema', json_schema: { name: 'SMAIRS_Schema', schema: schema as JsonSchema, strict: true } };
    }
    return { type: 'json_object' };
  }

  private extractText(message: AnthropicMessage): string {
    if (!message?.content) return '';
    const parts: string[] = [];
    const isTextBlock = (b: unknown): b is AnthropicContentText => !!b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string';
    for (const c of message.content) { if (isTextBlock(c)) parts.push(c.text); }
    return parts.join('');
  }

  private maybeParseJSON<T>(text: string, schema: unknown): T | null {
    if (!schema) return null;
    // Best-effort JSON parse
    try { return JSON.parse(text) as T; } catch { return null; }
  }

  private toUsage(u?: AnthropicUsage): { in: number; out: number } {
    return { in: Math.max(0, u?.input_tokens || 0), out: Math.max(0, u?.output_tokens || 0) };
  }

  private async throwForResponse(res: Response): Promise<never> {
  type ErrorBody = { error?: { message?: string; type?: string }; message?: string };
  let body: unknown = undefined;
  try { body = await res.json(); } catch { try { body = await res.text(); } catch { body = undefined; } }
  const eb = (typeof body === 'object' && body) ? (body as ErrorBody) : {};
  const msg = (eb.error?.message || eb.message) || `${res.status} ${res.statusText}`;
  if (res.status === 401 || res.status === 403) throw new AnthropicAuthError(msg, body);
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      throw new AnthropicRateLimitError(msg, isFinite(ra) ? ra * 1000 : undefined, body);
    }
  if (res.status === 400) throw new AnthropicInvalidRequestError(msg, body);
  throw new AnthropicAPIError(msg, res.status, eb.error?.type, body);
  }

  private backoffDelay(attempt: number, err: unknown): number {
    const isRetryable = (e: unknown) => {
      if (e instanceof AnthropicRateLimitError) return true;
      if (e instanceof AnthropicNetworkError) return true;
      if (e instanceof AnthropicAPIError && (e.status && e.status >= 500)) return true;
      const msg = (e as Error)?.message || '';
      return /timeout|network|fetch failed/i.test(msg);
    };
    if (!isRetryable(err)) return -1;
    const base = 250 * Math.pow(2, Math.max(0, attempt));
    const jitter = Math.floor(Math.random() * 100);
    const delay = Math.min(base + jitter, 4_000);
    const suggested = err instanceof AnthropicRateLimitError && err.retryAfterMs ? err.retryAfterMs : undefined;
    const final = suggested ? Math.max(suggested, delay) : delay;
    logDebug('retry:backoff', { attempt, delay: final });
    return final;
  }
}
