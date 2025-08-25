import { useEffect, useMemo, useRef, useState } from "react";

export interface DebounceOptions {
  delay?: number; // ms
  maxWait?: number; // optional max delay cap like lodash.debounce
  leading?: boolean; // fire on the leading edge
  trailing?: boolean; // fire on the trailing edge (default true)
}

/**
 * useDebouncedValue returns a value that updates only after the given delay.
 * Useful for debounced search inputs.
 */
export function useDebouncedValue<T>(value: T, opts: DebounceOptions = {}): T {
  const { delay = 250 } = opts;
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * useDebouncedCallback creates a debounced function reference with lifecycle-safe timers.
 * Suitable for debounced saves or expensive operations.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  opts: DebounceOptions = {}
) {
  const { delay = 300, maxWait, leading = false, trailing = true } = opts;
  const fnRef = useRef(fn);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const pendingArgs = useRef<Args | null>(null);
  const hasLeadingCalled = useRef(false);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const flush = useMemo(
    () =>
      function flushInternal() {
        if (pendingArgs.current) {
          fnRef.current(...pendingArgs.current);
          pendingArgs.current = null;
        }
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        startRef.current = null;
        hasLeadingCalled.current = false;
      },
    []
  );

  function schedule() {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    const elapsed = startRef.current != null ? performance.now() - startRef.current : 0;
    let wait = delay;
    if (maxWait != null && startRef.current != null) {
      const remaining = Math.max(0, maxWait - elapsed);
      wait = Math.min(delay, remaining);
    }
    timerRef.current = window.setTimeout(() => {
      if (trailing) flush();
      else {
        // reset state even if not trailing
        pendingArgs.current = null;
        timerRef.current = null;
        startRef.current = null;
        hasLeadingCalled.current = false;
      }
    }, wait);
  }

  function debounced(...args: Args) {
    if (startRef.current == null) {
      startRef.current = performance.now();
      if (leading && !hasLeadingCalled.current) {
        hasLeadingCalled.current = true;
        fnRef.current(...args);
      } else {
        pendingArgs.current = args;
      }
    } else {
      pendingArgs.current = args; // replace trailing args
    }
    schedule();
  }

  type DebouncedWithControls = ((...a: Args) => void) & { flush: () => void; cancel: () => void };
  (debounced as unknown as DebouncedWithControls).flush = flush;
  (debounced as unknown as DebouncedWithControls).cancel = () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
    pendingArgs.current = null;
    hasLeadingCalled.current = false;
  };

  return debounced as unknown as DebouncedWithControls;
}

/**
 * Convenience: debounced async saver that resolves after the write happens.
 */
export function useDebouncedAsync<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  opts: DebounceOptions = {}
) {
  const pending = useRef<{ args: TArgs; resolve: (v: TResult) => void; reject: (e: unknown) => void } | null>(null);
  const call = useDebouncedCallback((...args: TArgs) => {
    const p = pending.current;
    pending.current = null;
    fn(...args)
      .then((v) => p?.resolve(v))
      .catch((e) => p?.reject(e));
  }, opts);

  return (...args: TArgs) =>
    new Promise<TResult>((resolve, reject) => {
      pending.current = { args, resolve, reject };
      call(...args);
    });
}
