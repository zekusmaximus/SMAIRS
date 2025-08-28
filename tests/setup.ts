import '@testing-library/jest-dom/vitest';
import { axe } from 'jest-axe';

// Extend expect with jest-axe matchers for Vitest
expect.extend({
  async toHaveNoViolations(received: any) {
    const results = await axe(received);
    const pass = results.violations.length === 0;

    return {
      pass,
      message: () => {
        if (pass) {
          return 'Expected element to have accessibility violations, but found none';
        }
        return `Found ${results.violations.length} accessibility violations:\n${JSON.stringify(results.violations, null, 2)}`;
      },
    };
  },
});

// Mock @tauri-apps/api for Node/Vitest environment (persistence best-effort fallback uses dynamic import)
// Provide minimal invoke stub that simply resolves; other exports can be added if needed later.
vi.mock('@tauri-apps/api', () => ({
	invoke: async () => undefined,
}));

