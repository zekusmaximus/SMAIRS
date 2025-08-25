import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer, elementScroll } from "@tanstack/react-virtual";

export interface VirtualListOptions<T> {
  items: T[];
  getKey: (item: T, index: number) => string | number;
  estimateSize?: (index: number) => number; // px
  overscan?: number;
  /**
   * If row heights are dynamic, provide a function to measure them.
   * When omitted, a constant estimate is used.
   */
  measureElement?: (el: Element | null) => number;
  /** Keyboard navigation: when true, ArrowUp/Down/PageUp/PageDown/Home/End navigate. */
  keyboardNav?: boolean;
}

export function useVirtualList<T>(opts: VirtualListOptions<T>) {
  const { items, /* getKey */ overscan = 10, keyboardNav = true } = opts;
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const estimateSize = useCallback(
    (index: number) => (opts.estimateSize ? opts.estimateSize(index) : 56),
    [opts]
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
    measureElement: opts.measureElement,
    scrollToFn: elementScroll,
  });

  // Refs to assign to dynamic rows for measurement
  const measureRefMap = useRef(new Map<number, (el: Element | null) => void>());
  const getMeasureRef = useCallback(
    (index: number) => (el: Element | null) => {
      if (!el) return;
      virtualizer.measureElement(el);
      // cache last used ref fn to avoid creating per-render
      measureRefMap.current.set(index, getMeasureRef(index));
    },
    [virtualizer]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!keyboardNav) return;
    const el = parentRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const max = items.length - 1;
      let next = activeIndex;
      switch (e.key) {
        case "ArrowDown":
          next = Math.min(max, activeIndex + 1);
          break;
        case "ArrowUp":
          next = Math.max(0, activeIndex - 1);
          break;
        case "PageDown":
          next = Math.min(max, activeIndex + Math.max(1, Math.floor(el.clientHeight / estimateSize(activeIndex))));
          break;
        case "PageUp":
          next = Math.max(0, activeIndex - Math.max(1, Math.floor(el.clientHeight / estimateSize(activeIndex))));
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = max;
          break;
        default:
          return;
      }
      if (next !== activeIndex) {
        e.preventDefault();
        setActiveIndex(next);
        virtualizer.scrollToIndex(next, { align: "auto" });
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [activeIndex, estimateSize, items.length, keyboardNav, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  const api = useMemo(
    () => ({
      parentRef,
      virtualizer,
      virtualItems,
      totalSize: virtualizer.getTotalSize(),
      activeIndex,
      setActiveIndex,
      getMeasureRef,
    }),
    [virtualItems, virtualizer, activeIndex, getMeasureRef]
  );

  return api;
}

export type UseVirtualListReturn<T> = ReturnType<typeof useVirtualList<T>>;
