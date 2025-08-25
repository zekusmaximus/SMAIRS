import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
const setupMonitoringAPILazy = () => import('./features/llm/api.js').then(m => m.setupMonitoringAPI?.());
const LLMMonitorWidget = React.lazy(() => import('./components/LLMMonitorWidget'));
import { markStart } from './lib/metrics';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

// Mark start of first render budget window
markStart('first-render-ms');

createRoot(container).render(
  <React.StrictMode>
    <App />
    <React.Suspense fallback={null}>
      <LLMMonitorWidget />
    </React.Suspense>
  </React.StrictMode>,
);

// Setup monitoring after first paint
requestIdleCallback?.(() => setupMonitoringAPILazy());
