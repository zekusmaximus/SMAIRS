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

// Filters
export type SceneFilter = "High Hook" | "Has Reveals" | "Potential Openers";

export default function SceneNavigator() {
  const { scenes, reveals, selectedSceneId, selectScene } = useManuscriptStore();

  // Pre-compute analysis used in rows/heatstrip
  const analysis = useMemo(() => analyzeScenes(scenes), [scenes]);
  const hookScores = analysis.hookScores;

  // Potential openers set for filtering label
  const openerIds = useMemo(() => new Set(generateCandidates(scenes).flatMap((c) => c.scenes)), [scenes]);

  const [filters, setFilters] = useState<SceneFilter[]>([]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [heatWidth, setHeatWidth] = useState(280);

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
    const q = query.trim().toLowerCase();
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => {
        if (filters.includes("High Hook") && (r.hookScore || 0) < 0.6) return false;
        if (filters.includes("Has Reveals") && (revealsByScene.get(r.id)?.length || 0) === 0) return false;
        if (filters.includes("Potential Openers") && !openerIds.has(r.id)) return false;
        if (!q) return true;
        return r.name.toLowerCase().includes(q);
      })
      .map(({ i }) => i);
  }, [rows, filters, query, revealsByScene, openerIds]);

  // Virtual list on filtered rows
  const virt = useVirtualList({
    items: filteredIndex,
    getKey: (i) => rows[i]?.id || i,
    estimateSize: () => 68,
    overscan: 12,
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
                >
                  <SceneRow data={r} index={rowIndex} isActive={isActive} onClick={(id) => selectScene(id)} highlight={query} />
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
