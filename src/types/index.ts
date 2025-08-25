// Auto-generated types live in generated.ts. This file re-exports them and adds UI-specific helpers.
// Note: generated.ts is produced by `npm run generate:types`.

// Re-export generated bindings. A placeholder generated.ts exists and will be overwritten.
export * from "./generated";

// Frontend-only extensions can go here. Keep them serializable.
export type WithUIFlags<T> = T & { selected?: boolean };
