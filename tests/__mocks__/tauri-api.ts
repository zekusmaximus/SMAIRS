// Vitest mock for @tauri-apps/api used in persistence layer optional dynamic import.
export async function invoke() {
  // Simulate absence of real Tauri runtime so persistence/UI code can fallback
  throw new Error('tauri runtime not available in tests');
}

// Also provide a default export shape some code may expect
export default { invoke };

// Mock the core module API as well
export const core = {
  invoke: async () => {
    throw new Error('tauri runtime not available in tests');
  }
};
