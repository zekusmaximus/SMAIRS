// Use computed dynamic import to avoid transform-time resolution in Vitest/JSDOM
async function getTauriInvoke(): Promise<(<T = unknown>(cmd: string, args?: unknown) => Promise<T>)> {
  try {
    const spec = ["@tauri-apps/api", "core"].join("/");
    const dynamicImport = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
    const mod = (await dynamicImport(spec)) as { invoke: <T = unknown>(cmd: string, args?: unknown) => Promise<T> };
    return mod.invoke;
  } catch {
    return async () => {
      throw new Error("tauri runtime not available");
    };
  }
}

// Simple check for Tauri availability
function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const tauriWindow = window as Window & { __TAURI__?: unknown };
  return !!tauriWindow.__TAURI__;
}
import type { Scene } from "@/features/manuscript/types";

export type SearchOptions = { limit?: number };
export type SearchResult = { sceneId: string; offset: number; snippet: string; score: number; highlights: Array<[number, number]> };
export type CharacterMention = SearchResult & { character: string };

export class SearchAPI {
  private cache = new Map<string, SearchResult[]>();
  private recent: Array<{ q: string; at: number }> = [];

  async buildIndex(scenes: Scene[]): Promise<void> {
    // Check Tauri availability at runtime
    if (!isTauriEnvironment()) {
      console.warn("Search index building skipped: Tauri runtime not available");
      return;
    }

    try {
      const payload = scenes.map(s => ({ id: s.id, chapterId: s.chapterId, text: s.text, startOffset: s.startOffset }));
      // Align with Rust's camelCase names expected by serde
      const wire = payload.map(s => ({ id: s.id, chapter_id: s.chapterId, text: s.text, start_offset: s.startOffset }));
      const invoke = await getTauriInvoke();
      await invoke("build_search_index", { scenes: wire });
    } catch (e) {
      console.warn("buildIndex failed", e);
      // Don't throw, just log - this allows the app to continue working
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // Check Tauri availability at runtime
    if (!isTauriEnvironment()) {
      console.warn("Search skipped: Tauri runtime not available");
      return [];
    }

    const key = `${query}::${options?.limit ?? 50}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    try {
      const invoke = await getTauriInvoke();
      const res = await invoke<SearchResult[]>("search_manuscript", { query, limit: options?.limit });
      this.cache.set(key, res);
      this.recent.unshift({ q: query, at: Date.now() });
      if (this.recent.length > 20) this.recent.pop();
      return res;
    } catch (e) {
      console.warn("search failed", e);
      return [];
    }
  }

  async findCharacter(name: string): Promise<CharacterMention[]> {
    // Check Tauri availability at runtime
    if (!isTauriEnvironment()) {
      console.warn("Character search skipped: Tauri runtime not available");
      return [];
    }

    try {
      const invoke = await getTauriInvoke();
      const res = await invoke<SearchResult[]>("find_character_occurrences", { character: name });
      return res.map((r) => ({ ...r, character: name }));
    } catch (e) {
      console.warn("findCharacter failed", e);
      return [];
    }
  }
}

export const searchAPI = new SearchAPI();
