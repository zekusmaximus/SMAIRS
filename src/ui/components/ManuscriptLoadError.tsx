import React from 'react';
import { useManuscriptStore } from '@/stores/manuscript.store';
import { Button } from './Button';

interface ManuscriptLoadErrorProps {
  className?: string;
  onRetry?: () => void;
}

export const ManuscriptLoadError: React.FC<ManuscriptLoadErrorProps> = ({
  className = '',
  onRetry
}) => {
  const { loadingError, openManuscriptDialog, loadManuscript } = useManuscriptStore();

  const handleChooseFile = async () => {
    try {
      const filePath = await openManuscriptDialog();
      if (filePath) {
        await loadManuscript(filePath);
      }
    } catch (error) {
      console.error('Failed to open manuscript file:', error);
    }
  };

  const handleRetry = async () => {
    if (onRetry) {
      onRetry();
    } else {
      // Default retry behavior - try to open file dialog again
      await handleChooseFile();
    }
  };

  return (
    <div className={`flex items-center justify-center min-h-[400px] p-8 ${className}`}>
      <div className="text-center max-w-md w-full">
        {/* Error Icon */}
        <div className="mb-6">
          <svg
            className="h-16 w-16 text-red-500 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>

        {/* Error Title */}
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Failed to Load Manuscript
        </h2>

        {/* Error Message */}
        {loadingError && (
          <div className="mb-6">
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md p-3 border border-red-200 dark:border-red-800">
              {loadingError}
            </p>
          </div>
        )}

        {/* Instructions */}
        <div className="mb-6 text-left">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            To resolve this issue:
          </h3>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>• Select a manuscript file using the button below</li>
            <li>• Ensure the file is not corrupted or in use by another program</li>
            <li>• Check that you have permission to read the file</li>
          </ul>
        </div>

        {/* Supported Formats */}
        <div className="mb-6">
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">
            Supported file formats:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              .txt
            </span>
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              .md
            </span>
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              .manuscript
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={handleChooseFile}
            variant="primary"
            size="md"
            className="flex-1 sm:flex-none"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Choose File
          </Button>

          {onRetry && (
            <Button
              onClick={handleRetry}
              variant="secondary"
              size="md"
              className="flex-1 sm:flex-none"
            >
              Try Again
            </Button>
          )}
        </div>

        {/* Help Text */}
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-500">
          Need help? Check that your manuscript file exists and is accessible.
        </p>
      </div>
    </div>
  );
};

export default ManuscriptLoadError;
