import { useState, useCallback, useRef } from 'react';

export type ExportState = 'idle' | 'preparing' | 'exporting' | 'complete' | 'error';

export interface ExportStep {
  id: string;
  label: string;
  description: string;
  estimated: number; // seconds
}

export interface ExportProgress {
  state: ExportState;
  progress: number; // 0-1
  currentStep: number;
  steps: ExportStep[];
  error?: string;
  startTime?: Date;
  endTime?: Date;
  outputPath?: string;
  filesGenerated?: Array<{ path: string; size: number }>;
}

export const EXPORT_STEPS: ExportStep[] = [
  {
    id: 'validate',
    label: 'Validating Content',
    description: 'Checking manuscript structure and changes',
    estimated: 2
  },
  {
    id: 'process',
    label: 'Processing Changes',
    description: 'Applying revisions and generating clean text',
    estimated: 5
  },
  {
    id: 'generate_markdown',
    label: 'Generating Markdown',
    description: 'Creating formatted manuscript files',
    estimated: 3
  },
  {
    id: 'generate_docx',
    label: 'Creating DOCX',
    description: 'Converting to Microsoft Word format',
    estimated: 8
  },
  {
    id: 'generate_pdf',
    label: 'Creating PDF',
    description: 'Rendering final PDF document',
    estimated: 10
  },
  {
    id: 'create_package',
    label: 'Packaging Files',
    description: 'Creating submission bundle',
    estimated: 3
  },
  {
    id: 'finalize',
    label: 'Finalizing',
    description: 'Completing export process',
    estimated: 1
  }
];

const INITIAL_STATE: ExportProgress = {
  state: 'idle',
  progress: 0,
  currentStep: -1,
  steps: EXPORT_STEPS,
};

export function useExportStore() {
  const [exportProgress, setExportProgress] = useState<ExportProgress>(INITIAL_STATE);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const progressIntervalRef = useRef<NodeJS.Timeout>();

  const startExport = useCallback(() => {
    setExportProgress({
      ...INITIAL_STATE,
      state: 'preparing',
      startTime: new Date(),
      currentStep: 0,
    });

    // Simulate progress updates
    let currentStep = 0;
    let stepProgress = 0;
    const totalSteps = EXPORT_STEPS.length;

    progressIntervalRef.current = setInterval(() => {
      setExportProgress(prev => {
        if (prev.state !== 'preparing' && prev.state !== 'exporting') {
          return prev;
        }

        const step = EXPORT_STEPS[currentStep];
        if (!step) return prev;

        // Advance progress within current step
        stepProgress += 0.1 + Math.random() * 0.1; // Random progress increments

        const baseProgress = currentStep / totalSteps;
        const stepContribution = (1 / totalSteps) * Math.min(stepProgress, 1);
        const newProgress = baseProgress + stepContribution;

        // Move to next step if current is complete
        if (stepProgress >= 1 && currentStep < totalSteps - 1) {
          currentStep++;
          stepProgress = 0;
        }

        return {
          ...prev,
          state: 'exporting',
          progress: Math.min(newProgress, 0.99), // Keep at 99% until completion
          currentStep,
        };
      });
    }, 300 + Math.random() * 200); // Vary interval timing

    // Complete after estimated time
    const totalTime = EXPORT_STEPS.reduce((sum, step) => sum + step.estimated, 0) * 1000;
    timeoutRef.current = setTimeout(() => {
      completeExport({
        outputPath: './out/submission-bundle.zip',
        filesGenerated: [
          { path: 'manuscript.docx', size: 127400 },
          { path: 'synopsis.pdf', size: 85600 },
          { path: 'query-letter.pdf', size: 45200 },
          { path: 'comparison-report.md', size: 12800 }
        ]
      });
    }, totalTime);
  }, []);

  const completeExport = useCallback((result: { outputPath: string; filesGenerated: Array<{ path: string; size: number }> }) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = undefined;
    }

    setExportProgress(prev => ({
      ...prev,
      state: 'complete',
      progress: 1,
      currentStep: EXPORT_STEPS.length - 1,
      endTime: new Date(),
      outputPath: result.outputPath,
      filesGenerated: result.filesGenerated,
    }));
  }, []);

  const failExport = useCallback((error: string) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = undefined;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    setExportProgress(prev => ({
      ...prev,
      state: 'error',
      endTime: new Date(),
      error,
    }));
  }, []);

  const retryExport = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = undefined;
    }
    
    startExport();
  }, [startExport]);

  const resetExport = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = undefined;
    }
    
    setExportProgress(INITIAL_STATE);
  }, []);

  const openExportFolder = useCallback(async () => {
    if (exportProgress.outputPath) {
      try {
        // Try to open folder using Tauri API
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('show_in_folder', { path: exportProgress.outputPath });
      } catch {
        // Fallback - copy path to clipboard
        if (navigator.clipboard) {
          navigator.clipboard.writeText(exportProgress.outputPath);
          alert(`Path copied to clipboard: ${exportProgress.outputPath}`);
        }
      }
    }
  }, [exportProgress.outputPath]);

  const getStepStatus = useCallback((stepIndex: number, currentStep: number) => {
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'active';
    return 'pending';
  }, []);

  const getTimeElapsed = useCallback(() => {
    if (!exportProgress.startTime) return 0;
    const endTime = exportProgress.endTime || new Date();
    return Math.round((endTime.getTime() - exportProgress.startTime.getTime()) / 1000);
  }, [exportProgress.startTime, exportProgress.endTime]);

  const getTimeRemaining = useCallback(() => {
    if (exportProgress.state !== 'exporting' || !exportProgress.startTime) return null;
    
    const elapsed = getTimeElapsed();
    const totalEstimated = EXPORT_STEPS.reduce((sum, step) => sum + step.estimated, 0);
    const remaining = Math.max(0, totalEstimated - elapsed);
    
    return remaining;
  }, [exportProgress.state, exportProgress.startTime, getTimeElapsed]);

  return {
    ...exportProgress,
    startExport,
    completeExport,
    failExport,
    retryExport,
    resetExport,
    openExportFolder,
    getStepStatus,
    getTimeElapsed,
    getTimeRemaining,
  };
}