import React, { useState, useMemo } from 'react';
import { useJobProgress, type JobStatus } from '@/hooks/useJobProgress';
import { queueSize } from '@/lib/jobQueue';
import { LoadingSpinner } from './LoadingStates';

export interface OperationStatusProps {
  jobId?: string;
  compact?: boolean;
  className?: string;
  showQueue?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}

export interface OperationItem {
  id: string;
  label: string;
  status: JobStatus;
  progress: number;
  step?: string;
  error?: string;
  timestamp: number;
}

export const OperationStatus: React.FC<OperationStatusProps> = ({
  jobId,
  compact = false,
  className = '',
  showQueue = true,
  onExpand,
  onCollapse
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { status, progress, step, error, logs } = useJobProgress(jobId);
  const queueCount = useMemo(() => queueSize(), [status]);

  const isActive = status === 'running' || status === 'queued' || status === 'error';
  const hasOperations = isActive || queueCount > 0;

  // Don't render if no active operations
  if (!hasOperations) return null;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded && onExpand) onExpand();
    if (isExpanded && onCollapse) onCollapse();
  };

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case 'running':
        return <LoadingSpinner size="sm" className="text-blue-600" />;
      case 'done':
        return (
          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'queued':
        return (
          <svg className="w-4 h-4 text-gray-500 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'running': return 'text-blue-700 dark:text-blue-300';
      case 'done': return 'text-green-700 dark:text-green-300';
      case 'error': return 'text-red-700 dark:text-red-300';
      case 'queued': return 'text-gray-600 dark:text-gray-400';
      default: return 'text-gray-500 dark:text-gray-400';
    }
  };

  if (compact) {
    return (
      <div
        className={`p-2 rounded shadow bg-white/95 dark:bg-neutral-900/95 border border-neutral-200 dark:border-neutral-800 flex items-center gap-2 max-w-xs ${className}`}
        role="region"
        aria-live="polite"
        aria-label="Operation status"
      >
        <button
          className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 flex-shrink-0 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-controls="operation-details"
          aria-label={isExpanded ? "Collapse operation details" : "Expand operation details"}
        >
          {isExpanded ? '−' : '+'}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {getStatusIcon(status)}
            <div className={`text-xs truncate ${getStatusColor(status)}`}>
              {error ? `Error: ${error}` : (step || "Processing...")}
            </div>
          </div>

          <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden mt-1 progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Operation progress">
            <div className="h-full bg-blue-600 progress-fill transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {showQueue && queueCount > 0 && (
          <div className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 flex-shrink-0" title={`${queueCount} operations in queue`}>
            {queueCount}
          </div>
        )}
      </div>
    );
  }

  // Full-width mode
  return (
    <div className={`fixed bottom-0 left-0 right-0 z-40 ${className}`} role="region" aria-live="polite" aria-label="Operation status">
      <div className="mx-auto max-w-screen-2xl">
        <div className="m-2 p-3 rounded shadow bg-white/95 dark:bg-neutral-900/95 border border-neutral-200 dark:border-neutral-800">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {getStatusIcon(status)}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {status === 'done' ? 'Operation Complete' :
                   status === 'error' ? 'Operation Failed' :
                   status === 'running' ? 'Operation in Progress' :
                   status === 'queued' ? 'Operation Queued' :
                   'Operations'}
                </h3>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span>{Math.round(progress)}% complete</span>
                  {showQueue && queueCount > 0 && (
                    <span>• {queueCount} in queue</span>
                  )}
                </div>
              </div>
            </div>

            <button
              className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              onClick={handleToggle}
              aria-expanded={isExpanded}
              aria-controls="operation-details"
              aria-label={isExpanded ? "Collapse operation details" : "Expand operation details"}
            >
              {isExpanded ? 'Hide Details' : 'Show Details'}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-2 mb-3">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>

          {/* Current Operation */}
          <div className="flex items-center justify-between text-sm">
            <span className={`font-medium ${getStatusColor(status)}`}>
              {error ? `Error: ${error}` : (step || "Processing...")}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {Math.round(progress)}%
            </span>
          </div>

          {/* Expanded Details */}
          {isExpanded && (
            <div
              id="operation-details"
              className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 animate-in slide-in-from-top-2 duration-200"
            >
              {/* Operation Logs */}
              {logs.length > 0 && (
                <div className="space-y-2 mb-4">
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Recent Activity
                  </h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {logs.slice(-5).map((log, index) => (
                      <div key={index} className="flex items-start gap-2 text-xs">
                        <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`flex-1 ${log.level === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Queue Visualization */}
              {showQueue && queueCount > 1 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Queue ({queueCount - 1} pending)
                  </h4>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(queueCount - 1, 5) }, (_, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full animate-pulse"
                        style={{ animationDelay: `${i * 0.1}s` }}
                        title={`Operation ${i + 2} in queue`}
                      />
                    ))}
                    {queueCount > 6 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex items-center">
                        +{queueCount - 6} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error Details */}
              {status === 'error' && error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <h5 className="text-sm font-medium text-red-800 dark:text-red-200">
                        Operation Failed
                      </h5>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                        {error}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Screen reader announcements */}
          <div className="sr-only" aria-live="polite">
            {status === 'running' && `Operation in progress: ${Math.round(progress)} percent complete`}
            {status === 'done' && 'Operation completed successfully'}
            {status === 'error' && `Operation failed: ${error || 'Unknown error'}`}
            {status === 'queued' && 'Operation queued for processing'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationStatus;
