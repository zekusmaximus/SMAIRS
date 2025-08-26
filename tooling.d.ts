// Ambient module declarations for packages without bundled types
// Optional Tauri API ambient for non-tauri Node contexts
declare module '@tauri-apps/api' {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

/// <reference types="node" />
/// <reference types="vite/client" />
// Centralized ambient type refs for tooling configs.

// Minimal types for @tanstack/react-virtual to satisfy typechecker when package ships untyped ESM types in this setup.
declare module '@tanstack/react-virtual' {
  export interface VirtualItem {
    key: React.Key;
    index: number;
    start: number;
    size: number;
    end: number;
    measureElement: (el: Element | null) => void;
  }
  export interface VirtualizerOptions {
    count: number;
    getScrollElement: () => Element | Window | null;
    estimateSize: (index: number) => number;
    overscan?: number;
    measureElement?: (el: Element | null) => number | void;
    scrollToFn?: (offset: number, defaultScrollTo: (offset: number) => void) => void;
  }
  export interface Virtualizer {
    getVirtualItems(): VirtualItem[];
    getTotalSize(): number;
    scrollToIndex: (index: number, opts?: { align?: 'auto' | 'start' | 'center' | 'end' }) => void;
    measureElement: (el: Element | null) => void;
  }
  export function useVirtualizer(opts: VirtualizerOptions): Virtualizer;
  export function elementScroll(offset: number, defaultScrollTo: (offset: number) => void): void;
}

// vite-plugin-pwa virtual module typing
declare module 'virtual:pwa-register' {
  export type RegisterSWOptions = {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  };
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
