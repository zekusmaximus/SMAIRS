// Runtime-aware fetch helper: uses Tauri plugin-http in Tauri runtime to bypass CORS.
let cachedFetch: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined = undefined;

function hasTauri(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  if (typeof g.__TAURI__ !== 'undefined') return true;
  // vite-exposed env
  const env = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string,string> }).env : undefined) || {} as Record<string,string>;
  return env.VITE_RUNTIME === 'tauri';
}

export async function getHttpFetch(): Promise<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>> {
  if (cachedFetch) return cachedFetch;
  if (hasTauri()) {
    try {
      const mod = await import('@tauri-apps/plugin-http');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = (mod as any).fetch as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  if (typeof f === 'function') { cachedFetch = f; return cachedFetch; }
    } catch {
      // fallthrough; use global fetch
    }
  }
  // Fallback to global fetch
  const f = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
  if (!f) throw new Error('No fetch available');
  cachedFetch = f.bind(globalThis);
  return cachedFetch;
}

export async function httpFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const f = await getHttpFetch();
  return f(input, init);
}
