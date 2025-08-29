import { create } from "zustand";
import type { Manuscript, Scene as ManuscriptScene } from "@/features/manuscript/types";
import { importManuscript } from "@/features/manuscript/importer";
import { segmentScenesAsync } from "@/features/manuscript/segmentation";
import { buildRevealGraph, type RevealGraphEntry } from "@/features/manuscript/reveal-graph";
import { searchAPI } from "@/features/search/searchApi";

// LRU Cache for scene text
class LRUCache<T> {
  private cache = new Map<string, T>();
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Memory pressure monitoring
class MemoryMonitor {
  private warningThreshold = 200 * 1024 * 1024; // 200MB
  private criticalThreshold = 400 * 1024 * 1024; // 400MB
  private listeners: ((level: 'normal' | 'warning' | 'critical') => void)[] = [];

  checkMemoryUsage(): 'normal' | 'warning' | 'critical' {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memInfo = (performance as any).memory;
      const used = memInfo.usedJSHeapSize;

      if (used > this.criticalThreshold) {
        this.notifyListeners('critical');
        return 'critical';
      } else if (used > this.warningThreshold) {
        this.notifyListeners('warning');
        return 'warning';
      }
    }
    return 'normal';
  }

  onMemoryPressure(callback: (level: 'normal' | 'warning' | 'critical') => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(level: 'normal' | 'warning' | 'critical'): void {
    this.listeners.forEach(listener => listener(level));
  }
}

type Selected = { selectedSceneId?: string };

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

export type OperationStage = 'parsing' | 'segmenting' | 'analyzing' | 'indexing';

export type ManuscriptStoreState = Selected & {
  manuscript?: Manuscript;
  /** Normalized complete manuscript text (LF newlines). Mirrors manuscript.rawText when loaded. */
  fullText: string;
  scenes: ManuscriptScene[];
  reveals: RevealGraphEntry[];
  // performance optimization
  sceneTextCache: LRUCache<string>; // Cache for full scene text
  memoryMonitor: MemoryMonitor;
  // loading states
  loadingState: LoadingState;
  loadingError: string | null;
  // progress tracking
  parseProgress: number; // 0-100 for percentage display
  operationStage: OperationStage | null;
  progressStartTime: number | null;
  progressMessage: string | null;
  // actions
  loadManuscript: (path: string) => Promise<void>;
  loadManuscriptSync: (path: string) => Promise<void>; // Legacy synchronous version
  openManuscriptDialog: () => Promise<string | null>;
  selectScene: (id?: string) => void;
  getSceneById: (id: string) => ManuscriptScene | undefined;
  ensureSceneLoaded?: (id: string) => Promise<void>; // progressive loading: hydrate full text for a scene on demand
  clearAll?: () => void;
  /** Replace entire manuscript text. Offsets may become stale until a re-segmentation occurs. */
  updateText: (text: string) => void;
  /** Return the text for a given sceneId, hydrating from fullText when needed. */
  getSceneText: (sceneId: string) => string;
  /** Return byte/char offset for a sceneId start, or -1 if unknown. */
  jumpToScene: (sceneId: string) => number;
  // performance actions
  preloadScenes: (sceneIds: string[]) => Promise<void>;
  clearSceneCache: () => void;
  getCacheStats: () => { size: number; maxSize: number };
  // loading state actions
  setLoadingState: (state: LoadingState) => void;
  setLoadingError: (error: string | null) => void;
  // progress tracking actions
  setProgress: (progress: number, stage?: OperationStage, message?: string) => void;
  startProgress: (stage: OperationStage, message?: string) => void;
  completeProgress: () => void;
  resetProgress: () => void;
  // backward compatibility
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
};

async function readText(path: string): Promise<string> {
  // Prefer Tauri runtime when available; fallback to Node in dev/test
  try {
    const mod = (await import("@tauri-apps/api")) as unknown as { fs?: { readTextFile?: (p: string) => Promise<string> }; invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    // Try invoke-based command first (works without FS capability)
    if (typeof mod.invoke === "function") {
      try {
        const res = await mod.invoke("load_manuscript_text", { path });
        if (typeof res === "string") return res;
      } catch {
        // fall through to fs/readFile
      }
    }
    if (mod.fs && typeof mod.fs.readTextFile === "function") {
      try { return await mod.fs.readTextFile(path); } catch { /* ignore */ }
    }
  } catch {
    // ignore and fallback
  }
  // Node fallback (tests / Node CLIs)
  const { readFileSync } = await import("fs");
  return readFileSync(path, "utf8");
}

export const useManuscriptStore = create<ManuscriptStoreState>((set, get) => ({
  manuscript: undefined,
  fullText: "",
  scenes: [],
  reveals: [],
  selectedSceneId: undefined,
  // performance optimization
  sceneTextCache: new LRUCache<string>(100), // Cache up to 100 scene texts
  memoryMonitor: new MemoryMonitor(),
  loadingState: 'idle',
  loadingError: null,
  // progress tracking
  parseProgress: 0,
  operationStage: null,
  progressStartTime: null,
  progressMessage: null,
  // backward compatibility
  get isLoading() { return get().loadingState === 'loading'; },
  async loadManuscript(path: string) {
    try {
      set({ loadingState: 'loading', loadingError: null });
      get().resetProgress();

      // Start progress tracking
      get().startProgress('parsing', 'Reading manuscript file...');

      const raw = await readText(path);
      get().setProgress(25, 'parsing', 'Parsing manuscript content...');

      const ms = importManuscript(raw);
      get().setProgress(50, 'segmenting', 'Segmenting scenes...');

      const scenes = await segmentScenesAsync(ms, (progress, message) => {
        // Convert segmentation progress (0-95) to manuscript loading progress (50-75)
        const adjustedProgress = 50 + (progress * 0.25);
        get().setProgress(adjustedProgress, 'segmenting', message || 'Segmenting scenes...');
      });
      get().setProgress(75, 'analyzing', 'Building reveal graph...');

      const { reveals } = buildRevealGraph(scenes);

      // Progressive loading: keep only small excerpts initially to reduce memory footprint.
      const EXCERPT_LEN = 400; // chars
      const lightScenes: ManuscriptScene[] = scenes.map((s) => ({
        ...s,
        text: s.text.length > EXCERPT_LEN ? (s.text.slice(0, EXCERPT_LEN) + "…") : s.text,
      }));

      get().setProgress(90, 'indexing', 'Preparing manuscript data...');

      set({
        manuscript: ms,
        fullText: ms.rawText,
        scenes: lightScenes,
        reveals,
        loadingState: 'loaded',
        loadingError: null
      });

      // Build search index asynchronously (best effort)
      try {
        get().setProgress(95, 'indexing', 'Building search index...');
        void searchAPI.buildIndex(scenes);
        get().completeProgress();
      } catch (e) {
        console.warn("search index build failed", e);
        get().completeProgress();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load manuscript';
      set({
        loadingState: 'error',
        loadingError: errorMessage
      });
      get().resetProgress();
      throw error; // Re-throw so calling code can handle it
    }
  },

  // Legacy synchronous version for backward compatibility
  async loadManuscriptSync(path: string) {
    return this.loadManuscript(path);
  },
  async openManuscriptDialog() {
    try {
      const mod = (await import("@tauri-apps/api")) as unknown as {
        dialog?: {
          open?: (options?: {
            multiple?: boolean;
            directory?: boolean;
            filters?: Array<{ name: string; extensions: string[] }>;
          }) => Promise<string | string[] | null>;
        };
      };

      if (!mod.dialog?.open) {
        throw new Error("Tauri dialog API not available");
      }

      const result = await mod.dialog.open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Manuscript Files",
            extensions: ["txt", "md", "manuscript"]
          },
          {
            name: "Text Files",
            extensions: ["txt"]
          },
          {
            name: "Markdown Files",
            extensions: ["md"]
          },
          {
            name: "All Files",
            extensions: ["*"]
          }
        ]
      });

      if (typeof result === 'string') {
        return result;
      }

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to open file dialog';
      set({ loadingState: 'error', loadingError: errorMessage });
      throw error;
    }
  },
  selectScene(id) {
    set({ selectedSceneId: id });
  },
  getSceneById(id: string) {
    const { scenes } = get();
    return scenes.find((s) => s.id === id);
  },
  async ensureSceneLoaded(id: string) {
    const { manuscript, scenes, sceneTextCache } = get();
    if (!manuscript) return;

    // Check cache first
    const cachedText = sceneTextCache.get(id);
    if (cachedText) return;

    const idx = scenes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const s = scenes[idx]!; // definite
    const expectedLen = Math.max(0, s.endOffset - s.startOffset);

    // If already hydrated, skip
    if (s.text && (s.text.length >= expectedLen || !manuscript.rawText)) return;

    // Hydrate from manuscript rawText using offsets
    const fullText = manuscript.rawText.substring(s.startOffset, s.endOffset);
    if (!fullText || fullText === s.text) return;

    // Cache the full text
    sceneTextCache.set(id, fullText);

    const next = scenes.slice();
    next[idx] = { ...s, text: fullText };
    set({ scenes: next });
  },
  clearAll() {
    const { sceneTextCache } = get();
    sceneTextCache.clear();

    set({
      manuscript: undefined,
      fullText: "",
      scenes: [],
      reveals: [],
      selectedSceneId: undefined,
      loadingState: 'idle',
      loadingError: null
    });
    get().resetProgress();
  },
  updateText(text: string) {
    const { manuscript } = get();
    if (manuscript) {
      const nextMs: Manuscript = { ...manuscript, rawText: text };
      set({ manuscript: nextMs, fullText: text });
    } else {
      set({ fullText: text });
    }
    // Note: scene offsets are not recomputed here; a background re-segmentation pass should update scenes.
  },
  getSceneText(sceneId: string) {
    const { scenes, manuscript, fullText, sceneTextCache } = get();
    const s = scenes.find((x) => x.id === sceneId);
    if (!s) return "";

    // Check cache first
    const cachedText = sceneTextCache.get(sceneId);
    if (cachedText) return cachedText;

    // If scene text is not truncated, return it directly
    if (s.text && !s.text.endsWith('…')) return s.text;

    // Extract from source text
    const src = manuscript?.rawText || fullText || "";
    if (!src || s.startOffset == null || s.endOffset == null) return s.text || "";
    const sceneFullText = src.substring(s.startOffset, s.endOffset);

    // Cache the full text for future use
    sceneTextCache.set(sceneId, sceneFullText);
    return sceneFullText;
  },
  jumpToScene(sceneId: string) {
    const { scenes } = get();
    const s = scenes.find((x) => x.id === sceneId);
    return s ? s.startOffset : -1;
  },
  setLoadingState(state: LoadingState) {
    set({ loadingState: state });
  },
  setLoadingError(error: string | null) {
    set({ loadingError: error });
  },
  // progress tracking methods
  setProgress(progress: number, stage?: OperationStage, message?: string) {
    set({
      parseProgress: Math.max(0, Math.min(100, progress)),
      ...(stage && { operationStage: stage }),
      ...(message && { progressMessage: message })
    });
  },
  startProgress(stage: OperationStage, message?: string) {
    set({
      operationStage: stage,
      progressStartTime: Date.now(),
      progressMessage: message || null,
      parseProgress: 0
    });
  },
  completeProgress() {
    set({
      parseProgress: 100,
      operationStage: null,
      progressStartTime: null,
      progressMessage: null
    });
  },
  resetProgress() {
    set({
      parseProgress: 0,
      operationStage: null,
      progressStartTime: null,
      progressMessage: null
    });
  },
  // performance methods
  async preloadScenes(sceneIds: string[]) {
    const { manuscript, scenes, sceneTextCache, memoryMonitor } = get();
    if (!manuscript) return;

    // Check memory pressure before preloading
    const memoryLevel = memoryMonitor.checkMemoryUsage();
    if (memoryLevel === 'critical') {
      console.warn('Memory pressure too high, skipping preload');
      return;
    }

    // Clear cache if memory pressure is high
    if (memoryLevel === 'warning' && sceneTextCache.size() > 25) {
      sceneTextCache.clear();
    }

    for (const sceneId of sceneIds) {
      const scene = scenes.find(s => s.id === sceneId);
      if (scene && !sceneTextCache.get(sceneId)) {
        // Only cache if scene text is truncated (has ellipsis)
        if (scene.text.endsWith('…')) {
          const fullText = manuscript.rawText.substring(scene.startOffset, scene.endOffset);
          sceneTextCache.set(sceneId, fullText);
        }
      }
    }
  },

  clearSceneCache() {
    get().sceneTextCache.clear();
  },

  getCacheStats() {
    const cache = get().sceneTextCache;
    return {
      size: cache.size(),
      maxSize: 100 // Default max size
    };
  },

  // backward compatibility
  setLoading(loading: boolean) {
    set({ loadingState: loading ? 'loading' : 'idle' });
  },
}));

export type Scene = ManuscriptScene;
