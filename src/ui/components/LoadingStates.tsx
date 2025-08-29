import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'white' | 'gray';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  };

  const colorClasses = {
    primary: 'text-blue-600',
    secondary: 'text-gray-600',
    white: 'text-white',
    gray: 'text-gray-400'
  };

  return (
    <svg
      className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="progressbar"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
};

export interface LoadingSkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular' | 'rounded';
  animation?: 'pulse' | 'wave' | 'none';
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  width = '100%',
  height = '1rem',
  className = '',
  variant = 'rectangular',
  animation = 'pulse'
}) => {
  const baseClasses = 'bg-gray-200';

  const variantClasses = {
    text: 'rounded',
    rectangular: '',
    circular: 'rounded-full',
    rounded: 'rounded-lg'
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-ping',
    none: ''
  };

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
      role="progressbar"
      aria-label="Loading content"
    />
  );
};

export interface LoadingOverlayProps {
  isVisible: boolean;
  children?: React.ReactNode;
  message?: string;
  progress?: number;
  className?: string;
  backdrop?: 'transparent' | 'light' | 'dark';
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  children,
  message,
  progress,
  className = '',
  backdrop = 'light'
}) => {
  if (!isVisible) return null;

  const backdropClasses = {
    transparent: 'bg-transparent',
    light: 'bg-white/80 backdrop-blur-sm',
    dark: 'bg-black/50 backdrop-blur-sm'
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${backdropClasses[backdrop]} ${className}`}
      role="progressbar"
      aria-busy="true"
      aria-label={message || 'Loading'}
    >
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center">
          {children || <LoadingSpinner size="lg" />}

          {message && (
            <p className="mt-4 text-sm text-gray-600 text-center">
              {message}
            </p>
          )}

          {typeof progress === 'number' && (
            <div className="w-full mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface LoadingStateProps {
  loading: boolean;
  error?: Error | string | null;
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
  isEmpty?: boolean;
  retry?: () => void;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  loading,
  error,
  children,
  loadingComponent,
  errorComponent,
  emptyComponent,
  isEmpty = false,
  retry,
  className = ''
}) => {
  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        {loadingComponent || (
          <div className="flex flex-col items-center space-y-4">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    const errorMessage = typeof error === 'string' ? error : error.message;

    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        {errorComponent || (
          <div className="text-center">
            <div className="mb-4">
              <svg
                className="h-12 w-12 text-red-500 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Something went wrong
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {errorMessage}
            </p>
            {retry && (
              <button
                onClick={retry}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        {emptyComponent || (
          <div className="text-center">
            <div className="mb-4">
              <svg
                className="h-12 w-12 text-gray-400 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No data available
            </h3>
            <p className="text-sm text-gray-600">
              There's nothing to display at the moment.
            </p>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
};

// Hook for managing async loading states
export interface UseLoadingStateOptions<T> {
  initialLoading?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface LoadingStateResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (asyncFn: () => Promise<T>) => Promise<T | undefined>;
  reset: () => void;
}

export function useLoadingState<T = unknown>(
  options: UseLoadingStateOptions<T> = {}
): LoadingStateResult<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(options.initialLoading || false);
  const [error, setError] = React.useState<Error | null>(null);

  const execute = React.useCallback(async (asyncFn: () => Promise<T>) => {
    try {
      setLoading(true);
      setError(null);
      const result = await asyncFn();
      setData(result);
      options.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [options]);

  const reset = React.useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return { data, loading, error, execute, reset };
}

// Specialized loading components for common scenarios

export const AnalysisLoadingState: React.FC<{ progress?: number; currentStep?: string }> = ({
  progress,
  currentStep
}) => (
  <div className="flex flex-col items-center space-y-4 py-8">
    <LoadingSpinner size="lg" />
    <div className="text-center">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Analyzing Manuscript
      </h3>
      {currentStep && (
        <p className="text-sm text-gray-600 mb-4">
          {currentStep}
        </p>
      )}
      {typeof progress === 'number' && (
        <div className="w-64">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  </div>
);

export const ExportLoadingState: React.FC<{
  progress?: number;
  currentFile?: string;
  filesProcessed?: number;
  totalFiles?: number;
}> = ({ progress, currentFile, filesProcessed, totalFiles }) => (
  <div className="flex flex-col items-center space-y-4 py-8">
    <div className="relative">
      <LoadingSpinner size="lg" />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          className="h-6 w-6 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
    </div>

    <div className="text-center">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Exporting Files
      </h3>
      {currentFile && (
        <p className="text-sm text-gray-600 mb-2">
          Processing: {currentFile}
        </p>
      )}
      {filesProcessed !== undefined && totalFiles && (
        <p className="text-xs text-gray-500 mb-4">
          {filesProcessed} of {totalFiles} files processed
        </p>
      )}
      {typeof progress === 'number' && (
        <div className="w-64">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  </div>
);

export const ManuscriptSkeletonLoader: React.FC = () => (
  <div className="space-y-4 p-4" data-testid="manuscript-skeleton">
    {/* Header skeleton */}
    <div className="space-y-2">
      <LoadingSkeleton height="2rem" width="60%" variant="rounded" />
      <LoadingSkeleton height="1rem" width="40%" variant="rounded" />
    </div>

    {/* Content skeleton */}
    <div className="space-y-3">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="space-y-2">
          <LoadingSkeleton height="1rem" width="100%" />
          <LoadingSkeleton height="1rem" width="95%" />
          <LoadingSkeleton height="1rem" width="88%" />
        </div>
      ))}
    </div>

    {/* Action buttons skeleton */}
    <div className="flex space-x-2 mt-6">
      <LoadingSkeleton height="2.5rem" width="6rem" variant="rounded" />
      <LoadingSkeleton height="2.5rem" width="6rem" variant="rounded" />
    </div>
  </div>
);

export default LoadingState;
