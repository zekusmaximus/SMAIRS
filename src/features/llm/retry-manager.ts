export interface RetryOptions {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
}

export class RetryManager {
  async executeWithRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
    const maxAttempts = Math.max(1, options.maxAttempts);
    let attempt = 0; let lastErr: unknown;
    while (attempt < maxAttempts) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt >= maxAttempts || !this.isRetryable(err)) break;
        const delay = this.computeBackoff(attempt - 1, options.backoffMs, options.maxBackoffMs, err);
        options.onRetry?.(attempt, err as Error, delay);
        await this.sleep(delay);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Operation failed');
  }

  private isRetryable(err: unknown): boolean {
    const msg = (err as Error)?.message || '';
    const status = (err as { status?: number }).status;
    if (status && status >= 500) return true;
    if (status === 429) return true;
    return /timeout|temporarily|overloaded|rate limit|network|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg);
  }

  private computeBackoff(attempt: number, base: number, max: number, err: unknown): number {
    const jitter = Math.random() * Math.min(200, base);
    const suggested = (err as { retryAfterMs?: number }).retryAfterMs;
    const expo = Math.min(max, Math.floor(base * Math.pow(2, attempt) + jitter));
    return suggested ? Math.max(suggested, expo) : expo;
  }

  private async sleep(ms: number): Promise<void> { await new Promise(r => setTimeout(r, ms)); }
}

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: Number(readEnv('LLM_RETRIES') || 3),
  backoffMs: 300,
  maxBackoffMs: 5_000,
};
