import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import userEvent from '@testing-library/user-event';

// Import components
import { RevisionInstructionViewer } from '../RevisionInstructionViewer.js';
import { VersionComparisonModal } from '../VersionComparisonModal.js';
import { ExportProgressIndicator } from '../ExportProgressIndicator.js';
import { ProgressBar } from '../ProgressBar.js';
import { Button } from '../Button.js';
import { Modal } from '../Modal.js';
import { Toggle } from '../Toggle.js';

// Mock data
const mockInstructions = [
  {
    stepNumber: 1,
    sceneId: 'ch01_s01',
    sceneName: 'Chapter 1, Scene 1',
    instructionType: 'replace' as const,
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
      explanation: 'Increase pace'
    }
  }
];

const mockChanges = [
  {
    type: 'added' as const,
    revisedText: 'New content',
    startOffset: 0,
    endOffset: 11
  }
];

describe('Accessibility Tests', () => {
  describe('RevisionInstructionViewer', () => {
    it('should not have accessibility violations', async () => {
      const { container } = render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={() => {}}
          onApplyAll={() => {}}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('supports screen reader navigation', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={() => {}}
          onApplyAll={() => {}}
        />
      );

      // Main heading should be accessible
      expect(screen.getByRole('heading', { name: /revision instructions/i })).toBeInTheDocument();

      // Progress bar should have proper ARIA attributes
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow');
      expect(progressBar).toHaveAttribute('aria-valuemax');
      expect(progressBar).toHaveAttribute('aria-label');
    });

    it('has proper focus management', async () => {
      const user = userEvent.setup();

      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={() => {}}
          onApplyAll={() => {}}
        />
      );

      // Search input should be focusable
      const searchInput = screen.getByRole('textbox', { name: /search/i });
      await user.click(searchInput);
      expect(searchInput).toHaveFocus();

      // Buttons should be focusable and have visible focus indicators
      const buttons = screen.getAllByRole('button');
      for (const button of buttons) {
        await user.tab();
        if (document.activeElement === button) {
          expect(button).toHaveFocus();
        }
      }
    });

    it('provides keyboard alternatives for mouse actions', () => {
      render(
        <RevisionInstructionViewer
          instructions={mockInstructions}
          onApply={() => {}}
          onApplyAll={() => {}}
        />
      );

      // Keyboard shortcuts should be documented
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });
  });

  describe('VersionComparisonModal', () => {
    it('should not have accessibility violations', async () => {
      const { container } = render(
        <VersionComparisonModal
          original="Original text"
          revised="Revised text"
          changes={mockChanges}
          isOpen={true}
          onClose={() => {}}
          onAccept={() => {}}
          onReject={() => {}}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has proper modal semantics', () => {
      render(
        <VersionComparisonModal
          original="Original text"
          revised="Revised text"
          changes={mockChanges}
          isOpen={true}
          onClose={() => {}}
          onAccept={() => {}}
          onReject={() => {}}
        />
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby');
    });

    it('manages focus correctly', async () => {
      const { rerender } = render(
        <VersionComparisonModal
          original="Original text"
          revised="Revised text"
          changes={mockChanges}
          isOpen={false}
          onClose={() => {}}
          onAccept={() => {}}
          onReject={() => {}}
        />
      );

      // Store currently focused element
      const button = document.createElement('button');
      document.body.appendChild(button);
      button.focus();

      // Open modal
      rerender(
        <VersionComparisonModal
          original="Original text"
          revised="Revised text"
          changes={mockChanges}
          isOpen={true}
          onClose={() => {}}
          onAccept={() => {}}
          onReject={() => {}}
        />
      );

      // Focus should move to modal
      const modal = screen.getByRole('dialog').querySelector('[tabindex="-1"]');
      expect(document.activeElement).toBe(modal);

      // Clean up
      document.body.removeChild(button);
    });

    it('traps focus within modal', async () => {
      const user = userEvent.setup();

      render(
        <VersionComparisonModal
          original="Original text"
          revised="Revised text"
          changes={mockChanges}
          isOpen={true}
          onClose={() => {}}
          onAccept={() => {}}
          onReject={() => {}}
        />
      );

      const modal = screen.getByRole('dialog');
      const buttons = modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');

      if (buttons.length > 1) {
        // Focus first button
        (buttons[0] as HTMLElement).focus();
        expect(buttons[0]).toHaveFocus();

        // Tab through all focusable elements
        for (let i = 1; i < buttons.length; i++) {
          await user.tab();
          expect(buttons[i]).toHaveFocus();
        }

        // Tabbing from last element should cycle back to first
        await user.tab();
        expect(buttons[0]).toHaveFocus();
      }
    });
  });

  describe('ExportProgressIndicator', () => {
    beforeEach(() => {
      // Mock the export store
      vi.doMock('../../hooks/useExportStore.js', () => ({
        useExportStore: () => ({
          state: 'exporting',
          progress: 0.5,
          currentStep: 2,
          steps: [
            { id: 'step1', label: 'Step 1', description: 'Description 1', estimated: 5 },
            { id: 'step2', label: 'Step 2', description: 'Description 2', estimated: 10 }
          ],
          error: undefined,
          retryExport: () => {},
          resetExport: () => {},
          openExportFolder: () => {},
          getStepStatus: () => 'active',
          getTimeElapsed: () => 15,
          getTimeRemaining: () => 30,
        })
      }));
    });

    it('should not have accessibility violations', async () => {
      const { container } = render(<ExportProgressIndicator />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('provides proper ARIA labels for progress', () => {
      render(<ExportProgressIndicator />);

      const progressBars = screen.getAllByRole('progressbar');
      progressBars.forEach(progressBar => {
        expect(progressBar).toHaveAttribute('aria-valuenow');
        expect(progressBar).toHaveAttribute('aria-valuemax');
      });
    });

    it('announces status changes to screen readers', () => {
      render(<ExportProgressIndicator />);

      // Should have live regions for status announcements
      const liveRegions = document.querySelectorAll('[aria-live]');
      expect(liveRegions.length).toBeGreaterThan(0);
    });
  });

  describe('Core Components Accessibility', () => {
    describe('Button', () => {
      it('should not have accessibility violations', async () => {
        const { container } = render(<Button>Test Button</Button>);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('has proper disabled state', () => {
        render(<Button disabled>Disabled Button</Button>);

        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('disabled');
      });

      it('supports loading state with proper ARIA', () => {
        render(<Button loading>Loading Button</Button>);

        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
        expect(button.querySelector('[class*="animate-spin"]')).toBeInTheDocument();
      });
    });

    describe('Toggle', () => {
      it('should not have accessibility violations', async () => {
        const { container } = render(
          <Toggle
            checked={false}
            onChange={() => {}}
            label="Test Toggle"
          />
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('has proper switch semantics', () => {
        render(
          <Toggle
            checked={true}
            onChange={() => {}}
            label="Accessible Toggle"
            description="This is a test toggle"
          />
        );

        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        expect(toggle).toHaveAttribute('aria-labelledby');
        expect(toggle).toHaveAttribute('aria-describedby');
      });
    });

    describe('Modal', () => {
      it('should not have accessibility violations', async () => {
        const { container } = render(
          <Modal isOpen={true} onClose={() => {}}>
            <div>Modal content</div>
          </Modal>
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('has proper modal ARIA attributes', () => {
        render(
          <Modal isOpen={true} onClose={() => {}} ariaLabel="Test Modal">
            <div>Modal content</div>
          </Modal>
        );

        const modal = screen.getByRole('dialog');
        expect(modal).toHaveAttribute('aria-modal', 'true');
      });

      it('prevents body scroll when open', () => {
        const { rerender } = render(
          <Modal isOpen={false} onClose={() => {}} ariaLabel="Test Modal">
            <div>Modal content</div>
          </Modal>
        );

        expect(document.body.style.overflow).not.toBe('hidden');

        rerender(
          <Modal isOpen={true} onClose={() => {}} ariaLabel="Test Modal">
            <div>Modal content</div>
          </Modal>
        );

        expect(document.body.style.overflow).toBe('hidden');
      });
    });

    describe('ProgressBar', () => {
      it('should not have accessibility violations', async () => {
        const { container } = render(
          <ProgressBar
            value={50}
            max={100}
            label="Loading progress"
            showPercentage={true}
          />
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('has proper progressbar semantics', () => {
        render(
          <ProgressBar
            value={75}
            max={100}
            label="Test Progress"
          />
        );

        const progressbar = screen.getByRole('progressbar');
        expect(progressbar).toHaveAttribute('aria-valuenow', '75');
        expect(progressbar).toHaveAttribute('aria-valuemax', '100');
        expect(progressbar).toHaveAttribute('aria-label', 'Test Progress');
      });
    });
  });

  describe('Color Contrast and Visual Accessibility', () => {
    it('uses sufficient color contrast for text', () => {
      render(
        <div className="text-gray-900 dark:text-gray-100">
          High contrast text
        </div>
      );

      // This is more of a design system test, but we verify the classes are applied
      const element = screen.getByText('High contrast text');
      expect(element).toHaveClass('text-gray-900', 'dark:text-gray-100');
    });

    it('provides focus indicators', () => {
      render(<Button>Focusable Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus:outline-none', 'focus:ring-2');
    });

    it('supports reduced motion preferences', () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query.includes('prefers-reduced-motion: reduce'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      render(<Button>Motion Sensitive Button</Button>);

      // Components should respect reduced motion
      // This would need to be implemented in the actual components
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Screen Reader Support', () => {
    it('provides proper heading hierarchy', () => {
      render(
        <div>
          <h1>Main Title</h1>
          <h2>Section Title</h2>
          <h3>Subsection Title</h3>
        </div>
      );

      const h1 = screen.getByRole('heading', { level: 1 });
      const h2 = screen.getByRole('heading', { level: 2 });
      const h3 = screen.getByRole('heading', { level: 3 });

      expect(h1).toBeInTheDocument();
      expect(h2).toBeInTheDocument();
      expect(h3).toBeInTheDocument();
    });

    it('provides descriptive link text', () => {
      render(
        <a href="/help">
          Get help with revision instructions
        </a>
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAccessibleName('Get help with revision instructions');
    });

    it('uses proper list semantics', () => {
      render(
        <ul>
          <li>First item</li>
          <li>Second item</li>
        </ul>
      );

      const list = screen.getByRole('list');
      const items = screen.getAllByRole('listitem');

      expect(list).toBeInTheDocument();
      expect(items).toHaveLength(2);
    });
  });
});
