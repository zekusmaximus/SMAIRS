import React, { useEffect, useState } from "react";
import { compareVersions, promoteToCurrent, switchVersion, mergeDecisions } from "@/features/version/versionManager";

export function VersionCompareModal({ aId, bId, onClose }: { aId: string; bId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [cmp, setCmp] = useState<Awaited<ReturnType<typeof compareVersions>> | undefined>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    compareVersions(aId, bId).then((res) => { if (active) setCmp(res); }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [aId, bId]);

  const metrics = cmp?.metrics;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ width: 900, maxWidth: "95vw", background: "#fff", borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600 }}>Compare Versions</div>
          <button onClick={onClose} style={{ padding: "6px 10px" }}>Close</button>
        </div>
        {loading ? (
          <div style={{ padding: 16 }}>Loading…</div>
        ) : !cmp ? (
          <div style={{ padding: 16 }}>No data to compare.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12 }}>
            <Panel title={`A: ${cmp.a.name}`}>
              <Metric label="Avg confidence" value={fmtPct((cmp.metrics.avgConfidenceDelta ?? 0) + (metrics ? 0 : 0))} hint="delta is relative to A" />
              <Metric label="Spoilers (delta)" value={`${cmp.metrics.spoilerDelta ?? 0} vs A`} />
              <Decisions diffs={cmp.decisionsChanged} side="a" />
            </Panel>
            <Panel title={`B: ${cmp.b.name}`}>
              <Metric label="Avg confidence delta" value={fmtPct(cmp.metrics.avgConfidenceDelta ?? 0)} />
              <Metric label="Spoilers delta" value={`${cmp.metrics.spoilerDelta ?? 0}`} />
              <Decisions diffs={cmp.decisionsChanged} side="b" />
            </Panel>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={async () => { await switchVersion(cmp.a.id); onClose(); }} style={{ padding: "6px 10px" }}>Switch to A</button>
              <button onClick={async () => { await switchVersion(cmp.b.id); onClose(); }} style={{ padding: "6px 10px" }}>Switch to B</button>
              <button onClick={async () => { await mergeDecisions(cmp.a.id, cmp.b.id); }} style={{ padding: "6px 10px" }}>Merge decisions A→B</button>
              <button onClick={async () => { await mergeDecisions(cmp.b.id, cmp.a.id); }} style={{ padding: "6px 10px" }}>Merge decisions B→A</button>
              <button onClick={async () => { await promoteToCurrent(cmp.b.id); onClose(); }} style={{ padding: "6px 10px", background: "#3b82f6", color: "#fff", borderRadius: 6 }}>Promote B</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
      <div style={{ width: 180, color: "#555" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "#777" }}>{hint}</div>}
    </div>
  );
}

function Decisions({ diffs, side }: { diffs: Array<{ id: string; a?: unknown; b?: unknown }>; side: "a" | "b" }) {
  if (!diffs.length) return <div style={{ color: "#777" }}>No decision changes.</div>;
  return (
    <div style={{ marginTop: 8 }}>
      {diffs.map((d) => (
        <div key={d.id} style={{ borderTop: "1px solid #f3f4f6", padding: "6px 0" }}>
          <div style={{ fontSize: 12, color: "#666" }}>Candidate {d.id}</div>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f9fafb", padding: 8, borderRadius: 6, fontSize: 12 }}>
            {JSON.stringify(side === "a" ? d.a : d.b, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

export default VersionCompareModal;
