import React, { useEffect, useMemo, useRef, useState } from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useManuscriptStore } from "@/stores/manuscript.store";
import FilterChips from "@/ui/components/FilterChips";
import HeatStrip from "@/ui/components/HeatStrip";
import SceneRow, { type SceneRowData } from "@/ui/components/SceneRow";
import RevealMiniList, { type RevealItem } from "@/ui/components/RevealMiniList";
import { useVirtualList } from "@/hooks/useVirtualList";
import { analyzeScenes } from "@/features/manuscript/analyzer";
import { generateCandidates } from "@/features/manuscript/opening-candidates";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { trackFrame } from "@/lib/metrics";
import { createWorker, makeTextAnalysisWorker, makeSearchIndexWorker } from "@/lib/workers";

// Filters
export type SceneFilter = "High Hook" | "Has Reveals" | "Potential Openers";

export default function SceneNavigator() {
  const { scenes, reveals, selectedSceneId, selectScene, preloadScenes } = useManuscriptStore();

  // Hook scores via worker (fallback to local)
  const [hookScores, setHookScores] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!scenes.length) { setHookScores(new Map()); return; }
    const wk = createWorker(makeTextAnalysisWorker);
    const payload = {
      type: "analyze" as const,
      scenes: scenes.map((s) => ({ id: s.id, text: s.text.slice(0, 800), wordCount: s.wordCount })), // cap text head for speed
    };
    let cancelled = false;
    // Post to worker with a soft timeout; fallback to local compute
    const timer = setTimeout(() => {
      if (cancelled) return;
      const local = analyzeScenes(scenes);
      setHookScores(local.hookScores);
    }, 250);
    wk.post(payload).then((resp) => {
      const r = resp as { type: "result"; hookScores: [string, number][] };
      if (cancelled) return;
      clearTimeout(timer);
      setHookScores(new Map(r.hookScores));
    }).finally(() => wk.terminate());
    return () => { cancelled = true; clearTimeout(timer); };
  }, [scenes]);

  // Potential openers set for filtering label
  const openerIds = useMemo(() => new Set(generateCandidates(scenes).flatMap((c) => c.scenes)), [scenes]);

  const [filters, setFilters] = useState<SceneFilter[]>([]);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, { delay: 150 });
  const searchRef = useRef<HTMLInputElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [heatWidth, setHeatWidth] = useState(280);
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);

  // Keyboard shortcut: '/' focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "/" || e.key === "?") && !(e.target as HTMLElement)?.closest("input,textarea")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Search index worker: build index on scenes change, query on debounced input
  useEffect(() => {
    if (!scenes.length) { setSearchIds(null); return; }
    const wk = createWorker(makeSearchIndexWorker);
    const docs = scenes.map((s) => ({ id: s.id, text: `${s.id} ${s.chapterId} ${s.text.slice(0, 2000)}` }));
    let cancelled = false;
    type BuildMsg = { type: "build"; docs: { id: string; text: string }[] };
    type QueryMsg = { type: "query"; q: string };
    type QueryResp = { type: "result"; ids: string[] } | { type: "built"; size: number };
    wk.post({ type: "build", docs } as BuildMsg).then(() => {
      if (cancelled) return;
      const q = debouncedQuery.trim();
      if (!q) { setSearchIds(null); return; }
      return wk.post({ type: "query", q } as QueryMsg).then((resp) => {
        if (cancelled) return;
        const r = resp as QueryResp;
        const idsArr = (r as { type: "result"; ids: string[] }).type === "result"
          ? (r as { type: "result"; ids: string[] }).ids
          : [];
        const ids = new Set<string>(idsArr);
        setSearchIds(ids);
      });
    }).finally(() => wk.terminate());
    return () => { cancelled = true; };
  }, [scenes, debouncedQuery]);

  // Resize observer for heat strip width
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeatWidth(Math.max(120, el.clientWidth - 16));
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      // jsdom/test fallback
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
  }, []);

  // Build view model rows
  const rows: SceneRowData[] = useMemo(() => {
    return scenes.map((s, idx) => {
      const hs = hookScores.get(s.id) || 0;
      return {
        id: s.id,
        name: `${s.chapterId}:${String(idx + 1).padStart(2, "0")}`,
        hookScore: hs,
        // Approximate proxies for additional bars (reuse opening-candidate helpers cheaply)
        actionDensity: 0, // optional: calculate lazily if needed
        mysteryQuotient: 0,
        violations: [],
        characters: [],
        excerpt: s.text.slice(0, 160).replace(/\s+/g, " ") + (s.text.length > 160 ? "…" : ""),
      } satisfies SceneRowData;
    });
  }, [hookScores, scenes]);

  // Reveal mapping for "Has Reveals" filter and mini-list
  const revealsByScene = useMemo(() => {
    const map = new Map<string, string[]>(); // sceneId -> revealIds
    for (const r of reveals) {
      const arr = map.get(r.firstExposureSceneId) || [];
      arr.push(r.id);
      map.set(r.firstExposureSceneId, arr);
    }
    return map;
  }, [reveals]);

  // Filtering
  const filteredIndex = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => {
        if (filters.includes("High Hook") && (r.hookScore || 0) < 0.6) return false;
        if (filters.includes("Has Reveals") && (revealsByScene.get(r.id)?.length || 0) === 0) return false;
        if (filters.includes("Potential Openers") && !openerIds.has(r.id)) return false;
    if (!q) return true;
    // Prefer worker-backed ids when available; fallback to simple includes
    if (searchIds) return searchIds.has(r.id);
    return (r.name + " " + r.excerpt).toLowerCase().includes(q);
      })
      .map(({ i }) => i);
  }, [rows, filters, debouncedQuery, revealsByScene, openerIds, searchIds]);

  // Virtual list on filtered rows with performance optimizations
  const virt = useVirtualList({
    items: filteredIndex,
    getKey: (i) => rows[i]?.id || i,
    estimateSize: () => 64,
    overscan: scenes.length > 1000 ? 10 : 20, // Reduce overscan for very large datasets
  });

  // Heat strip scores in original order
  const heatScores = useMemo(() => scenes.map((s) => hookScores.get(s.id) || 0), [hookScores, scenes]);

  // Mini reveals for selected scene (compute met vs missing by naive chronological rule)
  const selectedIdx = useMemo(() => scenes.findIndex((s) => s.id === selectedSceneId), [scenes, selectedSceneId]);
  const miniReveals: RevealItem[] = useMemo(() => {
    if (selectedIdx < 0) return [];
    const currentId = scenes[selectedIdx]?.id;
    if (!currentId) return [];
    // Known reveals before this scene
    const known = new Set<string>();
    for (let i = 0; i < selectedIdx; i++) {
      const sid = scenes[i]?.id;
      for (const r of reveals) if (r.firstExposureSceneId === sid) known.add(r.id);
    }
    // Reveals first exposed in the current scene
    const exposedHere = reveals.filter((r) => r.firstExposureSceneId === currentId);
    // Aggregate prerequisites for those reveals
    const prereqIds = Array.from(new Set(exposedHere.flatMap((r) => r.preReqs || [])));
    return prereqIds.map((id) => ({ id, description: reveals.find((x) => x.id === id)?.description || id, met: known.has(id) }));
  }, [reveals, scenes, selectedIdx]);

  // Sync activeIndex with selected scene when present
  useEffect(() => {
    if (!selectedSceneId) return;
    const idx = filteredIndex.indexOf(scenes.findIndex((s) => s.id === selectedSceneId));
    if (idx >= 0) virt.setActiveIndex(idx);
  }, [filteredIndex, scenes, selectedSceneId, virt]);

  // Enhanced progressive prefetch with memory awareness
  useEffect(() => {
    const center = virt.activeIndex;
    if (center == null || center < 0) return;

    // Get scenes in viewport and nearby for preloading
    const viewportScenes = virt.virtualItems.map(vi => filteredIndex[vi.index]).filter(n => typeof n === "number") as number[];
    const prefetchScenes = [
      ...viewportScenes,
      ...[center - 2, center - 1, center + 1, center + 2].map(i => filteredIndex[i]).filter(n => typeof n === "number") as number[]
    ];

    // Remove duplicates and limit to reasonable number
    const uniqueScenes = [...new Set(prefetchScenes)].slice(0, 10);

    // Preload scenes using the store's preload method
    const sceneIds = uniqueScenes.map(idx => scenes[idx]?.id).filter(Boolean) as string[];
    if (sceneIds.length > 0) {
      // Use the manuscript store's preload method for better memory management
      preloadScenes(sceneIds);
    }
  }, [virt.activeIndex, virt.virtualItems, filteredIndex, scenes]);

  return (
    <div className="flex flex-col h-full w-full">
      <div ref={headerRef} className="p-2 border-b border-neutral-200 dark:border-neutral-800">
        <FilterChips
          options={[
            { label: "High Hook", value: "High Hook" },
            { label: "Has Reveals", value: "Has Reveals" },
            { label: "Potential Openers", value: "Potential Openers" },
          ]}
          selected={filters}
          onChange={setFilters}
        />
        <div className="mt-2">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search… (press /)"
            className="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </div>
        <div className="mt-2">
          <HeatStrip width={heatWidth} height={24} scores={heatScores} onSelect={(i) => selectScene(scenes[i]?.id)} />
        </div>
      </div>

      <div className="flex-1 relative">
  <div
          ref={virt.parentRef}
          style={{ height: "100%", overflow: "auto", outline: "none" }}
          tabIndex={0}
          role="list"
          aria-label="Scenes"
          aria-keyshortcuts="ArrowDown ArrowUp /"
          onScroll={() => trackFrame()}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const dir = e.key === "ArrowDown" ? 1 : -1;
            const cur = virt.activeIndex ?? 0;
            const next = Math.max(0, Math.min((filteredIndex.length - 1), cur + dir));
            virt.setActiveIndex(next);
            const rowIndex = filteredIndex[next];
            const id = rowIndex != null ? scenes[rowIndex]?.id : undefined;
            if (id) selectScene(id);
          }}
        >
          <div style={{ height: virt.totalSize, width: "100%", position: "relative" }}>
            {virt.virtualItems.map((vi: VirtualItem) => {
              const rowIndex = filteredIndex[vi.index]!;
              const r = rows[rowIndex]!;
              const isActive = scenes[rowIndex]?.id === selectedSceneId;
              return (
                <div
                  key={r.id}
                  ref={virt.getMeasureRef(rowIndex) as unknown as React.Ref<HTMLDivElement>}
                  style={{ position: "absolute", top: vi.start, left: 0, width: "100%" }}
      role="listitem"
      aria-selected={isActive}
      aria-label={`Scene ${r.name}, hook score ${Math.round((r.hookScore||0)*100)/100}`}
                >
                  <SceneRow data={r} index={rowIndex} isActive={isActive} onClick={(id) => selectScene(id)} highlight={debouncedQuery} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-h-48">
        <RevealMiniList items={miniReveals} onClickReveal={() => {}} />
      </div>
    </div>
  );
}
