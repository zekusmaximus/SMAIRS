// === BEGIN: runtime-wiring ===
export const RUNTIME: 'web' | 'tauri' =
  (typeof __RUNTIME__ !== 'undefined' ? (__RUNTIME__ as any) : 'web');
export const isTauri = RUNTIME === 'tauri';
// === END: runtime-wiring ===
