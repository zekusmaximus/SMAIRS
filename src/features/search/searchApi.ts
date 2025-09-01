import type { Scene } from "@/features/manuscript/types";

// Lazy-load Tauri invoke without using eval/new Function (compatible with Tauri CSP)
async function getTauriInvoke(): Promise<<T = unknown>(cmd: string, args?: unknown) => Promise<T>> {
  // First, try the official API import
  try {
    const mod = (await import("@tauri-apps/api/core")) as {
      invoke?: <T = unknown>(cmd: string, args?: unknown) => Promise<T>;
    };
    if (typeof mod?.invoke === "function") {
      // console.debug("[search] using @tauri-apps/api/core.invoke");
      return mod.invoke;
    }
  } catch {
    // ignore and try global fallbacks below
  }

  // Then, try global fallbacks present in the Tauri runtime
  const g = globalThis as unknown as { [k: string]: unknown };
  const maybeInvoke =
    // v2 internal shape
    (g as { __TAURI__?: { core?: { invoke?: unknown }; invoke?: unknown } })?.__TAURI__?.core?.invoke ||
    // legacy aliases sometimes present
    (g as { __TAURI__?: { core?: { invoke?: unknown }; invoke?: unknown } })?.__TAURI__?.invoke ||
    (g as { __TAURI_INVOKE__?: unknown })?.__TAURI_INVOKE__;
  if (typeof maybeInvoke === "function") {
    // console.debug("[search] using global __TAURI__ invoke");
    return maybeInvoke as <T = unknown>(cmd: string, args?: unknown) => Promise<T>;
  }

  // Briefly wait for the Tauri runtime to attach (race at startup)
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const g2 = globalThis as unknown as { [k: string]: unknown };
    const retry =
      (g2 as { __TAURI__?: { core?: { invoke?: unknown }; invoke?: unknown } })?.__TAURI__?.core?.invoke ||
      (g2 as { __TAURI__?: { core?: { invoke?: unknown }; invoke?: unknown } })?.__TAURI__?.invoke ||
      (g2 as { __TAURI_INVOKE__?: unknown })?.__TAURI_INVOKE__;
    if (typeof retry === "function") {
      return retry as <T = unknown>(cmd: string, args?: unknown) => Promise<T>;
    }
  }

  // Finally, signal unavailability
  return async () => {
    throw new Error("tauri runtime not available");
  };
}

// Simple check for Tauri availability
// (runtime env detection not needed; we'll attempt Tauri invoke and fallback on error)

export type SearchOptions = { limit?: number };
export type SearchResult = { sceneId: string; offset: number; snippet: string; score: number; highlights: Array<[number, number]> };
export type CharacterMention = SearchResult & { character: string };

export class SearchAPI {
  private cache = new Map<string, SearchResult[]>();
  private recent: Array<{ q: string; at: number }> = [];
  private fallbackScenes: Scene[] = [];
  private indexReady = false;

  async buildIndex(scenes: Scene[]): Promise<void> {
    try {
  // Align with Rust's camelCase names expected by serde (rename_all = "camelCase")
  const payload = scenes.map(s => ({ id: s.id, chapterId: s.chapterId, text: s.text, startOffset: s.startOffset }));
      const invoke = await getTauriInvoke();
  await invoke("build_search_index", { scenes: payload });
  this.indexReady = true;
  this.fallbackScenes = [];
    } catch (e) {
      console.warn("Search index building using fallback:", (e as Error)?.message || e);
      // Store scenes for fallback search
      this.fallbackScenes = scenes;
  this.indexReady = false;
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const key = `${query}::${options?.limit ?? 50}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    try {
      const invoke = await getTauriInvoke();
      // If we previously fell back, try to build the index now that Tauri may be ready
      if (!this.indexReady && this.fallbackScenes.length > 0) {
        const payload = this.fallbackScenes.map(s => ({ id: s.id, chapterId: s.chapterId, text: s.text, startOffset: s.startOffset }));
        await invoke("build_search_index", { scenes: payload });
        this.indexReady = true;
        this.fallbackScenes = [];
      }
      const res = await invoke<SearchResult[]>("search_manuscript", { query, limit: options?.limit });
      this.cache.set(key, res);
      this.recent.unshift({ q: query, at: Date.now() });
      if (this.recent.length > 20) this.recent.pop();
      return res;
    } catch (e) {
      console.warn("Search using fallback:", (e as Error)?.message || e);
      return this.fallbackSearch(query, options?.limit ?? 50);
    }
  }

  private fallbackSearch(query: string, limit: number): SearchResult[] {
    // Simple text search fallback for development
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const scene of this.fallbackScenes) {
      const lowerText = scene.text.toLowerCase();
      let index = lowerText.indexOf(lowerQuery);
      let searchOffset = 0;

      while (index !== -1 && results.length < limit) {
        const start = Math.max(0, index - 50);
        const end = Math.min(scene.text.length, index + query.length + 50);
        const snippet = scene.text.slice(start, end);

        results.push({
          sceneId: scene.id,
          offset: scene.startOffset + index,
          snippet,
          score: 1.0, // Basic scoring
          highlights: [[index - start, index - start + query.length]]
        });

        searchOffset = index + 1;
        index = lowerText.indexOf(lowerQuery, searchOffset);
      }
    }

    return results.slice(0, limit);
  }

  async findCharacter(name: string): Promise<CharacterMention[]> {
    try {
      const invoke = await getTauriInvoke();
      if (!this.indexReady && this.fallbackScenes.length > 0) {
        const payload = this.fallbackScenes.map(s => ({ id: s.id, chapterId: s.chapterId, text: s.text, startOffset: s.startOffset }));
        await invoke("build_search_index", { scenes: payload });
        this.indexReady = true;
        this.fallbackScenes = [];
      }
      const res = await invoke<SearchResult[]>("find_character_occurrences", { character: name });
      return res.map((r) => ({ ...r, character: name }));
    } catch (e) {
      console.warn("Character search using fallback:", (e as Error)?.message || e);
      const searchResults = this.fallbackSearch(name, 50);
      return searchResults.map((r) => ({ ...r, character: name }));
    }
  }
}

export const searchAPI = new SearchAPI();
