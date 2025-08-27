import React from 'react';
import { globalErrorRecovery } from '../../utils/error-recovery';

export interface ErrorInfo {
  componentStack: string;
  errorBoundary?: string;
  errorBoundaryStack?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
  retryCount: number;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{
    error: Error;
    errorInfo?: ErrorInfo;
    retry: () => void;
    reset: () => void;
  }>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'section' | 'component';
  label?: string;
  showDetails?: boolean;
  maxRetries?: number;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId?: NodeJS.Timeout;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { onError, label, level = 'component' } = this.props;
    const enhancedErrorInfo: ErrorInfo = {
      componentStack: errorInfo.componentStack || '',
      errorBoundary: label || 'Unknown',
      errorBoundaryStack: errorInfo.componentStack || ''
    };

    this.setState({ errorInfo: enhancedErrorInfo });

    // Log to console for development
    console.group(`🚨 Error Boundary (${level}): ${label || 'Unknown'}`);
    console.error('Error:', error);
    console.error('Error Info:', enhancedErrorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();

    // Report to error tracking service in production
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, enhancedErrorInfo);
    }

    // Call custom error handler
    onError?.(error, enhancedErrorInfo);

    // Integrate with global error recovery
    if (this.state.errorId) {
      globalErrorRecovery.queueOperation(
        `error-boundary-${this.state.errorId}`,
        async () => {
          // Attempt to recover by clearing the error state
          this.handleRetry();
          return 'recovered';
        },
        {
          maxRetries: this.props.maxRetries || 2,
          context: {
            errorBoundaryLevel: level,
            label,
            errorMessage: error.message
          }
        }
      );
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // In a real app, this would send to an error tracking service like Sentry
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      level: this.props.level,
      label: this.props.label
    };

    // For now, just log to console in production builds
    console.error('Error Report:', errorReport);
  };

  private handleRetry = () => {
    const maxRetries = this.props.maxRetries || 3;
    
    if (this.state.retryCount >= maxRetries) {
      console.warn(`Max retries (${maxRetries}) reached for error boundary`);
      return;
    }

    this.setState(prevState => ({
      retryCount: prevState.retryCount + 1
    }));

    // Delay retry to prevent rapid retries
    this.retryTimeoutId = setTimeout(() => {
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        errorId: undefined
      });
    }, 1000 * Math.pow(2, this.state.retryCount)); // Exponential backoff
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorId: undefined,
      retryCount: 0
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { fallback: Fallback, children, level = 'component', label, showDetails = false } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (Fallback) {
        return (
          <Fallback
            error={error}
            errorInfo={errorInfo}
            retry={this.handleRetry}
            reset={this.handleReset}
          />
        );
      }

      // Default fallback UI based on error level
      return this.renderDefaultFallback(error, errorInfo, level, label, showDetails);
    }

    return <>{children}</>;
  }

  private renderDefaultFallback(
    error: Error,
    errorInfo?: ErrorInfo,
    level: 'page' | 'section' | 'component' = 'component',
    label?: string,
    showDetails = false
  ) {
    const maxRetries = this.props.maxRetries || 3;
    const canRetry = this.state.retryCount < maxRetries;

    // Different styles based on error level
    const levelStyles = {
      page: 'min-h-screen flex items-center justify-center bg-gray-50',
      section: 'p-6 bg-red-50 border border-red-200 rounded-lg',
      component: 'p-4 text-sm bg-red-50 border border-red-200 rounded'
    };

    const contentStyles = {
      page: 'max-w-md mx-auto text-center',
      section: 'text-center',
      component: 'text-left'
    };

    const iconSize = {
      page: 'h-12 w-12',
      section: 'h-8 w-8',
      component: 'h-6 w-6'
    };

    return (
      <div className={levelStyles[level]} role="alert" aria-live="assertive">
        <div className={contentStyles[level]}>
          {/* Error Icon */}
          <div className="flex justify-center mb-4">
            <svg
              className={`${iconSize[level]} text-red-500`}
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

          {/* Error Message */}
          <h2 className={`font-semibold mb-2 ${
            level === 'page' ? 'text-lg text-gray-900' : 'text-red-700'
          }`}>
            {level === 'page'
              ? 'Something went wrong'
              : `Error${label ? ` in ${label}` : ''}`}
          </h2>

          <p className={`mb-4 ${
            level === 'page' ? 'text-gray-600' : 'text-red-600 opacity-80'
          }`}>
            {level === 'page'
              ? 'We encountered an unexpected error. Please try refreshing the page.'
              : 'This component encountered an error and couldn\'t render properly.'}
          </p>

          {/* Error Details (Development/Debug) */}
          {showDetails && (
            <details className="mb-4 text-left">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                Error Details
              </summary>
              <div className="text-xs bg-white p-3 rounded border border-gray-200 font-mono">
                <div className="mb-2">
                  <strong>Error:</strong> {error.message}
                </div>
                {error.stack && (
                  <div className="mb-2">
                    <strong>Stack:</strong>
                    <pre className="whitespace-pre-wrap mt-1 text-gray-600">
                      {error.stack}
                    </pre>
                  </div>
                )}
                {errorInfo?.componentStack && (
                  <div>
                    <strong>Component Stack:</strong>
                    <pre className="whitespace-pre-wrap mt-1 text-gray-600">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Retry Information */}
          {this.state.retryCount > 0 && (
            <div className="mb-4 text-sm text-gray-600">
              Retry attempt {this.state.retryCount} of {maxRetries}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            {canRetry && (
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                data-testid="error-retry-btn"
              >
                Try Again
              </button>
            )}

            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              data-testid="error-reset-btn"
            >
              Reset
            </button>

            {level === 'page' && (
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                data-testid="error-reload-btn"
              >
                Reload Page
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

// Specialized Error Boundaries for different use cases

export const PageErrorBoundary: React.FC<{
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}> = ({ children, onError }) => (
  <ErrorBoundary
    level="page"
    label="Application"
    maxRetries={1}
    showDetails={process.env.NODE_ENV === 'development'}
    onError={onError}
  >
    {children}
  </ErrorBoundary>
);

export const SectionErrorBoundary: React.FC<{
  children: React.ReactNode;
  label?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}> = ({ children, label, onError }) => (
  <ErrorBoundary
    level="section"
    label={label}
    maxRetries={2}
    showDetails={process.env.NODE_ENV === 'development'}
    onError={onError}
  >
    {children}
  </ErrorBoundary>
);

export const ComponentErrorBoundary: React.FC<{
  children: React.ReactNode;
  label?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}> = ({ children, label, onError }) => (
  <ErrorBoundary
    level="component"
    label={label}
    maxRetries={3}
    onError={onError}
  >
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;
