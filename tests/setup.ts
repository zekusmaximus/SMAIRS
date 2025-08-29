import '@testing-library/jest-dom/vitest';
import { configureAxe } from 'jest-axe';
import { beforeAll, beforeEach } from 'vitest';
import {
  setTimeout as nodeSetTimeout,
  clearTimeout as nodeClearTimeout,
  setInterval as nodeSetInterval,
  clearInterval as nodeClearInterval,
} from 'node:timers';

// Create a configured axe instance to reduce false positives in unit tests
const axe = configureAxe({
  rules: [
    // Landmark semantics are often omitted in isolated component tests
    { id: 'region', enabled: false },
  ],
});

// Extend expect with jest-axe matchers for Vitest
expect.extend({
  async toHaveNoViolations(received: unknown) {
    // Accept either a container element or a full render result; normalize to HTMLElement
    type MaybeContainer = { container?: Element } | Element | null | undefined;
    const candidate = received as MaybeContainer;
    const element: Element | undefined = (candidate && candidate instanceof Element)
      ? candidate
      : (candidate && typeof candidate === 'object' && 'container' in candidate)
        ? candidate.container
        : undefined;
    // Support either an axe results object or an element to scan
    const maybeResults = received as { violations?: unknown[] } | undefined;
    const hasResults = !!maybeResults && Array.isArray(maybeResults.violations);
    const results = hasResults
      ? (maybeResults as { violations: unknown[] })
      : await axe((element ?? document.body));
    const pass = ((results as { violations: unknown[] }).violations?.length ?? 0) === 0;

    return {
      pass,
      message: () => {
        if (pass) {
          return 'Expected element to have accessibility violations, but found none';
        }
  const violations = (results as { violations: unknown[] }).violations ?? [];
  return `Found ${violations.length} accessibility violations:\n${JSON.stringify(violations, null, 2)}`;
      },
    };
  },
});

// Mock @tauri-apps/api for Node/Vitest environment (persistence best-effort fallback uses dynamic import)
// Provide minimal invoke stub that simply resolves; other exports can be added if needed later.
vi.mock('@tauri-apps/api', () => ({
  invoke: async () => undefined,
}));

// Also mock the explicit core entry used by dynamic imports in UI hooks/components
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async () => undefined,
}));

// Provide a jsdom-friendly clipboard polyfill to avoid navigator.clipboard crashes
try {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
    configurable: true,
    writable: true,
  });
} catch {
  // no-op
}

// Ensure timers exist in the worker context
const ensureTimers = () => {
  try {
    // Prefer Node timers to avoid jsdom/worker quirks
    const g = globalThis as unknown as {
      setTimeout?: typeof setTimeout;
      clearTimeout?: typeof clearTimeout;
      setInterval?: typeof setInterval;
      clearInterval?: typeof clearInterval;
      requestAnimationFrame?: (cb: (t: number) => void) => number;
      cancelAnimationFrame?: (handle: number) => void;
      self?: unknown;
      // Optional references present in JSDOM
      window?: unknown;
      global?: unknown;
    };

  // Only install Node timers if missing; avoid clobbering fake timers
  if (typeof g.setTimeout !== 'function') g.setTimeout = nodeSetTimeout as unknown as typeof setTimeout;
  if (typeof g.clearTimeout !== 'function') g.clearTimeout = nodeClearTimeout as unknown as typeof clearTimeout;
  if (typeof g.setInterval !== 'function') g.setInterval = nodeSetInterval as unknown as typeof setInterval;
  if (typeof g.clearInterval !== 'function') g.clearInterval = nodeClearInterval as unknown as typeof clearInterval;

  if (typeof (g as { self?: unknown }).self === 'undefined') (g as { self?: unknown }).self = g;
  if (typeof (g as { global?: unknown }).global === 'undefined') (g as { global?: unknown }).global = g;
  if (typeof (g as { window?: unknown }).window === 'undefined') (g as { window?: unknown }).window = g;

    if (typeof g.requestAnimationFrame !== 'function') {
      g.requestAnimationFrame = (cb: (t: number) => void) => (g.setTimeout!(
        () => cb(performance.now()),
        16
      ) as unknown as number);
    }
    if (typeof g.cancelAnimationFrame !== 'function') {
      g.cancelAnimationFrame = (handle: number) => g.clearTimeout!(handle as unknown as NodeJS.Timeout);
    }
  } catch {
    // no-op
  }
};

// Run once on import
ensureTimers();

// And before tests in case any test tampered with globals
beforeAll(() => ensureTimers());
beforeEach(() => ensureTimers());

