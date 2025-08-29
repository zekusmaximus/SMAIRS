import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RevisionInstructionViewer } from '../RevisionInstructionViewer.js';
import type { RevisionInstruction } from '../../../features/export/revision-instructions.js';

// Mock instructions data
const mockInstructions: RevisionInstruction[] = [
  {
    stepNumber: 1,
    sceneId: 'ch01_s01',
    sceneName: 'Chapter 1, Scene 1',
    instructionType: 'replace',
    findContext: {
      precedingText: 'The detective walked',
      targetText: 'slowly',
      followingText: 'down the street',
      approximateLine: 12,
      approximateParagraph: 3
    },
    action: {
      verb: 'Replace',
      original: 'slowly',
      replacement: 'quickly',
      explanation: 'Increase the pace to build tension'
    },
    beforeAfter: {
      before: 'The detective walked **slowly** down the street',
      after: 'The detective walked **quickly** down the street'
    }
  },
  {
    stepNumber: 2,
    sceneId: 'ch01_s01',
    sceneName: 'Chapter 1, Scene 1',
    instructionType: 'delete',
    findContext: {
      precedingText: 'It was',
      targetText: 'a dark and stormy night',
      followingText: 'when the phone rang',
      approximateLine: 1,
      approximateParagraph: 1
    },
    action: {
      verb: 'Delete',
      original: 'a dark and stormy night',
      explanation: 'Remove cliché opening line'
    },
    beforeAfter: {
      before: 'It was **a dark and stormy night** when the phone rang',
      after: 'It was when the phone rang'
    }
  },
  {
    stepNumber: 3,
    sceneId: 'ch02_s01',
    sceneName: 'Chapter 2, Scene 1',
    instructionType: 'insert',
    findContext: {
      precedingText: 'The door opened',
      targetText: '',
      followingText: 'and revealed the mystery',
      approximateLine: 45,
      approximateParagraph: 12
    },
    action: {
      verb: 'Insert',
      replacement: ' with a loud creak',
      explanation: 'Add atmospheric detail'
    },
    beforeAfter: {
      before: 'The door opened and revealed the mystery',
      after: 'The door opened **with a loud creak** and revealed the mystery'
    }
  }
];

// manuscript string not required for current component props

describe('RevisionInstructionViewer', () => {
  const mockOnApply = vi.fn();
  const mockOnApplyAll = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.print
    Object.defineProperty(window, 'print', {
      value: vi.fn(),
    });
  // Clipboard is polyfilled in tests/setup; nothing else needed here
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('displays instructions in guided mode by default', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      expect(screen.getByText('Revision Instructions')).toBeInTheDocument();
      expect(screen.getByText('3 instructions')).toBeInTheDocument();
      expect(screen.getByText('Step 1: Replace Text')).toBeInTheDocument();
      expect(screen.getByText('Chapter 1, Scene 1')).toBeInTheDocument();
    });

    it('shows empty state when no instructions', () => {
      render(
        <RevisionInstructionViewer
          instructions={[]}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      expect(screen.getByText('No Revisions Needed')).toBeInTheDocument();
      expect(screen.getByText('Your manuscript is ready to go!')).toBeInTheDocument();
    });

  it('displays progress indicator', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

    // Header label for progress summary should be visible once
    const headerLabel = screen.getByText('Progress');
    expect(headerLabel).toBeInTheDocument();
  expect(screen.getByText('0 of 3 completed')).toBeInTheDocument();
    });
  });

  describe('View Mode Switching', () => {
    it('switches to list view', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const listViewButton = screen.getByRole('button', { name: /list view/i });
      await user.click(listViewButton);

      // In list view, all instructions should be visible
      expect(screen.getByText('Step 1: Replace Text')).toBeInTheDocument();
      expect(screen.getByText('Step 2: Remove Content')).toBeInTheDocument();
      expect(screen.getByText('Step 3: Add Content')).toBeInTheDocument();
    });

    it('switches to print view', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

  const printViewButton = screen.getByRole('button', { name: /print view/i });
      await user.click(printViewButton);

  expect(screen.getByText(/Generated by SMAIRS/i)).toBeInTheDocument();
    });
  });

  describe('Guided Mode Navigation', () => {
    it('navigates to next step', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      expect(screen.getByText('Step 1: Replace Text')).toBeInTheDocument();

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(screen.getByText('Step 2: Remove Content')).toBeInTheDocument();
    });

    it('navigates to previous step', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      // Go to step 2 first
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(screen.getByText('Step 2: Remove Content')).toBeInTheDocument();

      // Go back to step 1
      const prevButton = screen.getByRole('button', { name: /previous/i });
      await user.click(prevButton);

      expect(screen.getByText('Step 1: Replace Text')).toBeInTheDocument();
    });

    it('disables navigation at boundaries', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      // Previous should be disabled at first step
      const prevButton = screen.getByRole('button', { name: /previous/i });
      expect(prevButton).toBeDisabled();
    });
  });

  describe('Instruction Completion', () => {
    it('marks instruction as complete', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const completeButton = screen.getByRole('button', { name: /mark complete/i });
      await user.click(completeButton);

      expect(mockOnApply).toHaveBeenCalledWith(mockInstructions[0]);
      expect(screen.getByText('✓ Completed')).toBeInTheDocument();
      expect(screen.getByText('1 of 3 completed')).toBeInTheDocument();
    });

    it('toggles completion state', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const completeButton = screen.getByRole('button', { name: /mark complete/i });

      // Mark as complete
      await user.click(completeButton);
      expect(screen.getByText('✓ Completed')).toBeInTheDocument();

      // Mark as incomplete
      await user.click(completeButton);
      expect(screen.getByText('Mark Complete')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('filters instructions by search query', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      // Switch to list view to see all instructions
      const listViewButton = screen.getByRole('button', { name: /list view/i });
      await user.click(listViewButton);

      expect(screen.getByText('Step 1: Replace Text')).toBeInTheDocument();
      expect(screen.getByText('Step 2: Remove Content')).toBeInTheDocument();
      expect(screen.getByText('Step 3: Add Content')).toBeInTheDocument();

      // Search for "delete"
      const searchInput = screen.getByPlaceholderText('Search instructions...');
      await user.type(searchInput, 'delete');

      await waitFor(() => {
        expect(screen.getByText('Step 2: Remove Content')).toBeInTheDocument();
        expect(screen.queryByText('Step 1: Replace Text')).not.toBeInTheDocument();
        expect(screen.queryByText('Step 3: Add Content')).not.toBeInTheDocument();
      });
    });

    it('shows no results message when search yields no matches', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search instructions...');
      await user.type(searchInput, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('No Results Found')).toBeInTheDocument();
        expect(screen.getByText('Try adjusting your search query.')).toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      // Mock focus management
      Element.prototype.scrollIntoView = vi.fn();
    });

    it('supports arrow key navigation in guided mode', async () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      expect(screen.getByText('Step 1: Replace Text')).toBeInTheDocument();

      // Navigate right
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      await waitFor(() => {
        expect(screen.getByText('Step 2: Remove Content')).toBeInTheDocument();
      });

      // Navigate left
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      await waitFor(() => {
        expect(screen.getByText('Step 1: Replace Text')).toBeInTheDocument();
      });
    });

    it('supports space key for navigation', async () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      expect(screen.getByText('Step 1: Replace Text')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: ' ' });
      await waitFor(() => {
        expect(screen.getByText('Step 2: Remove Content')).toBeInTheDocument();
      });
    });

    it('supports ctrl+enter to mark complete', async () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockOnApply).toHaveBeenCalledWith(mockInstructions[0]);
      });
    });

    it('clears search with escape key', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

  const searchInput = screen.getByPlaceholderText('Search instructions...');
  await user.type(searchInput, 'hello');

      // Trigger Escape via user to mimic real keyboard usage
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search instructions...')).toHaveValue('');
      });
    });
  });

  describe('Context Panel', () => {
    it('displays context for current instruction', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      expect(screen.getByText('Manuscript Context')).toBeInTheDocument();
      expect(screen.getByText('Scene: Chapter 1, Scene 1')).toBeInTheDocument();
      expect(screen.getByText('Approximate line 12')).toBeInTheDocument();
    });

    it('highlights target text in context', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      // The target text should be highlighted
  const highlightedText = screen.getByTestId('context-highlight');
      expect(highlightedText).toHaveClass('bg-yellow-200');
    });
  });

  describe('Action Buttons', () => {
    it('calls onApplyAll when Apply All button clicked', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const applyAllButton = screen.getByRole('button', { name: /apply all automatically/i });
      await user.click(applyAllButton);

      expect(mockOnApplyAll).toHaveBeenCalled();
    });

    it('opens print dialog when Print button clicked', async () => {
      const user = userEvent.setup();
      const printSpy = vi.spyOn(window, 'print');

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

  const printButton = screen.getByRole('button', { name: /^print$/i });
      await user.click(printButton);

      expect(printSpy).toHaveBeenCalled();
    });

    it('exports to PDF when Export PDF button clicked', async () => {
      const user = userEvent.setup();
      // Mock window.open
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const exportButton = screen.getByRole('button', { name: /export pdf/i });
      await user.click(exportButton);

      expect(openSpy).toHaveBeenCalledWith('', '_blank');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '3');
    });

    it('supports screen readers with proper headings', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      expect(screen.getByRole('heading', { name: 'Revision Instructions' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Step 1: Replace Text' })).toBeInTheDocument();
    });

    it('provides keyboard shortcuts help', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('handles large number of instructions efficiently', () => {
      const largeInstructionSet = Array.from({ length: 1000 }, (_, i) => ({
        ...mockInstructions[0]!,
        stepNumber: i + 1,
        sceneId: `ch${Math.floor(i / 10) + 1}_s${(i % 10) + 1}`,
      }));

      const startTime = performance.now();

      render(
        <RevisionInstructionViewer
          instructions={largeInstructionSet}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const endTime = performance.now();

      // Should render within reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
      expect(screen.getByText('1000 instructions')).toBeInTheDocument();
    });

    it('efficiently filters large instruction sets', async () => {
      const user = userEvent.setup();
      const largeInstructionSet = Array.from({ length: 1000 }, (_, i) => ({
        ...mockInstructions[0]!,
        stepNumber: i + 1,
        sceneId: `scene${i}`,
        action: {
          ...mockInstructions[0]!.action,
          explanation: i % 10 === 0 ? 'Special instruction to find' : 'Regular instruction'
        }
      }));

      render(
        <RevisionInstructionViewer
          instructions={largeInstructionSet}
          onApply={mockOnApply}
          onApplyAll={mockOnApplyAll}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search instructions...');

      const startTime = performance.now();
      await user.type(searchInput, 'Special');
      const endTime = performance.now();

  // Search should be reasonably fast (< 300ms) under jsdom/CI
  expect(endTime - startTime).toBeLessThan(300);

      await waitFor(() => {
        // Verify header summary shows the filtered count
        expect(screen.getByText(/100\s+instructions\s+\(filtered from 1000\)/i)).toBeInTheDocument();
      });
    });
  });
});
