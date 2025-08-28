// Vitest mock for @tauri-apps/api/core used in UI components
export async function invoke() {
  // Simulate absence of real Tauri runtime so UI falls back gracefully
  throw new Error('tauri runtime not available in tests');
}
