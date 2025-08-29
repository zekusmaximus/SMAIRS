import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManuscriptLoadError } from '../ManuscriptLoadError';

// Mock the manuscript store
const mockUseManuscriptStore = vi.fn();
vi.mock('@/stores/manuscript.store', () => ({
  useManuscriptStore: () => mockUseManuscriptStore(),
}));

// Mock the Button component
vi.mock('../Button', () => ({
  Button: ({ children, onClick, variant, size, className }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      className={className}
      data-variant={variant}
      data-size={size}
    >
      {children}
    </button>
  ),
}));

describe('ManuscriptLoadError', () => {
  const mockOpenManuscriptDialog = vi.fn();
  const mockLoadManuscript = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseManuscriptStore.mockReturnValue({
      loadingError: 'Failed to load manuscript: File not found',
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });
  });

  it('renders error message correctly', () => {
    render(<ManuscriptLoadError />);

    expect(screen.getByText('Failed to Load Manuscript')).toBeInTheDocument();
    expect(screen.getByText('Failed to load manuscript: File not found')).toBeInTheDocument();
  });

  it('renders error icon', () => {
    render(<ManuscriptLoadError />);

    const errorIcon = document.querySelector('svg');
    expect(errorIcon).toBeInTheDocument();
    expect(errorIcon).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders instructions for resolving the issue', () => {
    render(<ManuscriptLoadError />);

    expect(screen.getByText('To resolve this issue:')).toBeInTheDocument();
    expect(screen.getByText(/Select a manuscript file using the button below/)).toBeInTheDocument();
    expect(screen.getByText(/Ensure the file is not corrupted or in use by another program/)).toBeInTheDocument();
    expect(screen.getByText(/Check that you have permission to read the file/)).toBeInTheDocument();
  });

  it('renders supported file formats', () => {
    render(<ManuscriptLoadError />);

    expect(screen.getByText('Supported file formats:')).toBeInTheDocument();
    expect(screen.getByText('.txt')).toBeInTheDocument();
    expect(screen.getByText('.md')).toBeInTheDocument();
    expect(screen.getByText('.manuscript')).toBeInTheDocument();
  });

  it('renders Choose File button', () => {
    render(<ManuscriptLoadError />);

    const chooseFileButton = screen.getByRole('button', { name: /Choose File/i });
    expect(chooseFileButton).toBeInTheDocument();
    expect(chooseFileButton).toHaveAttribute('data-variant', 'primary');
  });

  it('renders help text', () => {
    render(<ManuscriptLoadError />);

    expect(screen.getByText('Need help? Check that your manuscript file exists and is accessible.')).toBeInTheDocument();
  });

  it('handles file selection successfully', async () => {
    mockOpenManuscriptDialog.mockResolvedValue('/path/to/manuscript.txt');
    mockLoadManuscript.mockResolvedValue(undefined);

    render(<ManuscriptLoadError />);

    const chooseFileButton = screen.getByRole('button', { name: /Choose File/i });
    fireEvent.click(chooseFileButton);

    await waitFor(() => {
      expect(mockOpenManuscriptDialog).toHaveBeenCalledTimes(1);
      expect(mockLoadManuscript).toHaveBeenCalledWith('/path/to/manuscript.txt');
    });
  });

  it('handles file selection cancellation', async () => {
    mockOpenManuscriptDialog.mockResolvedValue(null);

    render(<ManuscriptLoadError />);

    const chooseFileButton = screen.getByRole('button', { name: /Choose File/i });
    fireEvent.click(chooseFileButton);

    await waitFor(() => {
      expect(mockOpenManuscriptDialog).toHaveBeenCalledTimes(1);
      expect(mockLoadManuscript).not.toHaveBeenCalled();
    });
  });

  it('handles file selection error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockOpenManuscriptDialog.mockRejectedValue(new Error('Dialog failed'));

    render(<ManuscriptLoadError />);

    const chooseFileButton = screen.getByRole('button', { name: /Choose File/i });
    fireEvent.click(chooseFileButton);

    await waitFor(() => {
      expect(mockOpenManuscriptDialog).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to open manuscript file:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('renders with custom className', () => {
    render(<ManuscriptLoadError className="custom-error" />);

    const container = screen.getByText('Failed to Load Manuscript').parentElement?.parentElement;
    expect(container).toHaveClass('custom-error');
  });

  it('renders without error message when loadingError is null', () => {
    mockUseManuscriptStore.mockReturnValue({
      loadingError: null,
      openManuscriptDialog: mockOpenManuscriptDialog,
      loadManuscript: mockLoadManuscript,
    });

    render(<ManuscriptLoadError />);

    expect(screen.getByText('Failed to Load Manuscript')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load manuscript: File not found')).not.toBeInTheDocument();
  });

  it('renders Try Again button when onRetry prop is provided', () => {
    const mockOnRetry = vi.fn();
    render(<ManuscriptLoadError onRetry={mockOnRetry} />);

    const tryAgainButton = screen.getByRole('button', { name: /Try Again/i });
    expect(tryAgainButton).toBeInTheDocument();
    expect(tryAgainButton).toHaveAttribute('data-variant', 'secondary');
  });

  it('calls onRetry when Try Again button is clicked', () => {
    const mockOnRetry = vi.fn();
    render(<ManuscriptLoadError onRetry={mockOnRetry} />);

    const tryAgainButton = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(tryAgainButton);

    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('handles onRetry error gracefully', async () => {
    const mockOnRetry = vi.fn().mockRejectedValue(new Error('Retry failed'));

    render(<ManuscriptLoadError onRetry={mockOnRetry} />);

    const tryAgainButton = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(tryAgainButton);

    await waitFor(() => {
      expect(mockOnRetry).toHaveBeenCalledTimes(1);
    });
  });

  it('applies correct styling classes', () => {
    render(<ManuscriptLoadError />);

    const container = screen.getByText('Failed to Load Manuscript').parentElement?.parentElement;
    expect(container).toHaveClass('flex', 'items-center', 'justify-center', 'min-h-[400px]', 'p-8');

    const innerContainer = screen.getByText('Failed to Load Manuscript').parentElement;
    expect(innerContainer).toHaveClass('text-center', 'max-w-md', 'w-full');
  });

  it('has proper accessibility attributes', () => {
    render(<ManuscriptLoadError />);

    const errorIcon = document.querySelector('svg');
    expect(errorIcon).toHaveAttribute('aria-hidden', 'true');

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeEnabled();
    });
  });
});
