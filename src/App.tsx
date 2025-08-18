import React from 'react';

function EnvHint() {
  const env = (import.meta as any).env;
  const mode: string = env?.MODE || 'unknown';
  return <small style={{ opacity: 0.6 }}>mode: {mode}</small>;
}

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>SMAIRS</h1>
      <EnvHint />
    </div>
  );
}
