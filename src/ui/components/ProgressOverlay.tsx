import React, { useEffect, useState } from 'react';
import { ProgressBar } from './ProgressBar';
import { Button } from './Button';

export interface ProgressOverlayProps {
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Name of the operation being performed */
  operationName: string;
  /** Current progress value (0-1) */
  progress: number;
  /** Callback when cancel is requested */
  onCancel?: () => void;
  /** Whether the operation can be cancelled */
  canCancel?: boolean;
  /** Start time of the operation for time estimation */
  startTime?: number;
  /** Estimated total duration in seconds */
  estimatedDuration?: number;
  /** Additional CSS classes */
  className?: string;
  /** Backdrop style */
  backdrop?: 'transparent' | 'light' | 'dark';
  /** Custom message to display */
  message?: string;
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
  isVisible,
  operationName,
  progress,
  onCancel,
  canCancel = true,
  startTime,
  estimatedDuration,
  className = '',
  backdrop = 'dark',
  message
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!isVisible || !startTime) return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, startTime]);

  // Reset elapsed time when overlay becomes visible
  useEffect(() => {
    if (isVisible) {
      setElapsedTime(startTime ? Math.floor((Date.now() - startTime) / 1000) : 0);
    }
  }, [isVisible, startTime]);

  if (!isVisible) return null;

  const backdropClasses = {
    transparent: 'bg-transparent',
    light: 'bg-white/80 backdrop-blur-sm',
    dark: 'bg-black/60 backdrop-blur-sm'
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const calculateTimeRemaining = (): number | null => {
    if (!startTime || !estimatedDuration || progress <= 0) return null;

    const totalElapsed = elapsedTime;
    const estimatedTotal = estimatedDuration;

    if (totalElapsed <= 0) return estimatedTotal;

    // Calculate remaining time based on current progress
    const remainingProgress = 1 - progress;
    const timePerProgressUnit = totalElapsed / progress;
    const estimatedRemaining = remainingProgress * timePerProgressUnit;

    return Math.max(0, Math.floor(estimatedRemaining));
  };

  const timeRemaining = calculateTimeRemaining();
  const percentage = Math.round(progress * 100);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${backdropClasses[backdrop]} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-overlay-title"
      aria-describedby="progress-overlay-description"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2
              id="progress-overlay-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {operationName}
            </h2>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {percentage}% complete
              </span>
              {timeRemaining !== null && timeRemaining > 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-500">
                  • ~{formatTime(timeRemaining)} remaining
                </span>
              )}
              {startTime && elapsedTime > 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-500">
                  • {formatTime(elapsedTime)} elapsed
                </span>
              )}
            </div>
          </div>

          {canCancel && onCancel && (
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded transition-colors"
              aria-label="Cancel operation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Progress Section */}
        <div className="p-6">
          {message && (
            <p
              id="progress-overlay-description"
              className="text-sm text-gray-600 dark:text-gray-400 mb-4"
            >
              {message}
            </p>
          )}

          <ProgressBar
            value={progress}
            max={1}
            label="Operation progress"
            showPercentage={false}
            className="mb-4"
          />

          {/* Progress Details */}
          <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
            <span>0%</span>
            <span className="font-medium">{percentage}%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Cancel Button */}
        {canCancel && onCancel && (
          <div className="px-6 pb-6">
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancel}
              className="w-full"
            >
              Cancel Operation
            </Button>
          </div>
        )}

        {/* Live region for screen readers */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {operationName}: {percentage} percent complete
          {timeRemaining !== null && timeRemaining > 0 && `, approximately ${formatTime(timeRemaining)} remaining`}
        </div>
      </div>
    </div>
  );
};

export default ProgressOverlay;
