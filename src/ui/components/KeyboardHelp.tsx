import React, { useEffect, useRef } from "react";

export default function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab") {
        // simple focus trap
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="kbd-help-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div ref={dialogRef} className="bg-white dark:bg-neutral-900 w-[680px] max-w-full rounded shadow-lg p-4" onClick={(e)=> e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="kbd-help-title" className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button ref={closeBtnRef} className="px-2 py-1 rounded border" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-medium mb-1">Global</h3>
            <ul className="space-y-1">
              <li><kbd>G</kbd> Generate</li>
              <li><kbd>C</kbd> Compare</li>
              <li><kbd>E</kbd> Export</li>
              <li><kbd>Cmd/Ctrl</kbd>+<kbd>O</kbd> Open manuscript</li>
              <li><kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> Save</li>
              <li><kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> Export</li>
              <li><kbd>Cmd/Ctrl</kbd>+<kbd>K</kbd> Search</li>
              <li><kbd>Cmd/Ctrl</kbd>+<kbd>/</kbd> Help</li>
              <li><kbd>1</kbd>–<kbd>3</kbd> Focus Left/Center/Right Panel</li>
              <li><kbd>/</kbd> Focus Search</li>
              <li><kbd>?</kbd> Show this help</li>
              <li><kbd>Cmd/Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> Toggle High Contrast</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium mb-1">Navigation</h3>
            <ul className="space-y-1">
              <li><kbd>Arrow Up/Down</kbd> Move selection</li>
              <li><kbd>Enter</kbd> Select scene</li>
              <li><kbd>Tab</kbd> Move between interactive elements</li>
              <li><kbd>Esc</kbd> Close dialogs</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
