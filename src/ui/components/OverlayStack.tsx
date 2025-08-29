import React from 'react';

interface OverlayStackProps {
  children: React.ReactNode;
  className?: string;
}

export function OverlayStack({ children, className = '' }: OverlayStackProps) {
  return (
    <div
      className={`overlay-stack ${className}`}
      style={{
        position: 'fixed',
        bottom: '12px',
        right: '12px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: '8px',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {React.Children.map(children, (child) => (
        <div style={{ pointerEvents: 'auto' }}>
          {child}
        </div>
      ))}
    </div>
  );
}

export default OverlayStack;
