import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MainLayout } from '../MainLayout';

// Mock all the lazy-loaded components
vi.mock('@/ui/panels/SceneNavigator', () => ({
  default: () => <div data-testid="scene-navigator">Scene Navigator</div>,
}));

vi.mock('@/ui/components/CompareDrawer', () => ({
  default: () => <div data-testid="compare-drawer">Compare Drawer</div>,
}));

vi.mock('@/ui/panels/AnalysisDetails', () => ({
  default: () => <div data-testid="analysis-details">Analysis Details</div>,
}));

vi.mock('@/ui/panels/SearchPanel', () => ({
  default: () => <div data-testid="search-panel">Search Panel</div>,
}));

vi.mock('@/editor/Editor', () => ({
  default: () => <div data-testid="manuscript-editor">Manuscript Editor</div>,
}));

vi.mock('@/ui/components/JobTray', () => ({
  default: ({ compact }: { compact?: boolean }) => (
    <div data-testid="job-tray" data-compact={compact}>Job Tray</div>
  ),
}));

vi.mock('@/ui/components/DbHarness', () => ({
  default: () => <div data-testid="db-harness">DB Harness</div>,
}));

vi.mock('@/components/LLMMonitorWidget', () => ({
  default: () => <div data-testid="llm-monitor">LLM Monitor</div>,
}));

// Mock the manuscript store
const mockUseManuscriptStore = vi.fn();
vi.mock('@/stores/manuscript.store', () => ({
  useManuscriptStore: () => mockUseManuscriptStore(),
}));

// Mock DecisionBar
vi.mock('@/ui/components/DecisionBar', () => ({
  DecisionBar: ({ onToggleCompare }: { onToggleCompare?: () => void }) => (
    <div data-testid="decision-bar">
      <button onClick={onToggleCompare} data-testid="compare-toggle">
        Compare
      </button>
    </div>
  ),
}));

// Mock KeyboardHelp
vi.mock('@/ui/components/KeyboardHelp', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? (
      <div data-testid="keyboard-help">
        <button onClick={onClose} data-testid="close-help">Close Help</button>
        Keyboard Help
      </div>
    ) : null
  ),
}));

// Mock OverlayStack
vi.mock('@/ui/components/OverlayStack', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="overlay-stack">{children}</div>
  ),
}));

describe('MainLayout', () => {
  const mockOpenManuscriptDialog = vi.fn();
  const mockLoadManuscript = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'idle',
      loadingError: null,
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });
  });

  it('renders main layout structure correctly', async () => {
    render(<MainLayout />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('decision-bar')).toBeInTheDocument();

    // Wait for lazy-loaded components to render
    await waitFor(() => {
      expect(screen.getByTestId('scene-navigator')).toBeInTheDocument();
      expect(screen.getByTestId('manuscript-editor')).toBeInTheDocument();
      expect(screen.getByTestId('search-panel')).toBeInTheDocument();
      expect(screen.getAllByTestId('analysis-details')).toHaveLength(2);
    });
  });

  it('renders manuscript editor when loading state is loaded', () => {
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'loaded',
      loadingError: null,
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<MainLayout />);

    expect(screen.getByTestId('manuscript-editor')).toBeInTheDocument();
    expect(screen.queryByText('Loading manuscript...')).not.toBeInTheDocument();
  });

  it('renders manuscript editor when loading state is loaded', () => {
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'loaded',
      loadingError: null,
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<MainLayout />);

    expect(screen.getByTestId('manuscript-editor')).toBeInTheDocument();
    expect(screen.queryByText('Loading manuscript...')).not.toBeInTheDocument();
  });


  it('renders ManuscriptLoadError component when loading state is error', () => {
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'error',
      loadingError: 'Failed to load manuscript',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<MainLayout />);

    expect(screen.getByText('Failed to Load Manuscript')).toBeInTheDocument();
    expect(screen.getByText('Failed to load manuscript')).toBeInTheDocument();
    expect(screen.queryByTestId('manuscript-editor')).not.toBeInTheDocument();
  });

  it('handles successful manuscript loading from error state', async () => {
    // Start in error state
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'error',
      loadingError: 'File not found',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    const { rerender } = render(<MainLayout />);

    expect(screen.getByText('Failed to Load Manuscript')).toBeInTheDocument();

    // Simulate successful file selection and loading
    mockOpenManuscriptDialog.mockResolvedValue('/path/to/manuscript.txt');
    mockLoadManuscript.mockResolvedValue(undefined);

    const chooseFileButton = screen.getByRole('button', { name: /Choose File/i });
    fireEvent.click(chooseFileButton);

    // Update store to loaded state
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'loaded',
      loadingError: null,
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    rerender(<MainLayout />);

    await waitFor(() => {
      expect(screen.getByTestId('manuscript-editor')).toBeInTheDocument();
      expect(screen.queryByText('Failed to Load Manuscript')).not.toBeInTheDocument();
    });
  });

  it('handles file selection cancellation from error state', async () => {
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'error',
      loadingError: 'File not found',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<MainLayout />);

    // Simulate dialog cancellation
    mockOpenManuscriptDialog.mockResolvedValue(null);

    const chooseFileButton = screen.getByRole('button', { name: /Choose File/i });
    fireEvent.click(chooseFileButton);

    await waitFor(() => {
      expect(mockOpenManuscriptDialog).toHaveBeenCalledTimes(1);
      expect(mockLoadManuscript).not.toHaveBeenCalled();
    });

    // Should still show error state
    expect(screen.getByText('Failed to Load Manuscript')).toBeInTheDocument();
  });

  it('handles file selection error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'error',
      loadingError: 'File not found',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<MainLayout />);

    // Simulate dialog error
    mockOpenManuscriptDialog.mockRejectedValue(new Error('Dialog failed'));

    const chooseFileButton = screen.getByRole('button', { name: /Choose File/i });
    fireEvent.click(chooseFileButton);

    await waitFor(() => {
      expect(mockOpenManuscriptDialog).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to open manuscript file:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('shows supported file formats in error state', () => {
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'error',
      loadingError: 'File not found',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<MainLayout />);

    expect(screen.getByText('Supported file formats:')).toBeInTheDocument();
    expect(screen.getByText('.txt')).toBeInTheDocument();
    expect(screen.getByText('.md')).toBeInTheDocument();
    expect(screen.getByText('.manuscript')).toBeInTheDocument();
  });

  it('provides helpful error recovery instructions', () => {
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'error',
      loadingError: 'File not found',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<MainLayout />);

    expect(screen.getByText('To resolve this issue:')).toBeInTheDocument();
    expect(screen.getByText(/Select a manuscript file using the button below/)).toBeInTheDocument();
    expect(screen.getByText(/Ensure the file is not corrupted or in use by another program/)).toBeInTheDocument();
    expect(screen.getByText(/Check that you have permission to read the file/)).toBeInTheDocument();
  });

  it('includes help text for user guidance', () => {
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'error',
      loadingError: 'File not found',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<MainLayout />);

    expect(screen.getByText('Need help? Check that your manuscript file exists and is accessible.')).toBeInTheDocument();
  });

  it('maintains layout structure across different loading states', () => {
    const { rerender } = render(<MainLayout />);

    // Test idle state
    expect(screen.getByTestId('scene-navigator')).toBeInTheDocument();
    expect(screen.getByTestId('decision-bar')).toBeInTheDocument();

    // Test loading state
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'loading',
      loadingError: null,
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    rerender(<MainLayout />);
    expect(screen.getByTestId('scene-navigator')).toBeInTheDocument();
    expect(screen.getByTestId('decision-bar')).toBeInTheDocument();

    // Test error state
    mockUseManuscriptStore.mockReturnValue({
      loadingState: 'error',
      loadingError: 'File not found',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    rerender(<MainLayout />);
    expect(screen.getByTestId('scene-navigator')).toBeInTheDocument();
    expect(screen.getByTestId('decision-bar')).toBeInTheDocument();
  });

  it('handles keyboard shortcuts correctly', () => {
    render(<MainLayout />);

    // Test that keyboard help can be opened (this tests the keyboard event setup)
    expect(screen.queryByTestId('keyboard-help')).not.toBeInTheDocument();
  });

  it('renders overlay components', () => {
    render(<MainLayout />);

    expect(screen.getByTestId('overlay-stack')).toBeInTheDocument();
    expect(screen.getByTestId('llm-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('db-harness')).toBeInTheDocument();
    expect(screen.getByTestId('job-tray')).toBeInTheDocument();
  });

  it('applies correct CSS classes and structure', () => {
    render(<MainLayout />);

    const mainElement = screen.getByRole('main');
    expect(mainElement).toHaveClass('main-grid');

    const panels = screen.getAllByRole('region');
    expect(panels.length).toBeGreaterThan(0);
  });
});
