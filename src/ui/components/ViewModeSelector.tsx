import React from 'react';

type ViewMode = 'list' | 'guided' | 'print';

interface ViewModeSelectorProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export function ViewModeSelector({ mode, onChange, className = '' }: ViewModeSelectorProps) {
  const modes: { key: ViewMode; label: string; icon: string; description: string }[] = [
    { 
      key: 'guided', 
      label: 'Guided', 
      icon: '🎯', 
      description: 'Step-by-step instructions'
    },
    { 
      key: 'list', 
      label: 'List View', 
      icon: '📋', 
      description: 'All instructions at once'
    },
    { 
      key: 'print', 
      label: 'Print View', 
      icon: '🖨️', 
      description: 'Print-friendly format'
    }
  ];

  return (
    <div className={`flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${className}`}>
      {modes.map((modeOption) => (
        <button
          key={modeOption.key}
          onClick={() => onChange(modeOption.key)}
          className={`
            flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium
            transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500
            ${mode === modeOption.key
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }
          `}
          aria-pressed={mode === modeOption.key}
          title={modeOption.description}
        >
          <span className="mr-2" aria-hidden="true">{modeOption.icon}</span>
          <span className="hidden sm:inline">{modeOption.label}</span>
        </button>
      ))}
    </div>
  );
}

type DiffViewMode = 'split' | 'unified' | 'changes-only';

interface DiffViewModeSelectorProps {
  mode: DiffViewMode;
  onChange: (mode: DiffViewMode) => void;
  className?: string;
}

export function DiffViewModeSelector({ mode, onChange, className = '' }: DiffViewModeSelectorProps) {
  const modes: { key: DiffViewMode; label: string; icon: string }[] = [
    { key: 'split', label: 'Split', icon: '⫸' },
    { key: 'unified', label: 'Unified', icon: '📄' },
    { key: 'changes-only', label: 'Changes', icon: '🔍' }
  ];

  return (
    <div className={`flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${className}`}>
      {modes.map((modeOption) => (
        <button
          key={modeOption.key}
          onClick={() => onChange(modeOption.key)}
          className={`
            flex items-center px-3 py-2 rounded-md text-sm font-medium
            transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500
            ${mode === modeOption.key
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }
          `}
          aria-pressed={mode === modeOption.key}
        >
          <span className="mr-2" aria-hidden="true">{modeOption.icon}</span>
          {modeOption.label}
        </button>
      ))}
    </div>
  );
}