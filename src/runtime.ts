// === BEGIN: runtime-wiring ===
// Prefer a runtime flag attached to globalThis to avoid depending on ambient typings
const __runtimeMaybe = (globalThis as unknown as { __RUNTIME__?: 'web' | 'tauri' }).__RUNTIME__;
export const RUNTIME: 'web' | 'tauri' = typeof __runtimeMaybe !== 'undefined' ? __runtimeMaybe : 'web';
export const isTauri = RUNTIME === 'tauri';
// === END: runtime-wiring ===
