import React, { useEffect, useMemo, useRef, useState } from "react";
import { getVersions, switchVersion, getCurrentVersionId, compareVersions } from "@/features/version/versionManager";

type Node = { id: string; name: string; parentId?: string; createdAt: number };

export function VersionTimeline() {
  const [versions, setVersions] = useState<Node[]>([]);
  const [current, setCurrent] = useState<string | undefined>(getCurrentVersionId());
  const [hoverDelta, setHoverDelta] = useState<Record<string, number>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  useEffect(() => {
    let active = true;
    getVersions().then((list) => {
      if (!active) return;
      setVersions(list.map((m) => ({ id: m.id, name: m.name, parentId: m.parentId, createdAt: m.createdAt })));
    });
    return () => { active = false; };
  }, []);

  const lanes = useMemo(() => {
    // Simple layout: assign lane by following parent chain to avoid overlaps
    const laneOf: Record<string, number> = {};
    const sorted = [...versions].sort((a, b) => a.createdAt - b.createdAt);
    for (const v of sorted) {
      if (v.parentId && laneOf[v.parentId] !== undefined) laneOf[v.id] = laneOf[v.parentId]!;
      else laneOf[v.id] = Object.values(laneOf).length ? Math.max(...Object.values(laneOf)) + 1 : 0;
    }
    return { sorted, laneOf };
  }, [versions]);

  function onNodeClick(id: string) {
    switchVersion(id).then(() => setCurrent(id));
  }

  async function onContext(e: React.MouseEvent, id: string) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, id });
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return setMenu(null);
      const target = e.target as unknown as globalThis.Node | null;
      if (!target || !menuRef.current.contains(target as unknown as Element)) setMenu(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    // Precompute confidence deltas vs parent for badges
    (async () => {
      const map: Record<string, number> = {};
      for (const v of versions) {
        if (!v.parentId) continue;
        const cmp = await compareVersions(v.parentId, v.id);
        map[v.id] = cmp?.metrics.avgConfidenceDelta ?? 0;
      }
      setHoverDelta(map);
    })();
  }, [versions]);

  return (
    <div style={{ position: "relative", padding: 12 }}>
      <div style={{ position: "relative", height: Math.max(200, (Object.values(lanes.laneOf).length || 1) * 64) }}>
        {lanes.sorted.map((v, i) => {
          const lane = lanes.laneOf[v.id] ?? 0;
          const top = lane * 64;
          const left = i * 140;
          const isCurrent = current === v.id;
          const delta = hoverDelta[v.id];
          return (
            <div key={v.id} onContextMenu={(e) => onContext(e, v.id)} onClick={() => onNodeClick(v.id)}
              title={`Created ${new Date(v.createdAt).toLocaleString()}`}
              style={{ position: "absolute", top, left, width: 120, cursor: "pointer", userSelect: "none" }}>
              {/* edge to parent */}
              {v.parentId && (
                <div style={{ position: "absolute", top: -32, left: -20, width: 20, height: 32, borderLeft: "2px solid #999", borderBottom: "2px solid #999", borderBottomLeftRadius: 6 }} />
              )}
              <div style={{ padding: 8, borderRadius: 8, border: isCurrent ? "2px solid #3b82f6" : "1px solid #ccc", background: isCurrent ? "#eff6ff" : "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div>
                {delta !== undefined && (
                  <div style={{ marginTop: 6, fontSize: 12, color: delta >= 0 ? "#065f46" : "#991b1b" }}>
                    {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}% confidence
                  </div>
                )}
                {isCurrent && <div style={{ marginTop: 6, fontSize: 11, color: "#3b82f6" }}>Current</div>}
              </div>
            </div>
          );
        })}
      </div>
      {menu && (
        <div ref={menuRef} style={{ position: "fixed", top: menu.y, left: menu.x, background: "#fff", border: "1px solid #ddd", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 50 }}>
          <Menu id={menu.id} onClose={() => setMenu(null)} onSwitched={(id) => { setCurrent(id); setMenu(null); }} />
        </div>
      )}
    </div>
  );
}

function Menu({ id, onClose, onSwitched }: { id: string; onClose: () => void; onSwitched: (id: string) => void }) {
  return (
    <div style={{ minWidth: 200 }}>
      <Item onClick={async () => { await switchVersion(id); onSwitched(id); }}>Switch to this</Item>
      {/* Additional actions like branch from here can live in another modal; timeline is read-only-ish */}
      <Item onClick={() => onClose()}>Close</Item>
    </div>
  );
}

function Item({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ padding: "8px 12px", fontSize: 14, cursor: "pointer" }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f3f4f6"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
      {children}
    </div>
  );
}

export default VersionTimeline;
