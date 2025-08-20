// Ambient module declarations for packages without bundled types
// Optional Tauri API ambient for non-tauri Node contexts
declare module '@tauri-apps/api' {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

/// <reference types="node" />
/// <reference types="vite/client" />
// Centralized ambient type refs for tooling configs.
