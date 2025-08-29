import React, { useEffect } from 'react';
import { useExportStore, type ExportStep } from '../hooks/useExportStore.js';
import { ProgressBar } from './ProgressBar.js';
import { Button } from './Button.js';
import ErrorBoundary from './ErrorBoundary.js';

interface ExportProgressIndicatorProps {
  className?: string;
  onComplete?: (result: { outputPath: string; filesGenerated: Array<{ path: string; size: number }> }) => void;
  onError?: (error: string) => void;
}

export function ExportProgressIndicator({
  className = '',
  onComplete,
  onError
}: ExportProgressIndicatorProps) {
  // Local default to avoid issues when the store module is mocked in tests
  const DEFAULT_EXPORT_STEPS: ExportStep[] = [
    { id: 'validate', label: 'Validating Content', description: 'Checking manuscript structure and changes', estimated: 2 },
    { id: 'process', label: 'Processing Changes', description: 'Applying revisions and generating clean text', estimated: 5 },
    { id: 'generate_markdown', label: 'Generating Markdown', description: 'Creating formatted manuscript files', estimated: 3 },
    { id: 'generate_docx', label: 'Creating DOCX', description: 'Converting to Microsoft Word format', estimated: 8 },
    { id: 'generate_pdf', label: 'Creating PDF', description: 'Rendering final PDF document', estimated: 10 },
    { id: 'create_package', label: 'Packaging Files', description: 'Creating submission bundle', estimated: 3 },
    { id: 'finalize', label: 'Finalizing', description: 'Completing export process', estimated: 1 },
  ];
  const {
    state: exportState,
    progress,
    currentStep,
    steps: storeSteps,
    error,
    outputPath,
    filesGenerated,
    retryExport,
    resetExport,
    openExportFolder,
    getStepStatus,
    getTimeElapsed,
    getTimeRemaining
  } = useExportStore();

  const steps = storeSteps && storeSteps.length > 0 ? storeSteps : DEFAULT_EXPORT_STEPS;

  const transitionClasses = exportState === 'idle' ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100';

  // no-op visibility handler: container remains mounted for accessibility tests
  useEffect(() => {
    // intentionally left blank
  }, [exportState]);

  // Callback effects
  useEffect(() => {
    if (exportState === 'complete' && onComplete && outputPath && filesGenerated) {
      onComplete({ outputPath, filesGenerated });
    }
  }, [exportState, onComplete, outputPath, filesGenerated]);

  useEffect(() => {
    if (exportState === 'error' && onError && error) {
      onError(error);
    }
  }, [exportState, onError, error]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    const mb = bytes / (1024 * 1024);
    return `${(Math.round(mb * 10) / 10).toFixed(1)}MB`;
  };

  return (
    <ErrorBoundary label="Export Progress Indicator">
      <div data-testid="export-progress-indicator" className={`
        fixed bottom-4 right-4 w-96 max-w-[calc(100vw-2rem)] z-50
        bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700
        transform transition-all duration-300 ease-in-out
        ${transitionClasses}
        ${className}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className={`${transitionClasses} ${className}`}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {exportState === 'complete' ? '✅ Export Complete' :
               exportState === 'error' ? '❌ Export Failed' :
               '📦 Exporting Bundle'
              }
            </h3>
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <span>{Math.round(progress * 100)}% complete</span>
              {exportState === 'exporting' && getTimeRemaining() && (
                <span>• ~{formatTime(getTimeRemaining()!)} remaining</span>
              )}
              {(exportState === 'complete' || exportState === 'error') && (
                <span>• took {formatTime(getTimeElapsed())}</span>
              )}
            </div>
            {exportState === 'exporting' && (
              <span className="animate-pulse" aria-hidden="true" />
            )}
          </div>

          {exportState === 'complete' && (
            <button
              onClick={resetExport}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

    {/* Progress Bar */}
        <div className="px-4 pt-3">
          <ProgressBar
            value={progress}
            max={1}
            className={`
              transition-all duration-500
              ${exportState === 'complete' ? 'opacity-100' :
                exportState === 'error' ? 'opacity-50' :
                'opacity-100'
              }
            `}
      label="Export progress"
      showPercentage={false}
          />
        </div>

  {/* Steps */}
        <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
          {steps.map((step, idx) => (
            <ExportStepComponent
              key={step.id}
              step={step}
              status={getStepStatus(idx, currentStep)}
              isActive={idx === currentStep}
              progress={idx === currentStep ? (progress * steps.length) % 1 : undefined}
            />
          ))}
        </div>

        {/* Error State */}
        {exportState === 'error' && error && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                    Export Failed
                  </h4>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    {error}
                  </p>
                  <div className="mt-3">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={retryExport}
                    >
                      Retry Export
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live region for status updates */}
        <div className="sr-only" aria-live="polite">
          {exportState === 'exporting' && `Exporting: ${Math.round(progress * 100)} percent`}
          {exportState === 'complete' && 'Export complete'}
          {exportState === 'error' && `Export failed: ${error ?? ''}`}
        </div>

        {/* Success State */}
        {exportState === 'complete' && outputPath && filesGenerated && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-green-800 dark:text-green-200">
                    Export Completed Successfully
                  </h4>
                  <p className="mt-1 text-xs text-green-700 dark:text-green-300 font-mono">
                    {outputPath}
                  </p>

                  {/* Files Generated */}
                  <div className="mt-2">
                    <h5 className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">
                      Files Generated ({filesGenerated.length}):
                    </h5>
                    <div className="space-y-1">
                      {filesGenerated.map((file, index) => (
                        <div key={index} className="flex justify-between items-center text-xs text-green-700 dark:text-green-300">
                          <span className="font-mono truncate">{file.path}</span>
                          <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                            {formatFileSize(file.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex space-x-2">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={openExportFolder}
                      icon="📁"
                    >
                      Open Folder
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetExport}
                    >
                      Start New
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Progress Animation */}
  {exportState === 'exporting' && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 rounded-b-lg opacity-75">
            <div className="h-full bg-white dark:bg-gray-800 animate-pulse" />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

// Export Step Component
interface ExportStepProps {
  step: ExportStep;
  status: 'pending' | 'active' | 'completed';
  isActive: boolean;
  progress?: number;
}

function ExportStepComponent({ step, status, isActive, progress }: ExportStepProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return (
          <div className="flex-shrink-0 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        );
      case 'active':
        return (
          <div className="flex-shrink-0 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          </div>
        );
      case 'pending':
        return (
          <div className="flex-shrink-0 w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded-full" />
        );
    }
  };

  return (
    <div className={`
      flex items-start space-x-3 transition-all duration-200
      ${isActive ? 'scale-[1.02]' : 'scale-100'}
    `}>
      {getStatusIcon()}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className={`
            text-sm font-medium transition-colors duration-200
            ${status === 'completed' ? 'text-green-700 dark:text-green-300' :
              status === 'active' ? 'text-blue-700 dark:text-blue-300' :
              'text-gray-500 dark:text-gray-400'
            }
          `}>
            {step.label}
            {isActive && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                Processing...
              </span>
            )}
          </div>

          {status === 'active' && progress !== undefined && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {Math.round(progress * 100)}%
            </div>
          )}
        </div>

        <p className={`
          text-xs mt-1 transition-colors duration-200
          ${status === 'active' ? 'text-gray-600 dark:text-gray-400' :
            'text-gray-500 dark:text-gray-500'
          }
        `}>
          {step.description}
        </p>

        {/* Mini progress bar for active step */}
        {isActive && progress !== undefined && (
          <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
            <div
              className="h-1 bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ExportProgressIndicator;
