import React, { useState, useEffect, useCallback } from 'react';
import { globalErrorReporter, ErrorReport, RecoveryAction, ErrorCategory, ErrorSeverity } from '../../utils/error-reporter';

export interface ErrorToastProps {
  error: ErrorReport;
  onDismiss: (errorId: string) => void;
  onAction?: (action: RecoveryAction) => void;
  autoHideDelay?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

export interface ErrorToastContainerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
  autoHideDelay?: number;
}

interface ToastState {
  id: string;
  error: ErrorReport;
  visible: boolean;
  timeoutId?: NodeJS.Timeout;
}

// Individual error toast component
const ErrorToast: React.FC<ErrorToastProps> = ({
  error,
  onDismiss,
  onAction,
  autoHideDelay = 5000,
  position = 'top-right'
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (autoHideDelay > 0) {
      const timeoutId = setTimeout(() => {
        handleDismiss();
      }, autoHideDelay);

      return () => clearTimeout(timeoutId);
    }
  }, [autoHideDelay]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => onDismiss(error.id), 300); // Wait for animation
  }, [error.id, onDismiss]);

  const handleAction = useCallback((action: RecoveryAction) => {
    onAction?.(action);
    if (!action.primary) {
      handleDismiss();
    }
  }, [onAction, handleDismiss]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600 border-red-700';
      case 'high':
        return 'bg-red-500 border-red-600';
      case 'medium':
        return 'bg-orange-500 border-orange-600';
      case 'low':
      default:
        return 'bg-yellow-500 border-yellow-600';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'high':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'medium':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'low':
      default:
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <div
      className={`
        max-w-sm w-full bg-white shadow-lg rounded-lg border-l-4 overflow-hidden transform transition-all duration-300 ease-in-out
        ${getSeverityColor(error.severity)}
        ${isVisible ? 'translate-x-0 opacity-100' : position.includes('right') ? 'translate-x-full opacity-0' : '-translate-x-full opacity-0'}
        ${isExpanded ? 'max-h-96' : 'max-h-20'}
      `}
      role="alert"
      aria-live="assertive"
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getSeverityIcon(error.severity)}
          </div>
          <div className="ml-3 w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {error.userMessage.title}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {error.userMessage.message}
            </p>

            {/* Suggestions */}
            {error.userMessage.suggestions.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  {isExpanded ? 'Hide suggestions' : 'Show suggestions'}
                </button>
                {isExpanded && (
                  <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                    {error.userMessage.suggestions.map((suggestion, index) => (
                      <li key={index}>{suggestion}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={handleDismiss}
              className="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 rounded-md p-1"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Recovery Actions */}
        {error.recoveryActions && error.recoveryActions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {error.recoveryActions.slice(0, 2).map((action, index) => (
              <button
                key={index}
                onClick={() => handleAction(action)}
                className={`
                  px-3 py-1 text-xs font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2
                  ${action.primary
                    ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500'
                  }
                `}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Container component for managing multiple toasts
export const ErrorToastContainer: React.FC<ErrorToastContainerProps> = ({
  position = 'top-right',
  maxToasts = 5,
  autoHideDelay = 5000
}) => {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  useEffect(() => {
    const handleErrorReported = (event: Event) => {
      const customEvent = event as CustomEvent<ErrorReport>;
      const error = customEvent.detail;

      const newToast: ToastState = {
        id: error.id,
        error,
        visible: true
      };

      setToasts(prevToasts => {
        const updatedToasts = [newToast, ...prevToasts];
        return updatedToasts.slice(0, maxToasts);
      });
    };

    globalErrorReporter.addEventListener('error-reported', handleErrorReported);

    return () => {
      globalErrorReporter.removeEventListener('error-reported', handleErrorReported);
    };
  }, [maxToasts]);

  const handleDismiss = useCallback((errorId: string) => {
    setToasts(prevToasts =>
      prevToasts.filter(toast => toast.id !== errorId)
    );
  }, []);

  const handleAction = useCallback((action: RecoveryAction) => {
    try {
      action.action();
    } catch (error) {
      console.error('Error executing recovery action:', error);
    }
  }, []);

  const getPositionClasses = () => {
    const baseClasses = 'fixed z-50 pointer-events-none';
    switch (position) {
      case 'top-right':
        return `${baseClasses} top-4 right-4 space-y-2`;
      case 'top-left':
        return `${baseClasses} top-4 left-4 space-y-2`;
      case 'bottom-right':
        return `${baseClasses} bottom-4 right-4 space-y-2`;
      case 'bottom-left':
        return `${baseClasses} bottom-4 left-4 space-y-2`;
      case 'top-center':
        return `${baseClasses} top-4 left-1/2 transform -translate-x-1/2 space-y-2`;
      case 'bottom-center':
        return `${baseClasses} bottom-4 left-1/2 transform -translate-x-1/2 space-y-2`;
      default:
        return `${baseClasses} top-4 right-4 space-y-2`;
    }
  };

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className={getPositionClasses()}>
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ErrorToast
            error={toast.error}
            onDismiss={handleDismiss}
            onAction={handleAction}
            autoHideDelay={autoHideDelay}
            position={position}
          />
        </div>
      ))}
    </div>
  );
};

// Hook for manually showing error toasts
export function useErrorToast() {
  const showError = useCallback((error: Error, options?: {
    category?: string;
    severity?: string;
    recoveryActions?: RecoveryAction[];
  }) => {
    globalErrorReporter.report(error, {
      category: options?.category as ErrorCategory,
      severity: options?.severity as ErrorSeverity,
      recoveryActions: options?.recoveryActions
    });
  }, []);

  return { showError };
}

// Default export for easy importing
export default ErrorToast;
