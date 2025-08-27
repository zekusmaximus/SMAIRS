// Type declarations for test environment

declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toHaveNoViolations(): T;
    }
  }
}

export {};