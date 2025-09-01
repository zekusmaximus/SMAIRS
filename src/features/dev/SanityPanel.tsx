// === BEGIN: runtime-wiring ===
import React, { useState } from 'react';
import { isTauri } from '../../runtime';
import { invokeOrThrow } from '../../tauriInvoke';

export function SanityPanel() {
  const [log, setLog] = useState<string[]>([]);
  const append = (s: string) => setLog((prev) => [...prev, s]);

  const runChecks = async () => {
    append(`Runtime: ${isTauri ? 'TAURI' : 'WEB'}`);

    try {
      const res = await invokeOrThrow<string>('version_list'); // use an existing command
      append(`Invoke OK: ${JSON.stringify(res).slice(0, 100)}`);
    } catch (e: any) {
      append(`Invoke FAIL: ${e?.message ?? String(e)}`);
    }

    try {
      const resp = await (window.fetch as any)('/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${import.meta.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Say hi.' }] })
      });
      const json = await resp.json();
      append(`HTTP OK: ${JSON.stringify(json).slice(0, 100)}`);
    } catch (e: any) {
      append(`HTTP FAIL: ${e?.message ?? String(e)}`);
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
