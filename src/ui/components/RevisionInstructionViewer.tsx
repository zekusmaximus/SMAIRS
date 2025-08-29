import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { RevisionInstruction } from '../../features/export/revision-instructions.js';
import { ViewModeSelector } from './ViewModeSelector.js';
import { SteppedProgressBar } from './ProgressBar.js';
import { Button } from './Button.js';
import ErrorBoundary from './ErrorBoundary.js';

interface RevisionInstructionViewerProps {
  instructions: RevisionInstruction[];
  onApply: (instruction: RevisionInstruction) => void;
  onApplyAll: () => void;
}

type ViewMode = 'list' | 'guided' | 'print';

export function RevisionInstructionViewer({
  instructions,
  onApply,
  onApplyAll
}: RevisionInstructionViewerProps) {
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [currentStep, setCurrentStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('guided');

  // Filter instructions based on search
  const filteredInstructions = useMemo(() => {
    if (!searchQuery.trim()) return instructions;

    const query = searchQuery.toLowerCase();
    return instructions.filter(instruction =>
      instruction.sceneName.toLowerCase().includes(query) ||
      instruction.action.explanation.toLowerCase().includes(query) ||
  instruction.action.verb.toLowerCase().includes(query) ||
      instruction.findContext.targetText.toLowerCase().includes(query)
    );
  }, [instructions, searchQuery]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs, textareas, or contenteditable regions,
      // but still handle Escape to clear search.
      const target = e.target as EventTarget | null;
      const el = (target instanceof Element && typeof target.closest === 'function')
        ? (target as HTMLElement)
        : null;
      const active = document.activeElement instanceof Element ? document.activeElement : null;
      const inInteractive = !!(
        (el && el.closest('input, textarea, [contenteditable="true"]')) ||
        (active && active.closest('input, textarea, [contenteditable="true"]'))
      );
      if (inInteractive && e.key !== 'Escape') return;
      // Escape clears search in all modes
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchQuery('');
        return;
      }
      if (viewMode !== 'guided') return;

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          setCurrentStep(prev => Math.min(prev + 1, filteredInstructions.length - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentStep(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleMarkComplete(currentStep);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, currentStep, filteredInstructions.length]);

  const handleMarkComplete = useCallback((stepIndex: number) => {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(stepIndex)) {
        next.delete(stepIndex);
      } else {
        next.add(stepIndex);
        onApply(filteredInstructions[stepIndex]!);
      }
      return next;
    });
  }, [filteredInstructions, onApply]);

  const handleNext = useCallback(() => {
    setCurrentStep(prev => {
      const nextStep = Math.min(prev + 1, filteredInstructions.length - 1);
      // Auto-advance to next incomplete step
      for (let i = nextStep; i < filteredInstructions.length; i++) {
        if (!completed.has(i)) {
          return i;
        }
      }
      return nextStep;
    });
  }, [filteredInstructions.length, completed]);

  const handlePrevious = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const exportToPDF = useCallback(async () => {
    try {
      // Create a print-friendly version
      const printContent = document.createElement('div');
      printContent.innerHTML = `
        <h1>Revision Instructions</h1>
        <div class="progress-summary">
          <p>Progress: ${completed.size} of ${filteredInstructions.length} completed</p>
        </div>
        ${filteredInstructions.map((instruction, index) => `
          <div class="instruction-card ${completed.has(index) ? 'completed' : ''}">
            <h3>Step ${instruction.stepNumber}: ${getActionTitle(instruction)}</h3>
            <p><strong>Scene:</strong> ${instruction.sceneName}</p>
            <p><strong>Find:</strong> "${instruction.findContext.targetText}"</p>
            ${instruction.action.replacement ? `<p><strong>Replace with:</strong> "${instruction.action.replacement}"</p>` : ''}
            <p><strong>Reason:</strong> ${instruction.action.explanation}</p>
          </div>
        `).join('')}
      `;

      // Trigger browser print dialog
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Revision Instructions</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 2cm; }
                .instruction-card { margin-bottom: 2em; padding: 1em; border: 1px solid #ddd; }
                .completed { background-color: #f0f8ff; }
                .progress-summary { background: #f5f5f5; padding: 1em; margin-bottom: 2em; }
                @media print {
                  .instruction-card { break-inside: avoid; }
                  body { margin: 1cm; }
                }
              </style>
            </head>
            <body>${printContent.innerHTML}</body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error('Export to PDF failed:', error);
    }
  }, [filteredInstructions, completed]);

  const getActionTitle = (instruction: RevisionInstruction): string => {
    switch (instruction.action.verb) {
      case 'Replace': return 'Replace Text';
      case 'Insert': return 'Add Content';
      case 'Delete': return 'Remove Content';
      default: return 'Modify Content';
    }
  };

  if (filteredInstructions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        {instructions.length === 0 ? (
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-lg font-medium mb-2">No Revisions Needed</h3>
            <p>Your manuscript is ready to go!</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-lg font-medium mb-2">No Results Found</h3>
            <p>Try adjusting your search query.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <ErrorBoundary label="Revision Instruction Viewer">
      <div className="revision-viewer max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Revision Instructions
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {filteredInstructions.length} instruction{filteredInstructions.length !== 1 ? 's' : ''}
              {searchQuery && ` (filtered from ${instructions.length})`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <ViewModeSelector mode={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search instructions..."
            aria-label="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setSearchQuery('');
              }
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Progress indicator */}
        <SteppedProgressBar
          total={filteredInstructions.length}
          completed={completed.size}
        />

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            {viewMode === 'guided' && (
              <GuidedMode
                instruction={filteredInstructions[currentStep]}
                stepIndex={currentStep}
                totalSteps={filteredInstructions.length}
                isCompleted={completed.has(currentStep)}
                onComplete={() => handleMarkComplete(currentStep)}
                onNext={handleNext}
                onPrevious={handlePrevious}
              />
            )}

            {viewMode === 'list' && (
              <ListView
                instructions={filteredInstructions}
                completed={completed}
                onToggleComplete={handleMarkComplete}
              />
            )}

            {viewMode === 'print' && (
              <PrintView
                instructions={filteredInstructions}
                completed={completed}
              />
            )}
          </div>

          {/* Context panel */}
          <div className="lg:col-span-1">
            <ContextPanel
              instruction={filteredInstructions[currentStep]}
              highlightColor="bg-yellow-200 dark:bg-yellow-800"
            />
          </div>
        </div>

        {/* Action buttons */}
        <ActionBar
          onApplyAll={onApplyAll}
          onExportPDF={exportToPDF}
          onPrint={() => window.print()}
          completedCount={completed.size}
          totalCount={filteredInstructions.length}
        />

        {/* Keyboard shortcuts help */}
        {viewMode === 'guided' && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              Keyboard Shortcuts
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">→</kbd> Next</div>
              <div><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">←</kbd> Previous</div>
              <div><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Ctrl+Enter</kbd> Complete</div>
              <div><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Esc</kbd> Clear Search</div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

// Sub-components would be defined here...
interface GuidedModeProps {
  instruction?: RevisionInstruction;
  stepIndex: number;
  totalSteps: number;
  isCompleted: boolean;
  onComplete: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

function GuidedMode({
  instruction,
  stepIndex,
  totalSteps,
  isCompleted,
  onComplete,
  onNext,
  onPrevious
}: GuidedModeProps) {
  if (!instruction) {
    return <div className="text-center text-gray-500">No instruction selected</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Step {instruction.stepNumber}: {getActionTitle(instruction)}
          </h2>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {stepIndex + 1} of {totalSteps}
            </span>
            {isCompleted && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                ✓ Complete
              </span>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {instruction.sceneName}
        </p>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Find section */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            📍 Find this text (line ~{instruction.findContext.approximateLine}):
          </h3>
          <div className="font-mono text-sm bg-white dark:bg-gray-800 p-3 rounded border">
            <span className="text-gray-500">{instruction.findContext.precedingText}</span>
            <span className="bg-yellow-200 dark:bg-yellow-800 px-1 font-semibold">
              {instruction.findContext.targetText}
            </span>
            <span className="text-gray-500">{instruction.findContext.followingText}</span>
          </div>
        </div>

        {/* Action section */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            ✏️ {instruction.action.verb}:
          </h3>
          {instruction.action.replacement && (
            <div className="font-mono text-sm bg-white dark:bg-gray-800 p-3 rounded border">
              {instruction.action.replacement}
            </div>
          )}
        </div>

        {/* Explanation */}
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            💡 Why this change:
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {instruction.action.explanation}
          </p>
        </div>

        {/* Before/After preview */}
        {instruction.beforeAfter && (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
              👁️ Show Before/After Preview
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Before:</h4>
                <div className="font-mono text-xs bg-red-50 dark:bg-red-900/20 p-3 rounded border">
                  {instruction.beforeAfter.before.replace(/\*\*(.*?)\*\*/g, '$1')}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">After:</h4>
                <div className="font-mono text-xs bg-green-50 dark:bg-green-900/20 p-3 rounded border">
                  {instruction.beforeAfter.after.replace(/\*\*(.*?)\*\*/g, '$1')}
                </div>
              </div>
            </div>
          </details>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={onPrevious}
          disabled={stepIndex === 0}
        >
          ← Previous
        </Button>

        <div className="flex items-center space-x-3">
          <Button
            variant={isCompleted ? "success" : "primary"}
            onClick={onComplete}
          >
            {isCompleted ? "✓ Completed" : "Mark Complete"}
          </Button>

          <Button
            variant="secondary"
            onClick={onNext}
            disabled={stepIndex >= totalSteps - 1}
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}

// Helper function
function getActionTitle(instruction: RevisionInstruction): string {
  switch (instruction.action.verb) {
    case 'Replace': return 'Replace Text';
    case 'Insert': return 'Add Content';
    case 'Delete': return 'Remove Content';
    default: return 'Modify Content';
  }
}

// Additional sub-components would continue...
interface ListViewProps {
  instructions: RevisionInstruction[];
  completed: Set<number>;
  onToggleComplete: (index: number) => void;
}

function ListView({ instructions, completed, onToggleComplete }: ListViewProps) {
  return (
    <div className="space-y-4">
      {instructions.map((instruction, index) => (
        <div
          key={instruction.stepNumber}
          className={`
            bg-white dark:bg-gray-800 rounded-lg shadow-sm border
            transition-all duration-200
            ${completed.has(index)
              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
              : 'border-gray-200 dark:border-gray-700 hover:shadow-md'
            }
          `}
        >
          <div className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onToggleComplete(index)}
                    className={`
                      flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center
                      transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500
                      ${completed.has(index)
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
                      }
                    `}
                  >
                    {completed.has(index) && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    Step {instruction.stepNumber}: {getActionTitle(instruction)}
                  </h3>

                  {completed.has(index) && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                      Complete
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {instruction.sceneName}
                </p>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Find:</h4>
                    <div className="font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
                      {instruction.findContext.targetText}
                    </div>
                  </div>

                  {instruction.action.replacement && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Replace with:</h4>
                      <div className="font-mono text-xs bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                        {instruction.action.replacement}
                      </div>
                    </div>
                  )}
                </div>

                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  <strong>Why:</strong> {instruction.action.explanation}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface PrintViewProps {
  instructions: RevisionInstruction[];
  completed: Set<number>;
}

function PrintView({ instructions, completed }: PrintViewProps) {
  return (
    <div className="bg-white text-black p-8 print:p-0" style={{ fontFamily: 'serif' }}>
      <div className="text-center mb-8 print:mb-6">
        <h1 className="text-3xl font-bold mb-2">Revision Instructions</h1>
        <p className="text-gray-600">
          {completed.size} of {instructions.length} completed
        </p>
      </div>

      <div className="space-y-6 print:space-y-4">
        {instructions.map((instruction, index) => (
          <div
            key={instruction.stepNumber}
            className={`
              border border-gray-300 p-4 rounded print:break-inside-avoid
              ${completed.has(index) ? 'bg-gray-50' : ''}
            `}
          >
            <div className="flex items-center mb-3">
              <div className={`
                w-6 h-6 rounded border-2 border-gray-400 mr-3 flex items-center justify-center
                ${completed.has(index) ? 'bg-gray-400' : ''}
              `}>
                {completed.has(index) && <span className="text-white text-sm">✓</span>}
              </div>
              <h2 className="text-lg font-bold">
                Step {instruction.stepNumber}: {getActionTitle(instruction)}
              </h2>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              <strong>Scene:</strong> {instruction.sceneName}
            </p>

            <div className="mb-3">
              <h3 className="font-semibold mb-1">Find this text:</h3>
              <div className="font-mono text-sm bg-gray-100 p-2 border">
                {instruction.findContext.precedingText}
                <strong className="bg-yellow-200 px-1">{instruction.findContext.targetText}</strong>
                {instruction.findContext.followingText}
              </div>
            </div>

            {instruction.action.replacement && (
              <div className="mb-3">
                <h3 className="font-semibold mb-1">{instruction.action.verb} with:</h3>
                <div className="font-mono text-sm bg-gray-100 p-2 border">
                  {instruction.action.replacement}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-1">Reason:</h3>
              <p className="text-sm">{instruction.action.explanation}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 print:mt-6 text-center text-sm text-gray-500">
        Generated by SMAIRS - {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}

interface ContextPanelProps {
  instruction?: RevisionInstruction;
  highlightColor: string;
}

function ContextPanel({ instruction, highlightColor }: ContextPanelProps) {
  if (!instruction) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          Context
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Select an instruction to see the surrounding manuscript context.
        </p>
      </div>
    );
  }

  // Extract more context around the instruction location

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Manuscript Context
      </h3>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Scene: {instruction.sceneName}
          </h4>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Approximate line {instruction.findContext.approximateLine}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <div className="font-mono text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded whitespace-pre-wrap">
            <span className="text-gray-600 dark:text-gray-400">
              {instruction.findContext.precedingText}
            </span>
            <span data-testid="context-highlight" className={`${highlightColor} px-1 font-semibold`}>
              {instruction.findContext.targetText}
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              {instruction.findContext.followingText}
            </span>
          </div>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400">
          <p className="mb-1">
            <strong>Action:</strong> {instruction.action.verb}
          </p>
          <p>
            <strong>Type:</strong> {instruction.instructionType}
          </p>
        </div>
      </div>
    </div>
  );
}

interface ActionBarProps {
  onApplyAll: () => void;
  onExportPDF: () => void;
  onPrint: () => void;
  completedCount: number;
  totalCount: number;
}

function ActionBar({
  onApplyAll,
  onExportPDF,
  onPrint,
  completedCount,
  totalCount
}: ActionBarProps) {
  const allCompleted = completedCount === totalCount;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {allCompleted ? (
            <span className="text-green-600 dark:text-green-400 font-medium">
              🎉 All instructions completed!
            </span>
          ) : (
            <span>
              {completedCount} of {totalCount} instructions completed
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={onApplyAll}
            icon="⚡"
          >
            Apply All Automatically
          </Button>

          <Button
            variant="secondary"
            onClick={onExportPDF}
            icon="📄"
          >
            Export PDF
          </Button>

          <Button
            variant="secondary"
            onClick={onPrint}
            icon="🖨️"
          >
            Print
          </Button>
        </div>
      </div>
    </div>
  );
}
