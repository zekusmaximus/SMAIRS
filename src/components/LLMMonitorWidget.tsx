import { useState } from 'react';
import { useLLMMonitor } from '../features/llm/api.js';

export function LLMMonitorWidget() {
  const { metrics, health } = useLLMMonitor();
  const [show, setShow] = useState(false);
  if (!metrics) return null;
  const healthColor = health > 80 ? 'green' : health > 50 ? 'goldenrod' : 'crimson';
  return (
    <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 9999 }}>
      <button
        onClick={() => setShow(!show)}
        style={{ background: '#111', color: '#fff', borderRadius: 6, padding: '6px 10px', border: '1px solid #444' }}
        title="LLM Monitor"
      >
        LLM: <span style={{ color: healthColor }}>{health}%</span> | ${metrics.costs.total.toFixed(2)}
      </button>
      {show && (
        <div style={{ whiteSpace: 'pre', marginTop: 8, background: '#1e1e1e', color: '#ddd', padding: 12, borderRadius: 8, maxHeight: 360, maxWidth: 600, overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
          <pre style={{ margin: 0 }}>
            {typeof window !== 'undefined' && (window as unknown as { __LLM_MONITOR__?: { getDashboard: () => string } }).__LLM_MONITOR__?.getDashboard() || ''}
          </pre>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <button onClick={() => setShow(false)} style={{ padding: '4px 8px' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LLMMonitorWidget;
