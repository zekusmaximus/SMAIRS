import React from 'react';

function EnvHint() {
  // Vite provides typed env vars via vite/client; no need for any cast.
  const mode = import.meta.env.MODE ?? 'unknown';
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
