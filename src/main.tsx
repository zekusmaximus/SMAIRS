import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setupMonitoringAPI } from './features/llm/api.js';
import LLMMonitorWidget from './components/LLMMonitorWidget';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  <LLMMonitorWidget />
  </React.StrictMode>,
);

// Setup monitoring after React mounts
setupMonitoringAPI();
