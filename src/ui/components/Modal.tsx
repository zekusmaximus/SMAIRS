import React, { useEffect, useRef } from 'react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  size?: ModalSize;
  className?: string;
  children?: React.ReactNode;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  // Accessibility: prefer labelledBy to reference a title element id; fallback to ariaLabel
  labelledBy?: string;
  ariaLabel?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
  full: 'max-w-full mx-4'
};

export function Modal({
  isOpen,
  onClose,
  size = 'md',
  className = '',
  children,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  labelledBy,
  ariaLabel
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement>();
  const firstFocusable = useRef<HTMLElement | null>(null);
  const lastFocusable = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Save currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus the modal
      modalRef.current?.focus();

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Establish simple focus trap within modal
      const focusables = modalRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables && focusables.length > 0) {
        firstFocusable.current = focusables[0] ?? null;
        lastFocusable.current = focusables[focusables.length - 1] ?? null;
      }
    } else {
      // Restore body scroll
      document.body.style.overflow = 'unset';

      // Restore focus
      previousActiveElement.current?.focus();
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, closeOnEscape]);

  // Focus trap key handling
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const active = document.activeElement as HTMLElement | null;
      if (!firstFocusable.current || !lastFocusable.current || !active) return;
      if (e.shiftKey) {
        if (active === firstFocusable.current) {
          e.preventDefault();
          lastFocusable.current.focus();
        }
      } else {
        if (active === lastFocusable.current) {
          e.preventDefault();
          firstFocusable.current.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
  {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': ariaLabel ?? 'Modal' })}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0"
        onClick={handleOverlayClick}
        data-testid="modal-overlay"
      >
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          aria-hidden="true"
        />

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div
          ref={modalRef}
          className={`
            inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg shadow-xl
            transform transition-all sm:my-8 sm:align-middle sm:w-full
            ${sizeStyles[size]}
            ${className}
          `}
          tabIndex={-1}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function ModalHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-4 border-b border-gray-200 dark:border-gray-700 ${className}`}>
      {children}
    </div>
  );
}

export function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function ModalFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 ${className}`}>
      {children}
    </div>
  );
}

export function ModalToolbar({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between ${className}`}>
      {children}
    </div>
  );
}
