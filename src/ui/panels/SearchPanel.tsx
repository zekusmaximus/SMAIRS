import React, { useMemo, useState } from "react";
import { searchAPI } from "@/features/search/searchApi";
import { useManuscriptStore } from "@/stores/manuscript.store";

type Filters = { chapterId?: string; sceneId?: string; character?: string };

function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");
  return (
    <div className="search-input" style={{ display: "flex", gap: 8 }}>
  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={'Search (use "phrases", wildcards *, fuzzy)'} style={{ flex: 1 }} />
      <button onClick={() => onSearch(q)}>Search</button>
    </div>
  );
}

function SearchFilters({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { scenes } = useManuscriptStore();
  const chapters = useMemo(() => Array.from(new Set(scenes.map((s) => s.chapterId))), [scenes]);
  return (
    <div className="search-filters" style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <select value={filters.chapterId ?? ""} onChange={(e) => setFilters({ ...filters, chapterId: e.target.value || undefined })}>
        <option value="">All chapters</option>
        {chapters.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <input value={filters.character ?? ""} onChange={(e) => setFilters({ ...filters, character: e.target.value || undefined })} placeholder="Character name" />
    </div>
  );
}

function SearchResults({ results, onOpen }: { results: Awaited<ReturnType<typeof searchAPI.search>>; onOpen: (sceneId: string, offset: number, hl?: [number, number]) => void }) {
  return (
    <div className="search-results" style={{ marginTop: 12, display: "grid", gap: 8 }}>
      {results.map((r, i) => (
        <div key={i} className="result" style={{ border: "1px solid #444", padding: 8, borderRadius: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{r.sceneId} • {r.score.toFixed(2)}</div>
          <div style={{ marginTop: 4 }} dangerouslySetInnerHTML={{ __html: highlightSnippet(r.snippet, r.highlights) }} />
          <div style={{ marginTop: 6 }}>
            <button onClick={() => onOpen(r.sceneId, r.offset, r.highlights?.[0])}>Open</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchStats({ count }: { count: number }) { return <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{count} results</div>; }

function highlightSnippet(snippet: string, hl: Array<[number, number]>) {
  if (!hl?.length) return escapeHtml(snippet);
  const [s, e] = hl[0] as [number, number];
  const pre = escapeHtml(snippet.slice(0, s));
  const mid = escapeHtml(snippet.slice(s, e));
  const post = escapeHtml(snippet.slice(e));
  return `${pre}<mark>${mid}</mark>${post}`;
}

function escapeHtml(s: string) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string)); }

export function SearchPanel() {
  const { scenes, jumpToScene } = useManuscriptStore();
  const [filters, setFilters] = useState<Filters>({});
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchAPI.search>>>([]);

  async function runSearch(q: string) {
    if (!q && !filters.character) { setResults([]); return; }
    if (filters.character && !q) {
      const res = await searchAPI.findCharacter(filters.character);
      setResults(res);
      return;
    }
    const res = await searchAPI.search(q, { limit: 100 });
    const filtered = res.filter((r) => !filters.chapterId || scenes.find((s) => s.id === r.sceneId)?.chapterId === filters.chapterId);
    setResults(filtered);
  }

  function onOpen(sceneId: string, absOffset: number, hl?: [number, number]) {
    jumpToScene(sceneId);
  const api = window.manuscriptEditor;
    if (!api) return;
    if (hl) {
      const len = Math.max(0, hl[1] - hl[0]);
      api.setHighlights([{ from: absOffset, to: absOffset + len }]);
  } else { api.clearHighlights(); }
    api.scrollTo(absOffset);
  }

  return (
    <div className="search-panel" style={{ padding: 12 }}>
      <SearchInput onSearch={runSearch} />
      <SearchFilters filters={filters} setFilters={setFilters} />
  <SearchResults results={results} onOpen={onOpen} />
      <SearchStats count={results.length} />
    </div>
  );
}

export default SearchPanel;
