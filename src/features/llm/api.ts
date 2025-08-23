import { useEffect, useState } from 'react';
import { globalLLMMonitor, type LLMMetrics } from './monitor.js';

declare global {
  interface Window {
    __LLM_MONITOR__?: {
      getMetrics: () => LLMMetrics;
      getDashboard: () => string;
      getHealth: () => number;
      getAlerts: () => { severity: 'critical' | 'warning'; message: string; timestamp: Date }[];
    };
  }
}

export function setupMonitoringAPI() {
  if (typeof window === 'undefined') return;
  window.__LLM_MONITOR__ = {
    getMetrics: () => globalLLMMonitor.getMetrics(),
    getDashboard: () => globalLLMMonitor.getDashboard(),
    getHealth: () => globalLLMMonitor.getHealthScore(),
    getAlerts: () => globalLLMMonitor.getAlerts(),
  };
  return globalLLMMonitor;
}

export function useLLMMonitor() {
  const [metrics, setMetrics] = useState<LLMMetrics | undefined>(undefined);
  const [health, setHealth] = useState<number>(100);
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof window !== 'undefined' && window.__LLM_MONITOR__) {
        setMetrics(window.__LLM_MONITOR__.getMetrics());
        setHealth(window.__LLM_MONITOR__.getHealth());
      } else {
        setMetrics(globalLLMMonitor.getMetrics());
        setHealth(globalLLMMonitor.getHealthScore());
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return { metrics, health };
}
