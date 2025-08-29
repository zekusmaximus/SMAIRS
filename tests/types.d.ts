// Type declarations for test environment

declare global {
  namespace Vi {
  interface JestAssertion<T = unknown> {
      toHaveNoViolations(): T;
    }
  }
}

export {};
