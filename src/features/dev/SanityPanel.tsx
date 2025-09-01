// === BEGIN: runtime-wiring ===
import React, { useState } from 'react';
import { isTauri } from '../../runtime';
import { invokeOrThrow } from '../../tauriInvoke';
// Use tauri HTTP when available to avoid CORS in dev
async function http(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (isTauri) {
    try {
      const mod = await import('@tauri-apps/plugin-http');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const f = (mod as any).fetch as (i: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      if (typeof f === 'function') return f(input, init);
    } catch { /* fallthrough */ }
  }
  return fetch(input, init);
}

export function SanityPanel() {
  const [log, setLog] = useState<string[]>([]);
  const append = (s: string) => setLog((prev) => [...prev, s]);

  const runChecks = async () => {
    append(`Runtime: ${isTauri ? 'TAURI' : 'WEB'}`);
    append(`OPENAI_API_KEY: ${import.meta.env.OPENAI_API_KEY ? 'present' : 'missing'}`);

    try {
      const res = await invokeOrThrow<string>('version_list'); // use an existing command
      append(`Invoke OK: ${JSON.stringify(res).slice(0, 100)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      append(`Invoke FAIL: ${msg}`);
    }

    try {
      const resp = await http('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${import.meta.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Say hi.' }] })
      });
      const json = await resp.json();
      append(`HTTP OK: ${JSON.stringify(json).slice(0, 100)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      append(`HTTP FAIL: ${msg}`);
    }
  };

  return (
    <div style={{ padding: 12, border: '1px solid #ccc', borderRadius: 6, marginTop: 16 }}>
      <h3>Sanity Panel (Dev only)</h3>
      <button onClick={runChecks}>Run Checks</button>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>
    </div>
  );
}
// === END: runtime-wiring ===
