// Core UI Components for SMAIRS Revision Workflow
// All components feature accessibility, keyboard navigation, and responsive design

// Main workflow components
export { RevisionInstructionViewer } from './RevisionInstructionViewer.js';
export { VersionComparisonModal } from './VersionComparisonModal.js';
export { ExportProgressIndicator } from './ExportProgressIndicator.js';

// Supporting UI components
export { ProgressBar, SteppedProgressBar } from './ProgressBar.js';
export { ViewModeSelector, DiffViewModeSelector } from './ViewModeSelector.js';
export { Button } from './Button.js';
export { Modal, ModalHeader, ModalBody, ModalFooter, ModalToolbar } from './Modal.js';
export { Toggle } from './Toggle.js';

// Existing components (re-export for convenience)
export { ErrorBoundary } from './ErrorBoundary.js';
export { TopProgressBar, useTopProgress, getTopProgressController } from './TopProgressBar.js';
export { VersionTimeline } from "./VersionTimeline";

// Hooks and utilities
export { useExportStore, EXPORT_STEPS } from '../hooks/useExportStore.js';

// Types
export type { ExportState, ExportStep, ExportProgress } from '../hooks/useExportStore.js';

// Demo and examples
export { RevisionWorkflowDemo } from '../examples/RevisionWorkflowDemo.js';
