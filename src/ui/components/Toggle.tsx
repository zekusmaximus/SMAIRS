import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles = {
  sm: {
    switch: 'h-4 w-7',
    thumb: 'h-3 w-3',
    translate: 'translate-x-3'
  },
  md: {
    switch: 'h-5 w-9',
    thumb: 'h-4 w-4',
    translate: 'translate-x-4'
  },
  lg: {
    switch: 'h-6 w-11',
    thumb: 'h-5 w-5',
    translate: 'translate-x-5'
  }
};

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className = ''
}: ToggleProps) {
  const styles = sizeStyles[size];
  
  return (
    <div className={`flex items-center ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? 'toggle-label' : undefined}
        aria-describedby={description ? 'toggle-description' : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex flex-shrink-0 border-2 border-transparent rounded-full cursor-pointer
          transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${styles.switch}
          ${checked 
            ? 'bg-blue-600 dark:bg-blue-500' 
            : 'bg-gray-200 dark:bg-gray-700'
          }
        `}
      >
        <span className="sr-only">{label || 'Toggle'}</span>
        <span
          className={`
            pointer-events-none inline-block rounded-full bg-white shadow transform ring-0 
            transition ease-in-out duration-200
            ${styles.thumb}
            ${checked ? styles.translate : 'translate-x-0'}
          `}
        />
      </button>
      
      {(label || description) && (
        <div className="ml-3">
          {label && (
            <div 
              id="toggle-label" 
              className="text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              {label}
            </div>
          )}
          {description && (
            <div 
              id="toggle-description" 
              className="text-sm text-gray-500 dark:text-gray-400"
            >
              {description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Toggle;