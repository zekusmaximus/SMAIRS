import React, { Suspense } from 'react';
import { ComponentErrorBoundary, SectionErrorBoundary } from './ErrorBoundary';
import { LoadingState, LoadingSpinner, LoadingSkeleton } from './LoadingStates';
import { globalErrorRecovery } from '../../utils/error-recovery';

export interface AsyncWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorBoundary?: 'component' | 'section' | 'none';
  errorLabel?: string;
  className?: string;
  loadingMessage?: string;
  onError?: (error: Error) => void;
}

/**
 * Comprehensive wrapper that combines Suspense with Error Boundaries
 * for handling both loading states and errors in async components
 */
export const AsyncWrapper: React.FC<AsyncWrapperProps> = ({
  children,
  fallback,
  errorBoundary = 'component',
  errorLabel,
  className = '',
  loadingMessage,
  onError
}) => {
  const loadingFallback = fallback || (
    <div className={`flex items-center justify-center py-4 ${className}`}>
      <div className="flex flex-col items-center space-y-3">
        <LoadingSpinner />
        {loadingMessage && (
          <p className="text-sm text-gray-500">{loadingMessage}</p>
        )}
      </div>
    </div>
  );

  const content = (
    <Suspense fallback={loadingFallback}>
      {children}
    </Suspense>
  );

  // Wrap with appropriate error boundary
  switch (errorBoundary) {
    case 'section':
      return (
        <SectionErrorBoundary label={errorLabel} onError={onError}>
          {content}
        </SectionErrorBoundary>
      );
    case 'component':
      return (
        <ComponentErrorBoundary label={errorLabel} onError={onError}>
          {content}
        </ComponentErrorBoundary>
      );
    case 'none':
    default:
      return content;
  }
};

/**
 * Hook for creating async operations with built-in error recovery
 */
export function useAsyncOperation<T = unknown>(operationId: string) {
  const [state, setState] = React.useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({
    data: null,
    loading: false,
    error: null
  });

  const execute = React.useCallback(async (
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      onSuccess?: (data: T) => void;
      onError?: (error: Error) => void;
    } = {}
  ) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const result = await globalErrorRecovery.withRetry(
        operationId,
        operation,
        {
          maxRetries: options.maxRetries || 3,
          context: { timestamp: Date.now() }
        }
      );

      setState({ data: result, loading: false, error: null });
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, loading: false, error: errorObj }));
      options.onError?.(errorObj);
      throw error;
    }
  }, [operationId]);

  const reset = React.useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

/**
 * Higher-order component for wrapping components with async loading and error handling
 */
export function withAsyncHandling<P extends object>(
  Component: React.ComponentType<P>,
  options: {
    errorLabel?: string;
    loadingMessage?: string;
    errorBoundary?: 'component' | 'section' | 'none';
    fallback?: React.ComponentType;
  } = {}
) {
  const WrappedComponent = (props: P) => (
    <AsyncWrapper
      errorLabel={options.errorLabel}
      loadingMessage={options.loadingMessage}
      errorBoundary={options.errorBoundary}
      fallback={options.fallback ? <options.fallback /> : undefined}
    >
      <Component {...props} />
    </AsyncWrapper>
  );

  WrappedComponent.displayName = `withAsyncHandling(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

/**
 * Specialized async wrappers for common scenarios
 */

export const LazyComponentWrapper: React.FC<{
  children: React.ReactNode;
  label?: string;
  skeletonLines?: number;
}> = ({ children, label, skeletonLines = 3 }) => (
  <AsyncWrapper
    errorLabel={label}
    errorBoundary="component"
    fallback={
      <div className="space-y-2">
        {Array.from({ length: skeletonLines }, (_, i) => (
          <LoadingSkeleton key={i} height="1rem" />
        ))}
      </div>
    }
  >
    {children}
  </AsyncWrapper>
);

export const LazyPageWrapper: React.FC<{
  children: React.ReactNode;
  pageName?: string;
}> = ({ children, pageName }) => (
  <AsyncWrapper
    errorLabel={`${pageName} page`}
    errorBoundary="section"
    loadingMessage={`Loading ${pageName}...`}
    fallback={
      <div className="flex items-center justify-center min-h-64">
        <div className="flex flex-col items-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-500">Loading {pageName}...</p>
        </div>
      </div>
    }
  >
    {children}
  </AsyncWrapper>
);

/**
 * Component for handling data fetching with loading and error states
 */
export interface DataFetcherProps<T> {
  fetchData: () => Promise<T>;
  dependencies?: React.DependencyList;
  children: (data: T) => React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: (error: Error, retry: () => void) => React.ReactNode;
  emptyComponent?: React.ReactNode;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function DataFetcher<T>({
  fetchData,
  dependencies = [],
  children,
  loadingComponent,
  errorComponent,
  emptyComponent,
  onSuccess,
  onError
}: DataFetcherProps<T>) {
  const { data, loading, error, execute } = useAsyncOperation<T>('data-fetcher');

  React.useEffect(() => {
    execute(fetchData, { onSuccess, onError });
  }, dependencies);

  const retry = React.useCallback(() => {
    execute(fetchData, { onSuccess, onError });
  }, [execute, fetchData, onSuccess, onError]);

  return (
    <LoadingState
      loading={loading}
      error={error}
      isEmpty={!loading && !error && !data}
      loadingComponent={loadingComponent}
      errorComponent={errorComponent ? errorComponent(error!, retry) : undefined}
      emptyComponent={emptyComponent}
      retry={retry}
    >
      {data ? children(data) : null}
    </LoadingState>
  );
}

/**
 * Hook for managing multiple async operations
 */
export function useAsyncOperations() {
  const [operations, setOperations] = React.useState<Map<string, {
    loading: boolean;
    error: Error | null;
  data: unknown;
  }>>(new Map());

  const isAnyLoading = React.useMemo(() =>
    Array.from(operations.values()).some(op => op.loading),
    [operations]
  );

  const hasErrors = React.useMemo(() =>
    Array.from(operations.values()).some(op => op.error),
    [operations]
  );

  const execute = React.useCallback(
    async function executeOperation<T>(
      operationId: string,
      operation: () => Promise<T>
    ): Promise<T> {
      setOperations(prev => new Map(prev).set(operationId, {
        loading: true,
        error: null,
        data: null
      }));

      try {
        const result = await globalErrorRecovery.withRetry(operationId, operation);

        setOperations(prev => new Map(prev).set(operationId, {
          loading: false,
          error: null,
          data: result
        }));

        return result;
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));

        setOperations(prev => new Map(prev).set(operationId, {
          loading: false,
          error: errorObj,
          data: null
        }));

        throw error;
      }
    },
    []
  );

  const getOperation = React.useCallback((operationId: string) =>
    operations.get(operationId) || { loading: false, error: null, data: null },
    [operations]
  );

  const resetOperation = React.useCallback((operationId: string) => {
    setOperations(prev => {
      const next = new Map(prev);
      next.delete(operationId);
      return next;
    });
  }, []);

  const resetAll = React.useCallback(() => {
    setOperations(new Map());
  }, []);

  return {
    execute,
    getOperation,
    resetOperation,
    resetAll,
    isAnyLoading,
    hasErrors,
    operations: Object.fromEntries(operations)
  };
}

export default AsyncWrapper;
