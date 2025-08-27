import React from 'react';

interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
  showPercentage?: boolean;
  label?: string;
}

export function ProgressBar({ 
  value, 
  max, 
  className = '', 
  showPercentage = false,
  label 
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-2 text-sm">
          {label && <span className="text-gray-700 dark:text-gray-300">{label}</span>}
          {showPercentage && (
            <span className="text-gray-600 dark:text-gray-400">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div 
          className="h-2 bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemax={max}
          aria-label={label}
        />
      </div>
    </div>
  );
}

interface SteppedProgressBarProps {
  total: number;
  completed: number;
  className?: string;
}

export function SteppedProgressBar({ total, completed, className = '' }: SteppedProgressBarProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  
  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Progress
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {completed} of {total} completed
        </span>
      </div>
      <ProgressBar value={completed} max={total} />
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}