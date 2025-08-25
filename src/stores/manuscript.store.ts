import { create } from "zustand";
import type { Manuscript, Scene as ManuscriptScene } from "@/features/manuscript/types";
import { importManuscript } from "@/features/manuscript/importer";
import { segmentScenes } from "@/features/manuscript/segmentation";
import { buildRevealGraph, type RevealGraphEntry } from "@/features/manuscript/reveal-graph";

type Selected = { selectedSceneId?: string };

export type ManuscriptStoreState = Selected & {
  manuscript?: Manuscript;
  scenes: ManuscriptScene[];
  reveals: RevealGraphEntry[];
  // actions
  loadManuscript: (path: string) => Promise<void>;
  selectScene: (id?: string) => void;
  getSceneById: (id: string) => ManuscriptScene | undefined;
  ensureSceneLoaded?: (id: string) => Promise<void>; // progressive loading: hydrate full text for a scene on demand
  clearAll?: () => void;
};

async function readText(path: string): Promise<string> {
  // Prefer Tauri runtime when available; fallback to Node in dev/test
  try {
    const mod = (await import("@tauri-apps/api")) as unknown as { fs?: { readTextFile?: (p: string) => Promise<string> } };
    if (mod.fs && typeof mod.fs.readTextFile === "function") return await mod.fs.readTextFile(path);
  } catch {
    // ignore and fallback
  }
  const { readFileSync } = await import("fs");
  return readFileSync(path, "utf8");
}

export const useManuscriptStore = create<ManuscriptStoreState>((set, get) => ({
  manuscript: undefined,
  scenes: [],
  reveals: [],
  selectedSceneId: undefined,
  async loadManuscript(path: string) {
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
    set({ manuscript: ms, scenes: lightScenes, reveals });
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
    set({ manuscript: undefined, scenes: [], reveals: [], selectedSceneId: undefined });
  },
}));

export type Scene = ManuscriptScene;
