import type { CallArgs, LLMCaller, LLMResult } from '../providers.js';
import { ProviderFactory } from '../provider-factory.js';
import { globalLLMCache } from '../cache-manager.js';

// --- Error types -----------------------------------------------------
export class GoogleAPIError extends Error { status?: number; code?: string; raw?: unknown; constructor(msg: string, status?: number, code?: string, raw?: unknown) { super(msg); this.name = 'GoogleAPIError'; this.status = status; this.code = code; this.raw = raw; } }
export class GoogleAuthError extends GoogleAPIError { constructor(msg = 'Invalid Google API key', raw?: unknown) { super(msg, 401, 'unauthorized', raw); this.name = 'GoogleAuthError'; } }
export class GoogleRateLimitError extends GoogleAPIError { retryAfterMs?: number; constructor(msg = 'Google rate limit exceeded', retryAfterMs?: number, raw?: unknown) { super(msg, 429, 'resource_exhausted', raw); this.name = 'GoogleRateLimitError'; this.retryAfterMs = retryAfterMs; } }
export class GoogleQuotaExceededError extends GoogleAPIError { constructor(msg = 'Google quota exceeded', raw?: unknown) { super(msg, 403, 'quota_exceeded', raw); this.name = 'GoogleQuotaExceededError'; } }
export class GoogleNetworkError extends Error { constructor(msg: string, public cause?: unknown) { super(msg); this.name = 'GoogleNetworkError'; } }
export class GoogleInvalidRequestError extends GoogleAPIError { constructor(msg = 'Invalid request to Google API', raw?: unknown) { super(msg, 400, 'invalid_request', raw); this.name = 'GoogleInvalidRequestError'; } }

// --- Types (subset) --------------------------------------------------
interface UsageMetadata { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
interface PartText { text?: string }
interface Content { role?: string; parts?: PartText[] }
interface Candidate { content?: Content; finishReason?: string; groundingMetadata?: Record<string, unknown>; citations?: unknown[] }
interface PromptFeedback { safetyRatings?: Array<{ category?: string; probability?: string; blocked?: boolean }>; blockReason?: string }
interface GenerateResponse { candidates?: Candidate[]; usageMetadata?: UsageMetadata; promptFeedback?: PromptFeedback }
interface StreamChunk { candidates?: Candidate[]; usageMetadata?: UsageMetadata; promptFeedback?: PromptFeedback }

// --- Utils -----------------------------------------------------------
function readEnv(name: string): string | undefined { const metaEnv = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string,string> }).env : undefined); return (metaEnv && metaEnv[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined); }
function logDebug(event: string, data: Record<string, unknown>) { const dbg = (readEnv('DEBUG') || '').toLowerCase(); if (dbg === '1' || dbg === 'true') console.debug(`[gemini:${event}]`, JSON.stringify(data)); }

export class GeminiProvider implements LLMCaller {
  private apiBase = (readEnv('GOOGLE_API_BASE') || 'https://generativelanguage.googleapis.com');
  private apiKey = (readEnv('GOOGLE_API_KEY') || readEnv('GEMINI_API_KEY'));
  private model = (readEnv('GOOGLE_MODEL') || 'models/gemini-2.5-pro-exp-1m');
  private regionFallback = readEnv('GOOGLE_API_REGION_FALLBACK'); // e.g., us-east1
  private maxOutputTokens = Number(readEnv('GOOGLE_MAX_TOKENS') || 4096);
  private costPer1M = { input: Number(readEnv('GOOGLE_COST_INPUT_PER1M') || ProviderFactory.getMetadata('google:*').costPer1M.input), output: Number(readEnv('GOOGLE_COST_OUTPUT_PER1M') || ProviderFactory.getMetadata('google:*').costPer1M.output) };
  constructor(modelId?: string) { if (modelId) { const parts = modelId.split(':'); const m = parts.length > 1 ? parts[1] : modelId; if (m && !m.startsWith('models/')) this.model = `models/${m}`; else if (m) this.model = m; } }

  estimateCost(tokens: { input: number; output: number }): number { const inCost = (Math.max(0, tokens.input || 0) / 1_000_000) * this.costPer1M.input; const outCost = (Math.max(0, tokens.output || 0) / 1_000_000) * this.costPer1M.output; return Number((inCost + outCost).toFixed(6)); }

  async call<T>(args: CallArgs): Promise<LLMResult<T>> {
    const request = this.buildRequest(args);
    const key = globalLLMCache.generateCacheKey('google', request);
    return await globalLLMCache.getOrCompute(key, async () => {
      const start = Date.now();
      const url = this.buildURL(':generateContent');
      const res = await this.doFetch(url, request);
      if (!res.ok) await this.throwForResponse(res, url);
      const data = (await res.json()) as GenerateResponse;
      const { text, blocked } = this.extractText(data);
      const usage = this.toUsage(data.usageMetadata);
  const json = this.maybeParseJSON<T>(text);
      if (blocked) logDebug('safety:blocked', { reason: data.promptFeedback?.blockReason });
      const result: LLMResult<T> = { text: blocked ? '' : text, json: blocked ? undefined : (json ?? undefined), usage, raw: data };
      logDebug('call:success', { model: this.model, ms: Date.now() - start, usage, blocked });
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
    throw lastErr instanceof Error ? lastErr : new Error('Google call failed');
  }

  async callBatch<T>(requests: CallArgs[]): Promise<LLMResult<T>[]> { return await Promise.all(requests.map(r => this.callWithRetry<T>(r))); }

  async *streamText(args: CallArgs): AsyncIterable<string> {
    const request = this.buildRequest(args, true);
    const url = this.buildURL(':streamGenerateContent');
  const res = await this.doFetch(url, request);
    if (!res.ok) await this.throwForResponse(res, url);
    const stream = res.body; if (!stream) throw new GoogleNetworkError('No response body from Google streaming endpoint');
    const reader = stream.getReader(); const decoder = new TextDecoder();
    let buffer = ''; let done = false;
    while (!done) {
      const { value, done: d } = await reader.read(); done = d;
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx + 1);
        if (!line) continue;
        // Some endpoints send pure JSON lines; others prefix with 'data: '
        const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
        if (payload === '[DONE]') { done = true; break; }
        try {
          const chunk = JSON.parse(payload) as StreamChunk;
          const delta = this.extractDeltaText(chunk);
          if (delta) yield delta;
        } catch { /* ignore parsing errors for partial lines */ }
      }
    }
  }

  // --- Helpers -------------------------------------------------------
  private buildURL(pathSuffix: ':generateContent' | ':streamGenerateContent', region?: string): string {
    const base = region ? `https://${region}-generativelanguage.googleapis.com` : this.apiBase;
    const apiKey = this.apiKey || '';
    const url = `${base}/v1/${this.model}${pathSuffix}?key=${encodeURIComponent(apiKey)}`;
    return url;
  }

  private buildRequest(args: CallArgs, stream = false): Record<string, unknown> {
  // model is embedded in URL path; no-op here
    const system = args.system || '';
    const userPrompt = args.prompt || '';
    const temperature = typeof args.temperature === 'number' ? args.temperature : 0.2;
    const safetySettings = this.safetySettings();
    const responseConfig = this.buildResponseConfig(args.schema);
    const enableGrounding = (readEnv('GOOGLE_GROUNDING') || '1') !== '0';
    const tools = enableGrounding ? [{ googleSearchRetrieval: {} as Record<string, unknown> }] : undefined;
    const generationConfig: Record<string, unknown> = { temperature, maxOutputTokens: this.maxOutputTokens, ...(responseConfig ? responseConfig : {}) };
    const contents: Content[] = [ { role: 'user', parts: [{ text: userPrompt }] } ];
    const body: Record<string, unknown> = {
      // model implied by URL
      contents,
      ...(system ? { systemInstruction: { role: 'system', parts: [{ text: system }] } } : {}),
      generationConfig,
      ...(tools ? { tools } : {}),
      safetySettings,
      ...(stream ? { }
        : {}),
    };
    return body;
  }

  private safetySettings(): Array<Record<string, string>> {
    // Default: keep standard thresholds; callers can override via env later
    const threshold = readEnv('GOOGLE_SAFETY_THRESHOLD') || 'BLOCK_MEDIUM_AND_ABOVE';
    const categories = [
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
    ];
    return categories.map(cat => ({ category: cat, threshold }));
  }

  private buildResponseConfig(schema: unknown): Record<string, unknown> | undefined {
    if (!schema) return undefined;
    if (typeof schema === 'object' && schema && 'type' in (schema as Record<string, unknown>)) {
      return { responseMimeType: 'application/json', responseSchema: schema as Record<string, unknown> };
    }
    return { responseMimeType: 'application/json' };
  }

  private extractText(resp: GenerateResponse): { text: string; blocked: boolean } {
    // Safety handling: if promptFeedback indicates block, mark as blocked
    const blocked = !!(resp.promptFeedback?.blockReason || resp.promptFeedback?.safetyRatings?.some(r => r.blocked));
    const c0 = resp.candidates && resp.candidates[0];
    const parts = c0?.content?.parts || [];
    const text = parts.map(p => p.text || '').join('');
    return { text, blocked };
  }

  private extractDeltaText(chunk: StreamChunk): string | null {
    // Some stream variants send partial parts; try to concatenate the first part's text
    const c0 = chunk.candidates && chunk.candidates[0];
    const part0 = c0?.content?.parts && c0.content.parts[0];
    const t = part0?.text;
    return t || null;
  }

  private toUsage(u?: UsageMetadata): { in: number; out: number } { return { in: Math.max(0, u?.promptTokenCount || 0), out: Math.max(0, u?.candidatesTokenCount || 0) }; }

  private maybeParseJSON<T>(text: string): T | null {
    // If responseMimeType is json, model generally returns valid JSON; best-effort parse
    try { return JSON.parse(text) as T; } catch { return null; }
  }

  private async doFetch(url: string, body: Record<string, unknown>): Promise<Response> {
    if (!this.apiKey) throw new GoogleAuthError('Missing GOOGLE_API_KEY / GEMINI_API_KEY');
    const headers: HeadersInit = { 'content-type': 'application/json' };
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (res.status === 403 && this.regionFallback) {
        // Try region-specific fallback once
        const alt = this.buildURL(url.includes(':streamGenerateContent') ? ':streamGenerateContent' : ':generateContent', this.regionFallback);
        return await fetch(alt, { method: 'POST', headers, body: JSON.stringify(body) });
      }
      return res;
    } catch (e) {
      throw new GoogleNetworkError('Network error contacting Google API', e);
    }
  }

  private async throwForResponse(res: Response, url: string): Promise<never> {
    type ErrorBody = { error?: { code?: number; status?: string; message?: string; details?: unknown } };
    let body: unknown = undefined;
    try { body = await res.json(); } catch { try { body = await res.text(); } catch { body = undefined; } }
    const eb = (typeof body === 'object' && body) ? (body as ErrorBody) : {};
    const status = eb.error?.status || `${res.status}`;
    const msg = eb.error?.message || `${res.status} ${res.statusText}`;
    if (res.status === 401) throw new GoogleAuthError(msg, body);
    if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') {
      const ra = Number(res.headers.get('retry-after'));
      throw new GoogleRateLimitError(msg, isFinite(ra) ? ra * 1000 : undefined, body);
    }
    if (res.status === 403 && /quota/i.test(msg)) throw new GoogleQuotaExceededError(msg, body);
    if (res.status === 400) throw new GoogleInvalidRequestError(msg, body);
    throw new GoogleAPIError(msg, res.status, status, { url, body });
  }

  private backoffDelay(attempt: number, err: unknown): number {
    const isRetryable = (e: unknown) => {
      if (e instanceof GoogleRateLimitError) return true;
      if (e instanceof GoogleNetworkError) return true;
      if (e instanceof GoogleAPIError && (e.status && e.status >= 500)) return true;
      return false;
    };
    if (!isRetryable(err)) return -1;
    const base = 300 * Math.pow(2, Math.max(0, attempt));
    const jitter = Math.floor(Math.random() * 120);
    const delay = Math.min(base + jitter, 5_000);
    const suggested = err instanceof GoogleRateLimitError && err.retryAfterMs ? err.retryAfterMs : undefined;
    const final = suggested ? Math.max(suggested, delay) : delay;
    logDebug('retry:backoff', { attempt, delay: final });
    return final;
  }
}
