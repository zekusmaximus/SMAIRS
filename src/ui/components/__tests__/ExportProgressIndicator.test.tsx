import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportProgressIndicator } from '../ExportProgressIndicator.js';
import * as exportStore from '../../hooks/useExportStore.js';

// Mock the export store
vi.mock('../../hooks/useExportStore.js');

const mockExportStore = {
  state: 'idle' as const,
  progress: 0,
  currentStep: -1,
  steps: exportStore.EXPORT_STEPS,
  error: undefined,
  startTime: undefined,
  endTime: undefined,
  outputPath: undefined,
  filesGenerated: undefined,
  startExport: vi.fn(),
  completeExport: vi.fn(),
  failExport: vi.fn(),
  retryExport: vi.fn(),
  resetExport: vi.fn(),
  openExportFolder: vi.fn(),
  getStepStatus: vi.fn((stepIndex: number, currentStep: number) => {
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'active';
    return 'pending';
  }),
  getTimeElapsed: vi.fn(() => 0),
  getTimeRemaining: vi.fn(() => null),
};

describe('ExportProgressIndicator', () => {
  const mockOnComplete = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exportStore.useExportStore).mockReturnValue(mockExportStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Visibility States', () => {
    it('is hidden when export state is idle', () => {
      render(<ExportProgressIndicator />);
      expect(screen.queryByText('Exporting Bundle')).not.toBeInTheDocument();
    });

    it('shows when export is in progress', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.3,
        currentStep: 1,
      });

      render(<ExportProgressIndicator />);
      expect(screen.getByText('📦 Exporting Bundle')).toBeInTheDocument();
    });

    it('shows when export is complete', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'complete',
        progress: 1,
        currentStep: 6,
        outputPath: './out/submission-bundle.zip',
        filesGenerated: [
          { path: 'manuscript.docx', size: 127400 },
          { path: 'synopsis.pdf', size: 85600 },
        ],
      });

      render(<ExportProgressIndicator />);
      expect(screen.getByText('✅ Export Complete')).toBeInTheDocument();
    });

    it('shows when export has error', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'error',
        error: 'Failed to generate DOCX file',
      });

      render(<ExportProgressIndicator />);
      expect(screen.getByText('❌ Export Failed')).toBeInTheDocument();
    });
  });

  describe('Progress Display', () => {
    it('displays correct progress percentage', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.65,
        currentStep: 3,
      });

      render(<ExportProgressIndicator />);
      expect(screen.getByText('65% complete')).toBeInTheDocument();
    });

    it('shows time remaining during export', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.4,
        currentStep: 2,
        getTimeRemaining: vi.fn(() => 15),
      });

      render(<ExportProgressIndicator />);
      expect(screen.getByText(/~15s remaining/)).toBeInTheDocument();
    });

    it('shows elapsed time when complete', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'complete',
        progress: 1,
        getTimeElapsed: vi.fn(() => 28),
      });

      render(<ExportProgressIndicator />);
      expect(screen.getByText(/took 28s/)).toBeInTheDocument();
    });

    it('formats time correctly', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.5,
        getTimeRemaining: vi.fn(() => 125), // 2m 5s
      });

      render(<ExportProgressIndicator />);
      expect(screen.getByText(/~2m 5s remaining/)).toBeInTheDocument();
    });
  });

  describe('Export Steps', () => {
    it('displays all export steps', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.3,
        currentStep: 2,
      });

      render(<ExportProgressIndicator />);

      expect(screen.getByText('Validating Content')).toBeInTheDocument();
      expect(screen.getByText('Processing Changes')).toBeInTheDocument();
      expect(screen.getByText('Generating Markdown')).toBeInTheDocument();
      expect(screen.getByText('Creating DOCX')).toBeInTheDocument();
      expect(screen.getByText('Creating PDF')).toBeInTheDocument();
      expect(screen.getByText('Packaging Files')).toBeInTheDocument();
      expect(screen.getByText('Finalizing')).toBeInTheDocument();
    });

    it('shows step status correctly', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.4,
        currentStep: 2,
        getStepStatus: vi.fn((stepIndex: number, currentStep: number) => {
          if (stepIndex < currentStep) return 'completed';
          if (stepIndex === currentStep) return 'active';
          return 'pending';
        }),
      });

      render(<ExportProgressIndicator />);

      // Should show "Processing..." for active step
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('shows mini progress bar for active step', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.35, // 35% overall, which would be partway through step 2
        currentStep: 2,
      });

      render(<ExportProgressIndicator />);

      // Should show progress bar (visual element hard to test, but component should render)
      const progressBars = screen.getAllByRole('progressbar');
      expect(progressBars.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('displays error message', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'error',
        error: 'Network connection failed',
      });

      render(<ExportProgressIndicator />);

      expect(screen.getByText('Export Failed')).toBeInTheDocument();
      expect(screen.getByText('Network connection failed')).toBeInTheDocument();
    });

    it('allows retry on error', async () => {
      const user = userEvent.setup();
      const retryMock = vi.fn();
      
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'error',
        error: 'Something went wrong',
        retryExport: retryMock,
      });

      render(<ExportProgressIndicator />);

      const retryButton = screen.getByRole('button', { name: /retry export/i });
      await user.click(retryButton);

      expect(retryMock).toHaveBeenCalled();
    });

    it('calls onError callback when error occurs', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'error',
        error: 'Test error',
      });

      render(<ExportProgressIndicator onError={mockOnError} />);

      expect(mockOnError).toHaveBeenCalledWith('Test error');
    });
  });

  describe('Success State', () => {
    const successState = {
      ...mockExportStore,
      state: 'complete' as const,
      progress: 1,
      outputPath: './out/submission-bundle.zip',
      filesGenerated: [
        { path: 'manuscript.docx', size: 127400 },
        { path: 'synopsis.pdf', size: 85600 },
        { path: 'query-letter.pdf', size: 45200 },
        { path: 'comparison-report.md', size: 12800 },
      ],
    };

    it('displays success message and files', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue(successState);

      render(<ExportProgressIndicator />);

      expect(screen.getByText('Export Completed Successfully')).toBeInTheDocument();
      expect(screen.getByText('./out/submission-bundle.zip')).toBeInTheDocument();
      expect(screen.getByText('Files Generated (4):')).toBeInTheDocument();
      expect(screen.getByText('manuscript.docx')).toBeInTheDocument();
      expect(screen.getByText('synopsis.pdf')).toBeInTheDocument();
    });

    it('formats file sizes correctly', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue(successState);

      render(<ExportProgressIndicator />);

      expect(screen.getByText('124KB')).toBeInTheDocument(); // 127400 bytes
      expect(screen.getByText('84KB')).toBeInTheDocument(); // 85600 bytes
      expect(screen.getByText('44KB')).toBeInTheDocument(); // 45200 bytes
      expect(screen.getByText('13KB')).toBeInTheDocument(); // 12800 bytes
    });

    it('allows opening export folder', async () => {
      const user = userEvent.setup();
      const openFolderMock = vi.fn();
      
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...successState,
        openExportFolder: openFolderMock,
      });

      render(<ExportProgressIndicator />);

      const openButton = screen.getByRole('button', { name: /open folder/i });
      await user.click(openButton);

      expect(openFolderMock).toHaveBeenCalled();
    });

    it('allows starting new export', async () => {
      const user = userEvent.setup();
      const resetMock = vi.fn();
      
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...successState,
        resetExport: resetMock,
      });

      render(<ExportProgressIndicator />);

      const newButton = screen.getByRole('button', { name: /start new/i });
      await user.click(newButton);

      expect(resetMock).toHaveBeenCalled();
    });

    it('allows closing with X button', async () => {
      const user = userEvent.setup();
      const resetMock = vi.fn();
      
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...successState,
        resetExport: resetMock,
      });

      render(<ExportProgressIndicator />);

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(resetMock).toHaveBeenCalled();
    });

    it('calls onComplete callback when export completes', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue(successState);

      render(<ExportProgressIndicator onComplete={mockOnComplete} />);

      expect(mockOnComplete).toHaveBeenCalledWith({
        outputPath: './out/submission-bundle.zip',
        filesGenerated: successState.filesGenerated,
      });
    });
  });

  describe('Animation and Visual Effects', () => {
    it('shows progress animation during export', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.5,
        currentStep: 3,
      });

      render(<ExportProgressIndicator />);

      // Should have animated gradient at the bottom (visual element)
      const indicator = screen.getByText('📦 Exporting Bundle').closest('div');
      expect(indicator?.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('applies correct transform based on state', () => {
      // Test that the component is positioned correctly
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.3,
      });

      render(<ExportProgressIndicator />);

      const indicator = screen.getByText('📦 Exporting Bundle').closest('div');
      expect(indicator).toHaveClass('translate-y-0', 'opacity-100');
    });
  });

  describe('File Size Formatting', () => {
    it('formats bytes correctly', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'complete',
        progress: 1,
        outputPath: './out/test.zip',
        filesGenerated: [
          { path: 'small.txt', size: 512 }, // 512B
          { path: 'medium.docx', size: 2048 }, // 2KB
          { path: 'large.pdf', size: 2097152 }, // 2.0MB
        ],
      });

      render(<ExportProgressIndicator />);

      expect(screen.getByText('512B')).toBeInTheDocument();
      expect(screen.getByText('2KB')).toBeInTheDocument();
      expect(screen.getByText('2.0MB')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.6,
        currentStep: 3,
      });

      render(<ExportProgressIndicator />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow');
      expect(progressBar).toHaveAttribute('aria-valuemax');
    });

    it('provides meaningful close button label', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'complete',
        progress: 1,
        outputPath: './out/test.zip',
        filesGenerated: [],
      });

      render(<ExportProgressIndicator />);

      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toHaveAttribute('aria-label', 'Close');
    });
  });

  describe('Custom Props', () => {
    it('applies custom className', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'exporting',
        progress: 0.5,
      });

      render(<ExportProgressIndicator className="custom-class" />);

      const indicator = screen.getByText('📦 Exporting Bundle').closest('div');
      expect(indicator).toHaveClass('custom-class');
    });
  });

  describe('Edge Cases', () => {
    it('handles zero progress gracefully', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'preparing',
        progress: 0,
        currentStep: 0,
      });

      render(<ExportProgressIndicator />);

      expect(screen.getByText('0% complete')).toBeInTheDocument();
    });

    it('handles complete progress', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'complete',
        progress: 1,
        currentStep: 6,
      });

      render(<ExportProgressIndicator />);

      expect(screen.getByText('100% complete')).toBeInTheDocument();
    });

    it('handles missing output path gracefully', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'complete',
        progress: 1,
        outputPath: undefined,
        filesGenerated: [],
      });

      render(<ExportProgressIndicator />);

      // Should not crash and should not show file details
      expect(screen.queryByText('Files Generated')).not.toBeInTheDocument();
    });

    it('handles empty files list', () => {
      vi.mocked(exportStore.useExportStore).mockReturnValue({
        ...mockExportStore,
        state: 'complete',
        progress: 1,
        outputPath: './out/empty.zip',
        filesGenerated: [],
      });

      render(<ExportProgressIndicator />);

      expect(screen.getByText('Files Generated (0):')).toBeInTheDocument();
    });
  });
});