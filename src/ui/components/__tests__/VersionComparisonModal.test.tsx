import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionComparisonModal } from '../VersionComparisonModal.js';
import type { DiffSegment } from '../../../features/manuscript/diff-engine.js';

// Mock diff segments data
const mockChanges: DiffSegment[] = [
  {
    type: 'unchanged',
    originalText: 'The quick brown fox',
    revisedText: 'The quick brown fox',
    startOffset: 0,
    endOffset: 19
  },
  {
    type: 'deleted',
    originalText: ' jumped over',
    startOffset: 19,
    endOffset: 31,
    reason: 'Remove unnecessary action',
    source: 'spoiler'
  },
  {
    type: 'added',
    revisedText: ' leaped gracefully over',
    startOffset: 19,
    endOffset: 41,
    reason: 'Add more descriptive action',
    source: 'enhancement'
  },
  {
    type: 'unchanged',
    originalText: ' the lazy dog.',
    revisedText: ' the lazy dog.',
    startOffset: 31,
    endOffset: 45
  },
  {
    type: 'modified',
    originalText: 'It was a dark night.',
    revisedText: 'It was a moonlit evening.',
    startOffset: 46,
    endOffset: 66,
    reason: 'Improve atmosphere',
    source: 'context'
  }
];

const mockOriginal = 'The quick brown fox jumped over the lazy dog. It was a dark night.';
const mockRevised = 'The quick brown fox leaped gracefully over the lazy dog. It was a moonlit evening.';

describe('VersionComparisonModal', () => {
  const mockOnClose = vi.fn();
  const mockOnAccept = vi.fn();
  const mockOnReject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders modal when open', () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Version Comparison')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={false}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('displays custom title', () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
          title="Custom Comparison Title"
        />
      );

      expect(screen.getByText('Custom Comparison Title')).toBeInTheDocument();
    });
  });

  describe('Diff Statistics', () => {
    it('shows correct diff statistics', () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      // Should show: 1 added, 1 deleted, 1 modified = 3 changes total
      expect(screen.getByText('+1')).toBeInTheDocument(); // added
      expect(screen.getByText('-1')).toBeInTheDocument(); // deleted
      expect(screen.getByText('~1')).toBeInTheDocument(); // modified
      expect(screen.getByText('3 changes')).toBeInTheDocument();
    });

    it('handles empty changes gracefully', () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={[]}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('0 changes')).toBeInTheDocument();
    });
  });

  describe('View Mode Switching', () => {
    it('switches between view modes', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      // Default is split view
      expect(screen.getByText('Original')).toBeInTheDocument();
      expect(screen.getByText('Revised')).toBeInTheDocument();

      // Switch to unified view
      const unifiedButton = screen.getByRole('button', { name: /unified/i });
      await user.click(unifiedButton);

      // Should no longer have split headers
      expect(screen.queryByText('Original')).not.toBeInTheDocument();
      expect(screen.queryByText('Revised')).not.toBeInTheDocument();

      // Switch to changes-only view
      const changesButton = screen.getByRole('button', { name: /changes/i });
      await user.click(changesButton);

      // Should show change cards
      expect(screen.getByText('- Deleted')).toBeInTheDocument();
      expect(screen.getByText('+ Added')).toBeInTheDocument();
      expect(screen.getByText('~ Modified')).toBeInTheDocument();
    });
  });

  describe('Toggle Controls', () => {
    it('toggles line numbers', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const lineNumbersToggle = screen.getByLabelText('Line Numbers');
      expect(lineNumbersToggle).toBeChecked();

      await user.click(lineNumbersToggle);
      expect(lineNumbersToggle).not.toBeChecked();
    });

    it('toggles syntax highlighting', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const syntaxToggle = screen.getByLabelText('Syntax Highlighting');
      expect(syntaxToggle).toBeChecked();

      await user.click(syntaxToggle);
      expect(syntaxToggle).not.toBeChecked();
    });
  });

  describe('Search Functionality', () => {
    it('filters changes by search query', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      // Switch to changes-only view to see all changes
      const changesButton = screen.getByRole('button', { name: /changes/i });
      await user.click(changesButton);

      expect(screen.getByText('- Deleted')).toBeInTheDocument();
      expect(screen.getByText('+ Added')).toBeInTheDocument();

      // Search for "gracefully"
      const searchInput = screen.getByPlaceholderText('Search in changes...');
      await user.type(searchInput, 'gracefully');

      await waitFor(() => {
        expect(screen.getByText('+ Added')).toBeInTheDocument();
        expect(screen.queryByText('- Deleted')).not.toBeInTheDocument();
      });
    });

    it('shows no results when search yields no matches', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      // Switch to changes-only view
      const changesButton = screen.getByRole('button', { name: /changes/i });
      await user.click(changesButton);

      const searchInput = screen.getByPlaceholderText('Search in changes...');
      await user.type(searchInput, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('No changes found')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('navigates between changes with buttons', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      const prevButton = screen.getByRole('button', { name: /prev/i });

      await user.click(nextButton);
      // Should navigate to first change
      
      await user.click(prevButton);
      // Should navigate to previous change
    });

    it('disables navigation when no changes', () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={[]}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      const prevButton = screen.getByRole('button', { name: /prev/i });

      expect(nextButton).toBeDisabled();
      expect(prevButton).toBeDisabled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates with ctrl+arrow keys', async () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      // Navigate down
      fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
      // Should navigate to next change

      // Navigate up  
      fireEvent.keyDown(window, { key: 'ArrowUp', ctrlKey: true });
      // Should navigate to previous change
    });

    it('navigates with n/p keys', async () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
      // Should navigate to next change

      fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
      // Should navigate to previous change
    });

    it('closes modal with escape key', async () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('clears search with escape when search has value', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search in changes...');
      await user.type(searchInput, 'test');

      expect(searchInput).toHaveValue('test');

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
      });

      // Modal should not close when clearing search
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Changes Only View', () => {
    beforeEach(() => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );
    });

    it('shows individual change cards with details', async () => {
      const user = userEvent.setup();
      
      const changesButton = screen.getByRole('button', { name: /changes/i });
      await user.click(changesButton);

      // Should show change type badges
      expect(screen.getByText('- Deleted')).toBeInTheDocument();
      expect(screen.getByText('+ Added')).toBeInTheDocument();
      expect(screen.getByText('~ Modified')).toBeInTheDocument();

      // Should show source tags
      expect(screen.getByText('spoiler')).toBeInTheDocument();
      expect(screen.getByText('enhancement')).toBeInTheDocument();
      expect(screen.getByText('context')).toBeInTheDocument();

      // Should show reasons
      expect(screen.getByText('Remove unnecessary action')).toBeInTheDocument();
      expect(screen.getByText('Add more descriptive action')).toBeInTheDocument();
      expect(screen.getByText('Improve atmosphere')).toBeInTheDocument();
    });

    it('allows clicking on changes to select them', async () => {
      const user = userEvent.setup();
      
      const changesButton = screen.getByRole('button', { name: /changes/i });
      await user.click(changesButton);

      const deleteChange = screen.getByText('- Deleted').closest('div');
      await user.click(deleteChange!);

      // Should highlight the selected change
      expect(deleteChange).toHaveClass('ring-2', 'ring-blue-500');
    });
  });

  describe('Modal Actions', () => {
    it('calls onClose when close button clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onAccept when accept button clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const acceptButton = screen.getByRole('button', { name: /accept changes/i });
      await user.click(acceptButton);

      expect(mockOnAccept).toHaveBeenCalled();
    });

    it('calls onReject when reject button clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const rejectButton = screen.getByRole('button', { name: /reject changes/i });
      await user.click(rejectButton);

      expect(mockOnReject).toHaveBeenCalled();
    });

    it('closes when clicking overlay', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const overlay = screen.getByRole('dialog').parentElement;
      await user.click(overlay!);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper modal ARIA attributes', () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby');
    });

    it('focuses modal on open', () => {
      const { rerender } = render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={false}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      rerender(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const modal = screen.getByRole('dialog').querySelector('[tabindex="-1"]');
      expect(document.activeElement).toBe(modal);
    });

    it('provides keyboard shortcut hints', () => {
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Navigate changes')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('handles large documents without lag', () => {
      const largeOriginal = 'A'.repeat(50000);
      const largeRevised = 'B'.repeat(50000);
      const manyChanges: DiffSegment[] = Array.from({ length: 1000 }, (_, i) => ({
        type: 'modified' as const,
        originalText: `Original text ${i}`,
        revisedText: `Revised text ${i}`,
        startOffset: i * 50,
        endOffset: (i + 1) * 50,
        reason: `Change ${i}`,
        source: 'spoiler' as const
      }));

      const startTime = performance.now();
      
      render(
        <VersionComparisonModal
          original={largeOriginal}
          revised={largeRevised}
          changes={manyChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const endTime = performance.now();
      
      // Should render within reasonable time
      expect(endTime - startTime).toBeLessThan(200);
      expect(screen.getByText('1000 changes')).toBeInTheDocument();
    });

    it('efficiently switches between view modes', async () => {
      const user = userEvent.setup();
      
      render(
        <VersionComparisonModal
          original={mockOriginal}
          revised={mockRevised}
          changes={mockChanges}
          isOpen={true}
          onClose={mockOnClose}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      const startTime = performance.now();
      
      // Switch between all view modes quickly
      const unifiedButton = screen.getByRole('button', { name: /unified/i });
      await user.click(unifiedButton);
      
      const changesButton = screen.getByRole('button', { name: /changes/i });
      await user.click(changesButton);
      
      const splitButton = screen.getByRole('button', { name: /split/i });
      await user.click(splitButton);

      const endTime = performance.now();
      
      // View mode switching should be fast
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});