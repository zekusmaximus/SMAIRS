import React, { useState, useCallback } from 'react';
import { RevisionInstructionViewer } from '../components/RevisionInstructionViewer.js';
import { VersionComparisonModal } from '../components/VersionComparisonModal.js';
import { ExportProgressIndicator } from '../components/ExportProgressIndicator.js';
import { Button } from '../components/Button.js';
import { useExportStore } from '../hooks/useExportStore.js';
import type { RevisionInstruction } from '../../features/export/revision-instructions.js';
import type { DiffSegment } from '../../features/manuscript/diff-engine.js';

// Demo data
const demoInstructions: RevisionInstruction[] = [
  {
    stepNumber: 1,
    sceneId: 'ch01_s01',
    sceneName: 'Chapter 1, Scene 1',
    instructionType: 'replace',
    findContext: {
      precedingText: 'Detective Sarah Martinez arrived at',
      targetText: 'the crime scene',
      followingText: 'at 3:47 AM on a cold Tuesday morning',
      approximateLine: 3,
      approximateParagraph: 1
    },
    action: {
      verb: 'Replace',
      original: 'the crime scene',
      replacement: 'the warehouse',
      explanation: 'Remove premature reveal that this is a crime scene - should be discovered organically'
    },
    beforeAfter: {
      before: 'Detective Sarah Martinez arrived at **the crime scene** at 3:47 AM',
      after: 'Detective Sarah Martinez arrived at **the warehouse** at 3:47 AM'
    }
  },
  {
    stepNumber: 2,
    sceneId: 'ch01_s01',
    sceneName: 'Chapter 1, Scene 1',
    instructionType: 'delete',
    findContext: {
      precedingText: 'The victim, Dr. Jonathan Smith, was',
      targetText: 'obviously murdered by the serial killer',
      followingText: 'according to the initial assessment',
      approximateLine: 8,
      approximateParagraph: 2
    },
    action: {
      verb: 'Delete',
      original: 'obviously murdered by the serial killer',
      explanation: 'Remove spoiler - the serial killer connection should be revealed later in the investigation'
    },
    beforeAfter: {
      before: 'The victim, Dr. Jonathan Smith, was **obviously murdered by the serial killer** according to the initial assessment',
      after: 'The victim, Dr. Jonathan Smith, was according to the initial assessment'
    }
  },
  {
    stepNumber: 3,
    sceneId: 'ch01_s02',
    sceneName: 'Chapter 1, Scene 2',
    instructionType: 'insert',
    findContext: {
      precedingText: 'Martinez examined the evidence',
      targetText: '',
      followingText: 'and noticed something unusual',
      approximateLine: 25,
      approximateParagraph: 7
    },
    action: {
      verb: 'Insert',
      replacement: ' carefully',
      explanation: 'Add detail to show the detective is thorough and methodical'
    },
    beforeAfter: {
      before: 'Martinez examined the evidence and noticed something unusual',
      after: 'Martinez examined the evidence **carefully** and noticed something unusual'
    }
  }
];

const demoManuscript = `Chapter 1: The Discovery

Detective Sarah Martinez arrived at the crime scene at 3:47 AM on a cold Tuesday morning. The warehouse district was eerily quiet, save for the distant hum of traffic from the interstate.

The victim, Dr. Jonathan Smith, was obviously murdered by the serial killer according to the initial assessment. Blood pooled around his head, suggesting blunt force trauma.

Scene 2

Martinez examined the evidence and noticed something unusual. The killer had left behind a single red rose - the same calling card used in the previous three murders.

"This changes everything," she whispered to her partner, Detective Johnson.`;

const demoChanges: DiffSegment[] = [
  {
    type: 'unchanged',
    originalText: 'Detective Sarah Martinez arrived at ',
    revisedText: 'Detective Sarah Martinez arrived at ',
    startOffset: 0,
    endOffset: 35
  },
  {
    type: 'deleted',
    originalText: 'the crime scene',
    startOffset: 35,
    endOffset: 50,
    reason: 'Remove premature reveal',
    source: 'spoiler'
  },
  {
    type: 'added',
    revisedText: 'the warehouse',
    startOffset: 35,
    endOffset: 48,
    reason: 'More neutral location description',
    source: 'spoiler'
  },
  {
    type: 'unchanged',
    originalText: ' at 3:47 AM',
    revisedText: ' at 3:47 AM',
    startOffset: 50,
    endOffset: 61
  },
  {
    type: 'deleted',
    originalText: 'obviously murdered by the serial killer',
    startOffset: 150,
    endOffset: 189,
    reason: 'Remove spoiler revelation',
    source: 'spoiler'
  },
  {
    type: 'added',
    revisedText: 'carefully',
    startOffset: 280,
    endOffset: 289,
    reason: 'Add character detail',
    source: 'enhancement'
  }
];

const originalManuscript = demoManuscript;
const revisedManuscript = demoManuscript
  .replace('the crime scene', 'the warehouse')
  .replace('obviously murdered by the serial killer', '')
  .replace('Martinez examined the evidence', 'Martinez examined the evidence carefully');

/**
 * Demo component showcasing the complete revision workflow UI
 */
export function RevisionWorkflowDemo() {
  const [showComparison, setShowComparison] = useState(false);
  const [appliedInstructions, setAppliedInstructions] = useState<RevisionInstruction[]>([]);

  const { startExport, state: exportState } = useExportStore();

  const handleApplyInstruction = useCallback((instruction: RevisionInstruction) => {
    setAppliedInstructions(prev => {
      const exists = prev.some(i => i.stepNumber === instruction.stepNumber);
      if (exists) {
        return prev.filter(i => i.stepNumber !== instruction.stepNumber);
      } else {
        return [...prev, instruction];
      }
    });
  }, []);

  const handleApplyAll = useCallback(() => {
    setAppliedInstructions(demoInstructions);
  }, []);

  const handleShowComparison = useCallback(() => {
    setShowComparison(true);
  }, []);

  const handleAcceptChanges = useCallback(() => {
    setShowComparison(false);
    // In a real app, this would update the manuscript
    console.log('Changes accepted');
  }, []);

  const handleRejectChanges = useCallback(() => {
    setShowComparison(false);
    setAppliedInstructions([]);
    console.log('Changes rejected');
  }, []);

  const handleStartExport = useCallback(() => {
    startExport();
  }, [startExport]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                📝 SMAIRS Revision Workflow Demo
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Complete UI integration for revision instruction management
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <Button
                variant="secondary"
                onClick={handleShowComparison}
                disabled={appliedInstructions.length === 0}
              >
                📊 Compare Versions
              </Button>

              <Button
                variant="success"
                onClick={handleStartExport}
                disabled={exportState !== 'idle'}
                loading={exportState === 'exporting'}
              >
                📦 Export Bundle
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Instructions Panel */}
          <div className="lg:col-span-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <RevisionInstructionViewer
                instructions={demoInstructions}
                onApply={handleApplyInstruction}
                onApplyAll={handleApplyAll}
              />
            </div>
          </div>

          {/* Status Panel */}
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                📈 Status Overview
              </h2>

              <div className="space-y-4">
                {/* Applied Instructions */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Applied Instructions
                  </h3>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {appliedInstructions.length} / {demoInstructions.length}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round((appliedInstructions.length / demoInstructions.length) * 100)}% complete
                  </div>
                </div>

                {/* Instruction Types */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Instruction Types
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Replacements:</span>
                      <span className="font-medium">1</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Deletions:</span>
                      <span className="font-medium">1</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Insertions:</span>
                      <span className="font-medium">1</span>
                    </div>
                  </div>
                </div>

                {/* Applied Instructions List */}
                {appliedInstructions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Recently Applied
                    </h3>
                    <div className="space-y-2">
                      {appliedInstructions.slice(-3).map((instruction) => (
                        <div key={instruction.stepNumber} className="flex items-center text-sm">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 flex-shrink-0" />
                          <span className="text-gray-600 dark:text-gray-400 truncate">
                            Step {instruction.stepNumber}: {instruction.action.verb}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Demo Instructions */}
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                    💡 Demo Instructions
                  </h3>
                  <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                    <p>• Use keyboard shortcuts (←/→) to navigate</p>
                    <p>• Try different view modes (Guided/List/Print)</p>
                    <p>• Search for specific instructions</p>
                    <p>• Click "Compare Versions" to see changes</p>
                    <p>• Export a complete submission bundle</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Demo Data Section */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            📋 Demo Data Preview
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Original Manuscript Sample
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border font-mono text-sm max-h-48 overflow-y-auto">
                {originalManuscript}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Revised Manuscript Sample
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border font-mono text-sm max-h-48 overflow-y-auto">
                {revisedManuscript}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Version Comparison Modal */}
      <VersionComparisonModal
        original={originalManuscript}
        revised={revisedManuscript}
        changes={demoChanges}
        isOpen={showComparison}
        onClose={() => setShowComparison(false)}
        onAccept={handleAcceptChanges}
        onReject={handleRejectChanges}
        title="Manuscript Revision Comparison"
      />

      {/* Export Progress Indicator */}
      <ExportProgressIndicator
        onComplete={(result) => {
          console.log('Export completed:', result);
        }}
        onError={(error) => {
          console.error('Export failed:', error);
        }}
      />

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p>
              🎯 <strong>SMAIRS UI Components Integration Demo</strong> -
              Revision workflow with accessibility, keyboard navigation, and responsive design
            </p>
            <p className="mt-2">
              Features: Guided instructions, version comparison, export progress tracking,
              search & filter, keyboard shortcuts, and comprehensive error handling
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default RevisionWorkflowDemo;
