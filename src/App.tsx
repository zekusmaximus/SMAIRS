import React, { useEffect } from 'react';
import { StoreProvider } from '@/stores';
import MainLayout from '@/ui/layouts/MainLayout';
import { markEnd, snapshotMemory } from '@/lib/metrics';
import { PageErrorBoundary } from '@/ui/components/ErrorBoundary';
import { globalErrorRecovery } from '@/utils/error-recovery';

export default function App() {
  useEffect(() => {
    // First render measured from module init to effect flush
    markEnd('first-render-ms');
    snapshotMemory();

    // Set up global error recovery event listeners
    const handleGlobalError = (error: ErrorEvent) => {
      console.error('Global error caught:', error);
      globalErrorRecovery.queueOperation(
        `global-error-${Date.now()}`,
        async () => {
          // Attempt to recover from global errors
          throw error.error || new Error(error.message);
        },
        { maxRetries: 1, context: { type: 'global', url: window.location.href } }
      );
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      globalErrorRecovery.queueOperation(
        `promise-rejection-${Date.now()}`,
        async () => {
          throw event.reason;
        },
        { maxRetries: 1, context: { type: 'promise', url: window.location.href } }
      );
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const handleAppError = (error: Error) => {
    console.error('Application-level error:', error);
    // Report to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      // Integration point for error reporting service
      console.error('App Error Report:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      });
    }
  };

  return (
    <StoreProvider>
      <PageErrorBoundary onError={handleAppError}>
        <div data-testid="app-ready">
          <MainLayout />
        </div>
      </PageErrorBoundary>
    </StoreProvider>
  );
}
