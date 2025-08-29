import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { DiffSegment } from '../../features/manuscript/diff-engine.js';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalToolbar } from './Modal.js';
import { Button } from './Button.js';
import { Toggle } from './Toggle.js';
import { DiffViewModeSelector } from './ViewModeSelector.js';
import ErrorBoundary from './ErrorBoundary.js';

interface VersionComparisonModalProps {
  original: string;
  revised: string;
  changes: DiffSegment[];
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  title?: string;
}

type DiffViewMode = 'split' | 'unified' | 'changes-only';

interface DiffStats {
  added: number;
  deleted: number;
  modified: number;
  unchanged: number;
  totalChanges: number;
}

export function VersionComparisonModal({
  original,
  revised,
  changes,
  isOpen,
  onClose,
  onAccept,
  onReject,
  title = "Version Comparison"
}: VersionComparisonModalProps) {
  const [viewMode, setViewMode] = useState<DiffViewMode>('split');
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [highlightSyntax, setHighlightSyntax] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentChangeIndex, setCurrentChangeIndex] = useState(-1);

  // Calculate diff statistics
  const diffStats = useMemo((): DiffStats => {
    const stats = {
      added: 0,
      deleted: 0,
      modified: 0,
      unchanged: 0,
      totalChanges: 0
    };

    changes.forEach(change => {
      switch (change.type) {
        case 'added':
          stats.added++;
          break;
        case 'deleted':
          stats.deleted++;
          break;
        case 'modified':
          stats.modified++;
          break;
        case 'unchanged':
          stats.unchanged++;
          break;
      }
    });

    stats.totalChanges = stats.added + stats.deleted + stats.modified;
    return stats;
  }, [changes]);

  // Filter changes based on search
  const filteredChanges = useMemo(() => {
    if (!searchQuery.trim()) return changes;

    const query = searchQuery.toLowerCase();
    return changes.filter(change =>
      (change.originalText?.toLowerCase().includes(query)) ||
      (change.revisedText?.toLowerCase().includes(query)) ||
      (change.reason?.toLowerCase().includes(query))
    );
  }, [changes, searchQuery]);

  // Navigation handlers
  const navigateToChange = useCallback((direction: 'next' | 'prev') => {
    const changeIndices = filteredChanges
      .map((change) => ({ change, originalIndex: changes.indexOf(change) }))
      .filter(({ change }) => change.type !== 'unchanged')
      .map(({ originalIndex }) => originalIndex);

    if (changeIndices.length === 0) return;

    let newIndex: number;
    if (direction === 'next') {
      const nextIndex = changeIndices.find(index => index > currentChangeIndex);
      newIndex = nextIndex !== undefined ? nextIndex : changeIndices[0]!;
    } else {
      const prevIndices = changeIndices.filter(index => index < currentChangeIndex);
      newIndex = prevIndices.length > 0 ? prevIndices[prevIndices.length - 1]! : changeIndices[changeIndices.length - 1]!;
    }

    setCurrentChangeIndex(newIndex);

    // Scroll to the change
    const element = document.getElementById(`change-${newIndex}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filteredChanges, changes, currentChangeIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'n':
        case 'ArrowDown':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            navigateToChange('next');
          }
          break;
        case 'p':
        case 'ArrowUp':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            navigateToChange('prev');
          }
          break;
        case 'Escape':
          if (!searchQuery) {
            onClose();
          } else {
            setSearchQuery('');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, navigateToChange, searchQuery, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
  labelledBy="modal-title"
      className="max-h-[90vh] flex flex-col"
    >
      <ErrorBoundary label="Version Comparison Modal">
    <ModalHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
      <h2 id="modal-title" className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h2>
              <DiffStats stats={diffStats} />
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </ModalHeader>

        <ModalToolbar className="flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-4">
              <DiffViewModeSelector mode={viewMode} onChange={setViewMode} />

              <Toggle
                label="Line Numbers"
                checked={showLineNumbers}
                onChange={setShowLineNumbers}
                size="sm"
              />

              <Toggle
                label="Syntax Highlighting"
                checked={highlightSyntax}
                onChange={setHighlightSyntax}
                size="sm"
              />
            </div>

            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateToChange('prev')}
                disabled={diffStats.totalChanges === 0}
              >
                ↑ Prev
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateToChange('next')}
                disabled={diffStats.totalChanges === 0}
              >
                ↓ Next
              </Button>
            </div>
          </div>
        </ModalToolbar>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="relative">
            <input
              type="text"
              placeholder="Search in changes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        <ModalBody className="flex-1 overflow-hidden p-0">
          <div className="h-full overflow-auto">
            {viewMode === 'split' && (
              <SplitDiffView
                original={original}
                revised={revised}
                changes={filteredChanges}
                showLineNumbers={showLineNumbers}
                currentChangeIndex={currentChangeIndex}
                onChangeSelect={setCurrentChangeIndex}
              />
            )}

            {viewMode === 'unified' && (
              <UnifiedDiffView
                changes={filteredChanges}
                showLineNumbers={showLineNumbers}
                currentChangeIndex={currentChangeIndex}
                onChangeSelect={setCurrentChangeIndex}
              />
            )}

            {viewMode === 'changes-only' && (
              <ChangesOnlyView
                changes={filteredChanges}
                currentChangeIndex={currentChangeIndex}
                onChangeSelect={setCurrentChangeIndex}
              />
            )}
          </div>
        </ModalBody>

        <ModalFooter className="flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {diffStats.totalChanges > 0 ? (
                <>
                  {filteredChanges.length < changes.length && (
                    <span className="mr-4">
                      Showing {filteredChanges.filter(c => c.type !== 'unchanged').length} of {diffStats.totalChanges} changes
                    </span>
                  )}
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Ctrl+↑/↓</kbd>
                  <span className="ml-1">Navigate changes</span>
                </>
              ) : (
                <span>No changes found</span>
              )}
            </div>

            <div className="flex space-x-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onReject}>
                Reject Changes
              </Button>
              <Button variant="primary" onClick={onAccept}>
                Accept Changes
              </Button>
            </div>
          </div>
        </ModalFooter>
      </ErrorBoundary>
    </Modal>
  );
}

// Diff Stats Component
function DiffStats({ stats }: { stats: DiffStats }) {
  return (
    <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
      {stats.added > 0 && (
        <span className="flex items-center">
          <span className="w-3 h-3 bg-green-500 rounded-sm mr-1" />
          +{stats.added}
        </span>
      )}
      {stats.deleted > 0 && (
        <span className="flex items-center">
          <span className="w-3 h-3 bg-red-500 rounded-sm mr-1" />
          -{stats.deleted}
        </span>
      )}
      {stats.modified > 0 && (
        <span className="flex items-center">
          <span className="w-3 h-3 bg-blue-500 rounded-sm mr-1" />
          ~{stats.modified}
        </span>
      )}
      <span className="text-gray-500">
        {stats.totalChanges} change{stats.totalChanges !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

// Split Diff View
interface SplitDiffViewProps {
  original: string;
  revised: string;
  changes: DiffSegment[];
  showLineNumbers: boolean;
  currentChangeIndex: number;
  onChangeSelect: (index: number) => void;
}

function SplitDiffView({
  original,
  revised,
  changes,
  showLineNumbers,
  currentChangeIndex,
  onChangeSelect
}: SplitDiffViewProps) {
  const originalLines = original.split('\n');
  const revisedLines = revised.split('\n');

  return (
    <div className="grid grid-cols-2 h-full">
      {/* Original */}
      <div className="border-r border-gray-200 dark:border-gray-700">
        <div className="sticky top-0 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border-b">
          Original
        </div>
        <div className="p-4">
          <CodeView
            lines={originalLines}
            changes={changes}
            showLineNumbers={showLineNumbers}
            side="original"
            currentChangeIndex={currentChangeIndex}
            onChangeSelect={onChangeSelect}
          />
        </div>
      </div>

      {/* Revised */}
      <div>
        <div className="sticky top-0 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border-b">
          Revised
        </div>
        <div className="p-4">
          <CodeView
            lines={revisedLines}
            changes={changes}
            showLineNumbers={showLineNumbers}
            side="revised"
            currentChangeIndex={currentChangeIndex}
            onChangeSelect={onChangeSelect}
          />
        </div>
      </div>
    </div>
  );
}

// Unified Diff View
interface UnifiedDiffViewProps {
  changes: DiffSegment[];
  showLineNumbers: boolean;
  currentChangeIndex: number;
  onChangeSelect: (index: number) => void;
}

function UnifiedDiffView({
  changes,
  showLineNumbers,
  currentChangeIndex,
  onChangeSelect
}: UnifiedDiffViewProps) {
  const unifiedDiff = useMemo(() => {
    // Create a unified diff representation
    const lines: Array<{
      type: 'context' | 'added' | 'deleted' | 'modified';
      content: string;
      originalLine?: number;
      revisedLine?: number;
      changeIndex?: number;
    }> = [];

    let originalLineNum = 1;
    let revisedLineNum = 1;

    changes.forEach((change, index) => {
      switch (change.type) {
        case 'unchanged':
          lines.push({
            type: 'context',
            content: change.originalText || '',
            originalLine: originalLineNum,
            revisedLine: revisedLineNum
          });
          originalLineNum++;
          revisedLineNum++;
          break;

        case 'deleted':
          lines.push({
            type: 'deleted',
            content: change.originalText || '',
            originalLine: originalLineNum,
            changeIndex: index
          });
          originalLineNum++;
          break;

        case 'added':
          lines.push({
            type: 'added',
            content: change.revisedText || '',
            revisedLine: revisedLineNum,
            changeIndex: index
          });
          revisedLineNum++;
          break;

        case 'modified':
          lines.push({
            type: 'deleted',
            content: change.originalText || '',
            originalLine: originalLineNum,
            changeIndex: index
          });
          lines.push({
            type: 'added',
            content: change.revisedText || '',
            revisedLine: revisedLineNum,
            changeIndex: index
          });
          originalLineNum++;
          revisedLineNum++;
          break;
      }
    });

    return lines;
  }, [changes]);

  return (
    <div className="p-4">
      <div className="font-mono text-sm">
    {unifiedDiff.map((line, _index) => (
          <div
      key={_index}
            id={line.changeIndex !== undefined ? `change-${line.changeIndex}` : undefined}
            className={`
              flex hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer
              ${line.changeIndex === currentChangeIndex ? 'ring-2 ring-blue-500' : ''}
              ${line.type === 'added' ? 'bg-green-50 dark:bg-green-900/20' :
                line.type === 'deleted' ? 'bg-red-50 dark:bg-red-900/20' :
                line.type === 'modified' ? 'bg-blue-50 dark:bg-blue-900/20' :
                ''
              }
            `}
            onClick={() => line.changeIndex !== undefined && onChangeSelect(line.changeIndex)}
          >
            {/* Line numbers */}
            {showLineNumbers && (
              <div className="flex-shrink-0 w-20 pr-4 text-gray-500 dark:text-gray-400 text-right select-none">
                <span className="inline-block w-8">
                  {line.originalLine || ''}
                </span>
                <span className="inline-block w-8 ml-2">
                  {line.revisedLine || ''}
                </span>
              </div>
            )}

            {/* Change indicator */}
            <div className="flex-shrink-0 w-8 text-center select-none">
              {line.type === 'added' ? (
                <span className="text-green-600 dark:text-green-400">+</span>
              ) : line.type === 'deleted' ? (
                <span className="text-red-600 dark:text-red-400">-</span>
              ) : (
                <span className="text-gray-400"> </span>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 whitespace-pre-wrap break-all">
              {line.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Changes Only View
interface ChangesOnlyViewProps {
  changes: DiffSegment[];
  currentChangeIndex: number;
  onChangeSelect: (index: number) => void;
}

function ChangesOnlyView({ changes, currentChangeIndex, onChangeSelect }: ChangesOnlyViewProps) {
  const changesOnly = changes.filter(change => change.type !== 'unchanged');

  if (changesOnly.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">📄</div>
          <p>No changes found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {changesOnly.map((change, index) => {
        const originalIndex = changes.indexOf(change);
        const isSelected = originalIndex === currentChangeIndex;

        return (
          <div
            key={index}
            id={`change-${originalIndex}`}
            className={`
              border rounded-lg p-4 cursor-pointer transition-all duration-200
              ${isSelected
                ? 'ring-2 ring-blue-500 border-blue-300 dark:border-blue-600'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
            onClick={() => onChangeSelect(originalIndex)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className={`
                  inline-flex items-center px-2 py-1 rounded text-xs font-medium
                  ${change.type === 'added' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                    change.type === 'deleted' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' :
                    'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
                  }
                `}>
                  {change.type === 'added' ? '+ Added' :
                   change.type === 'deleted' ? '- Deleted' :
                   '~ Modified'
                  }
                </span>

                {change.source && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    {change.source}
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400">
                Lines {change.startOffset}-{change.endOffset}
              </div>
            </div>

            {change.originalText && change.type !== 'added' && (
              <div className="mb-2">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Original:</div>
                <div className="font-mono text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded border">
                  {change.originalText}
                </div>
              </div>
            )}

            {change.revisedText && change.type !== 'deleted' && (
              <div className="mb-2">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {change.type === 'added' ? 'Added:' : 'Revised:'}
                </div>
                <div className="font-mono text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded border">
                  {change.revisedText}
                </div>
              </div>
            )}

            {change.reason && (
              <div>
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reason:</div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {change.reason}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Code View Component
interface CodeViewProps {
  lines: string[];
  changes: DiffSegment[];
  showLineNumbers: boolean;
  side: 'original' | 'revised';
  currentChangeIndex: number;
  onChangeSelect: (index: number) => void;
}

function CodeView({
  lines,
  changes,
  showLineNumbers,
  side,
  currentChangeIndex,
  onChangeSelect
}: CodeViewProps) {
  return (
    <div className="font-mono text-sm">
      {lines.map((line, lineIndex) => {
        const lineNumber = lineIndex + 1;

        // Find if this line has changes
        const relevantChanges = changes.filter(change => {
          const startLine = Math.floor(change.startOffset / 50) + 1; // Rough estimate
          const endLine = Math.floor(change.endOffset / 50) + 1;
          return lineNumber >= startLine && lineNumber <= endLine;
        });

        const hasChanges = relevantChanges.length > 0;
        const changeTypes = relevantChanges.map(c => c.type);

        return (
          <div
            key={lineIndex}
            className={`
              flex hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer
              ${hasChanges ? 'bg-blue-50 dark:bg-blue-900/10' : ''}
              ${relevantChanges.some((_, index) => changes.indexOf(relevantChanges[index]!) === currentChangeIndex)
                ? 'ring-2 ring-blue-500' : ''
              }
            `}
            onClick={() => {
              if (relevantChanges.length > 0) {
                onChangeSelect(changes.indexOf(relevantChanges[0]!));
              }
            }}
          >
            {showLineNumbers && (
              <div className="flex-shrink-0 w-12 pr-4 text-gray-500 dark:text-gray-400 text-right select-none">
                {lineNumber}
              </div>
            )}

            {/* Change indicator */}
            <div className="flex-shrink-0 w-6 text-center select-none">
              {changeTypes.includes('added') && side === 'revised' && (
                <span className="text-green-500">+</span>
              )}
              {changeTypes.includes('deleted') && side === 'original' && (
                <span className="text-red-500">-</span>
              )}
              {changeTypes.includes('modified') && (
                <span className="text-blue-500">~</span>
              )}
            </div>

            <div className="flex-1 whitespace-pre-wrap break-all">
              {line}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default VersionComparisonModal;
