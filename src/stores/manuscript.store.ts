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
    set({ manuscript: ms, scenes, reveals });
  },
  selectScene(id) {
    set({ selectedSceneId: id });
  },
  getSceneById(id: string) {
    const { scenes } = get();
    return scenes.find((s) => s.id === id);
  },
  clearAll() {
    set({ manuscript: undefined, scenes: [], reveals: [], selectedSceneId: undefined });
  },
}));

export type Scene = ManuscriptScene;
