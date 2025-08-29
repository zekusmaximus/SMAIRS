import { create } from "zustand";
import type { Manuscript, Scene as ManuscriptScene } from "@/features/manuscript/types";
import { importManuscript } from "@/features/manuscript/importer";
import { segmentScenes } from "@/features/manuscript/segmentation";
import { buildRevealGraph, type RevealGraphEntry } from "@/features/manuscript/reveal-graph";
import { searchAPI } from "@/features/search/searchApi";

type Selected = { selectedSceneId?: string };

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

export type ManuscriptStoreState = Selected & {
  manuscript?: Manuscript;
  /** Normalized complete manuscript text (LF newlines). Mirrors manuscript.rawText when loaded. */
  fullText: string;
  scenes: ManuscriptScene[];
  reveals: RevealGraphEntry[];
  // loading states
  loadingState: LoadingState;
  loadingError: string | null;
  // actions
  loadManuscript: (path: string) => Promise<void>;
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
  // loading state actions
  setLoadingState: (state: LoadingState) => void;
  setLoadingError: (error: string | null) => void;
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
  loadingState: 'idle',
  loadingError: null,
  // backward compatibility
  get isLoading() { return get().loadingState === 'loading'; },
  async loadManuscript(path: string) {
    try {
      set({ loadingState: 'loading', loadingError: null });

      const raw = await readText(path);
      const ms = importManuscript(raw);
      const scenes = segmentScenes(ms);
      const { reveals } = buildRevealGraph(scenes);

      // Progressive loading: keep only small excerpts initially to reduce memory footprint.
      const EXCERPT_LEN = 400; // chars
      const lightScenes: ManuscriptScene[] = scenes.map((s) => ({
        ...s,
        text: s.text.length > EXCERPT_LEN ? (s.text.slice(0, EXCERPT_LEN) + "…") : s.text,
      }));

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
        void searchAPI.buildIndex(scenes);
      } catch (e) {
        console.warn("search index build failed", e);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load manuscript';
      set({
        loadingState: 'error',
        loadingError: errorMessage
      });
      throw error; // Re-throw so calling code can handle it
    }
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
    const { manuscript, scenes } = get();
    if (!manuscript) return;
    const idx = scenes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const s = scenes[idx]!; // definite
    const expectedLen = Math.max(0, s.endOffset - s.startOffset);
    // If already hydrated, skip
    if (s.text && (s.text.length >= expectedLen || !manuscript.rawText)) return;
    // Hydrate from manuscript rawText using offsets
    const fullText = manuscript.rawText.substring(s.startOffset, s.endOffset);
    if (!fullText || fullText === s.text) return;
    const next = scenes.slice();
    next[idx] = { ...s, text: fullText };
    set({ scenes: next });
  },
  clearAll() {
    set({
      manuscript: undefined,
      fullText: "",
      scenes: [],
      reveals: [],
      selectedSceneId: undefined,
      loadingState: 'idle',
      loadingError: null
    });
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
    const { scenes, manuscript, fullText } = get();
    const s = scenes.find((x) => x.id === sceneId);
    if (!s) return "";
    if (s.text && s.text.length >= Math.max(0, s.endOffset - s.startOffset)) return s.text;
    const src = manuscript?.rawText || fullText || "";
    if (!src || s.startOffset == null || s.endOffset == null) return s.text || "";
    return src.substring(s.startOffset, s.endOffset);
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
  // backward compatibility
  setLoading(loading: boolean) {
    set({ loadingState: loading ? 'loading' : 'idle' });
  },
}));

export type Scene = ManuscriptScene;
