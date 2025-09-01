import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// === BEGIN: runtime-wiring ===
import { isTauri } from './runtime';
// Patch fetch to use plugin-http in Tauri
if (isTauri) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  import('@tauri-apps/plugin-http').then(({ fetch: tauriFetch }) => {
    (window as any).fetch = tauriFetch as any;
  });
}
// Log runtime for debugging
// eslint-disable-next-line no-console
console.info('Boot runtime:', isTauri ? 'tauri' : 'web');
// === END: runtime-wiring ===
const setupMonitoringAPILazy = () => import('./features/llm/api.js').then(m => m.setupMonitoringAPI?.());
import { markStart } from './lib/metrics';
import TopProgressBar from '@/ui/components/TopProgressBar';
// PWA registration (vite-plugin-pwa)
// This safely does nothing in dev and registers in production builds.
import { registerSW } from 'virtual:pwa-register';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

// Mark start of first render budget window
markStart('first-render-ms');

createRoot(container).render(
  <React.StrictMode>
    <App />
    <TopProgressBar />
  </React.StrictMode>,
);

// Setup monitoring after first paint
requestIdleCallback?.(() => setupMonitoringAPILazy());

// Register service worker after idle to keep TTI unaffected
if (import.meta.env.PROD) {
  requestIdleCallback?.(() => {
    try {
      registerSW({ immediate: false, onRegisteredSW() {/* noop */} });
    } catch {
      // ignore registration errors (e.g., unsupported environment)
    }
  });
}
