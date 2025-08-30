import React from 'react';

export function DebugPanel() {
  // Debug environment variables
  const envVars = {
    // Via import.meta.env (should work in Vite/Tauri)
    ANTHROPIC_VIA_IMPORT: import.meta.env.ANTHROPIC_API_KEY,
    OPENAI_VIA_IMPORT: import.meta.env.OPENAI_API_KEY,
    GOOGLE_VIA_IMPORT: import.meta.env.GOOGLE_API_KEY,

    // Via process.env (might not work in browser)
    ANTHROPIC_VIA_PROCESS: typeof process !== 'undefined' ? process.env?.ANTHROPIC_API_KEY : 'N/A',
    OPENAI_VIA_PROCESS: typeof process !== 'undefined' ? process.env?.OPENAI_API_KEY : 'N/A',
    GOOGLE_VIA_PROCESS: typeof process !== 'undefined' ? process.env?.GOOGLE_API_KEY : 'N/A',

    // Environment type
    NODE_ENV: import.meta.env.NODE_ENV,
    TAURI_PLATFORM: import.meta.env.TAURI_PLATFORM,
    TAURI_ARCH: import.meta.env.TAURI_ARCH,
    VITE_DEV_SERVER_URL: import.meta.env.VITE_DEV_SERVER_URL,
  };

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-black/90 text-white text-xs font-mono rounded-lg max-w-md max-h-96 overflow-auto z-50">
      <h3 className="text-sm font-bold mb-2 text-yellow-400">🔧 Environment Debug</h3>
      <div className="space-y-1">
        {Object.entries(envVars).map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="text-cyan-400 w-32 shrink-0">{key}:</span>
            <span className={value && value !== 'N/A' ? 'text-green-400' : 'text-red-400'}>
              {value ? (value.length > 20 ? `${value.substring(0, 20)}...` : value) : 'undefined'}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-600">
        <div className="text-yellow-400 text-xs">Vite envPrefix check:</div>
        <div className="text-xs">
          {Object.keys(import.meta.env)
            .filter(key => key.startsWith('ANTHROPIC_') || key.startsWith('OPENAI_') || key.startsWith('GOOGLE_'))
            .map(key => `${key}: ${import.meta.env[key] ? '✓' : '✗'}`)
            .join(', ')}
        </div>
      </div>
    </div>
  );
}
