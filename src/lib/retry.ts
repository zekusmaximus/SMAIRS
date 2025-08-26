export async function retry<T>(fn: () => Promise<T>, opts: { retries?: number; backoffMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  let delay = opts.backoffMs ?? 300;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(5000, Math.floor(delay * 2));
  }
  throw lastErr;
}

export function reportError(err: unknown, context?: Record<string, unknown>) {
  // Local-only reporter; extend to file/tauri log if needed
  console.error('[SMAIRS]', err, context);
}
