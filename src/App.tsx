import React, { useEffect } from 'react';
import { StoreProvider } from '@/stores';
import MainLayout from '@/ui/layouts/MainLayout';
import { markEnd, snapshotMemory } from '@/lib/metrics';
import { PageErrorBoundary } from '@/ui/components/ErrorBoundary';
import { globalErrorRecovery } from '@/utils/error-recovery';
import { useManuscriptStore } from '@/stores/manuscript.store';
import { ProgressOverlay } from '@/ui/components/ProgressOverlay';

export default function App() {
  const {
    isLoading: manuscriptLoading,
    loadingError: manuscriptError,
    setLoading,
    setLoadingError,
    parseProgress,
    operationStage,
    progressStartTime,
    progressMessage
  } = useManuscriptStore();

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

  // Enhanced manuscript loading with Tauri path resolution and fallback file picker
  useEffect(() => {
    const loadManuscriptWithFallback = async () => {
      setLoading(true);
      setLoadingError(null);

      const { loadManuscript } = useManuscriptStore.getState();

      try {
        // First, try environment variable path
        const pathFromEnv = (import.meta as { env?: { VITE_MANUSCRIPT_PATH?: string } })?.env?.VITE_MANUSCRIPT_PATH;
        if (pathFromEnv) {
          try {
            console.log('Loading manuscript from environment path:', pathFromEnv);
            await loadManuscript(pathFromEnv);
            return;
          } catch (envError) {
            console.warn('Failed to load manuscript from environment path:', envError);
          }
        }

        // Repo-default fallback: attempt to load data/manuscript.txt via Tauri command
        // This works in dev: src-tauri runs with CWD at src-tauri, and backend command will also try ../data/manuscript.txt
        try {
          const defaultRepoPath = 'data/manuscript.txt';
          console.log('Attempting default repository manuscript at:', defaultRepoPath);
          await loadManuscript(defaultRepoPath);
          return;
        } catch (repoError) {
          console.warn('Default repository manuscript not found/failed:', repoError);
        }

        // Try to load from app resources using Tauri path resolution
        try {
          console.log('Attempting to load manuscript from app resources...');
          const tauriApi = await import('@tauri-apps/api');
          const { path } = tauriApi;

          if (path && typeof path.appDataDir === 'function') {
            // Try appDataDir first (user data directory)
            const appDataDir = await path.appDataDir();
            const appResourcePath = await path.join(appDataDir, 'manuscript.txt');

            try {
              console.log('Trying app data directory:', appResourcePath);
              await loadManuscript(appResourcePath);
              return;
            } catch {
              console.log('App data directory not found, trying resource directory...');

              // Try resourceDir (app installation directory)
              if (typeof path.resourceDir === 'function') {
                const resourceDir = await path.resourceDir();
                const resourcePath = await path.join(resourceDir, 'data', 'manuscript.txt');

                try {
                  console.log('Trying resource directory:', resourcePath);
                  await loadManuscript(resourcePath);
                  return;
                } catch {
                  console.log('Resource directory not found, falling back to file picker...');
                }
              }
            }
          }
        } catch (tauriError) {
          console.warn('Tauri APIs not available or path resolution failed:', tauriError);
        }

        // Final fallback: show file picker dialog
        try {
          console.log('Showing file picker dialog...');
          const tauriApi = await import('@tauri-apps/api');
          const { dialog } = tauriApi;

          if (dialog && typeof dialog.open === 'function') {
            const selected = await dialog.open({
              multiple: false,
              filters: [{
                name: 'Text Files',
                extensions: ['txt', 'md', 'manuscript']
              }],
              title: 'Select Manuscript File',
              defaultPath: await (async () => {
                try {
                  const tauriApi = await import('@tauri-apps/api');
                  const { path } = tauriApi;
                  if (path && typeof path.appDataDir === 'function') {
                    return await path.appDataDir();
                  }
                } catch {
                  return undefined;
                }
                return undefined;
              })()
            });

            if (selected && typeof selected === 'string') {
              console.log('User selected manuscript file:', selected);
              await loadManuscript(selected);
            } else {
              console.log('User cancelled file selection');
              // Show user-friendly message about manuscript loading
              setLoadingError('No manuscript selected. You can manually select a file from the application menu.');
            }
          } else {
            throw new Error('Dialog API not available');
          }
        } catch (dialogError) {
          console.error('Failed to show file picker or load selected file:', dialogError);
          // Show user-friendly error message
          setLoadingError('Unable to load manuscript. Please check file permissions and try again.');
        }
      } catch (generalError) {
        console.error('Unexpected error during manuscript loading:', generalError);
        setLoadingError('An unexpected error occurred while loading the manuscript.');
      } finally {
        setLoading(false);
      }
    };

    loadManuscriptWithFallback();
  }, []);

  return (
    <StoreProvider>
      <PageErrorBoundary onError={handleAppError}>
        {/* Progress Overlay for manuscript loading */}
        <ProgressOverlay
          isVisible={manuscriptLoading}
          operationName="Loading Manuscript"
          progress={parseProgress / 100} // Convert percentage to 0-1 range
          startTime={progressStartTime || undefined}
          message={progressMessage || operationStage ? `${operationStage}: ${progressMessage || 'Processing...'}` : 'Loading manuscript file...'}
          canCancel={false} // Manuscript loading typically shouldn't be cancellable
        />

        {/* Error Overlay for manuscript loading failures */}
        {manuscriptError && !manuscriptLoading && (
          <ProgressOverlay
            isVisible={true}
            operationName="Manuscript Loading Failed"
            progress={0}
            message={manuscriptError}
            canCancel={false}
            backdrop="dark"
          />
        )}

        {/* Main Application Content */}
        {!manuscriptLoading && !manuscriptError && (
          <div data-testid="app-ready">
            <MainLayout />
          </div>
        )}
      </PageErrorBoundary>
    </StoreProvider>
  );
}
