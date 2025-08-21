import '@testing-library/jest-dom/vitest';

// Mock @tauri-apps/api for Node/Vitest environment (persistence best-effort fallback uses dynamic import)
// Provide minimal invoke stub that simply resolves; other exports can be added if needed later.
vi.mock('@tauri-apps/api', () => ({
	invoke: async () => undefined,
}));

