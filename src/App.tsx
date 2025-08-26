import React, { useEffect } from 'react';
import { StoreProvider } from '@/stores';
import MainLayout from '@/ui/layouts/MainLayout';
import { markEnd, snapshotMemory } from '@/lib/metrics';
import ErrorBoundary from '@/ui/components/ErrorBoundary';

export default function App() {
  useEffect(() => {
    // First render measured from module init to effect flush
    markEnd('first-render-ms');
    snapshotMemory();
  }, []);
  return (
    <StoreProvider>
      <ErrorBoundary label="App Root">
        <MainLayout />
      </ErrorBoundary>
    </StoreProvider>
  );
}
