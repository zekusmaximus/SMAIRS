// Vitest mock for @tauri-apps/api used in persistence layer optional dynamic import.
export async function invoke() {
  // Simulate absence of real Tauri runtime so persistence falls back to sql.js
  throw new Error('tauri runtime not available in tests');
}
