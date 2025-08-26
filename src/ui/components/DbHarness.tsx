import React from "react";

type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type SceneRecord = { id: string; chapter_id: string; start_offset: number; end_offset: number; word_count: number; dialogue_ratio: number };
type RevealRecord = { id: string; description: string; first_scene_id: string; prereqs: string };

async function getInvoke(): Promise<Invoke | undefined> {
  try {
    const core = await import("@tauri-apps/api/core");
    if (typeof core.invoke === "function") return core.invoke as Invoke;
  } catch {
    // ignore
  }
  try {
    const api = await import("@tauri-apps/api");
    const inv = (api as unknown as { invoke?: Invoke }).invoke;
    if (typeof inv === "function") return inv as Invoke;
  } catch {
    // not in Tauri
  }
  return undefined;
}

export default function DbHarness() {
  const [open, setOpen] = React.useState(false);
  const [log, setLog] = React.useState<string>("");
  const [scenes, setScenes] = React.useState<SceneRecord[]>([]);
  const [reveals, setReveals] = React.useState<RevealRecord[]>([]);
  const append = (m: string) => setLog((s) => `${s}${s ? "\n" : ""}${m}`);

  const seed = async () => {
    const invoke = await getInvoke();
    if (!invoke) { append("Not running in Tauri (invoke unavailable)"); return; }
    try {
      const scene = { id: "s-demo", chapter_id: "c-1", start_offset: 0, end_offset: 100, word_count: 20, dialogue_ratio: 0.3 };
      await invoke("save_scenes", { scenes: [scene] });
      const rev = { id: "r-demo", description: "Demo reveal", first_scene_id: "s-demo", prereqs: "[]" };
      await invoke("save_reveals", { reveals: [rev] });
      append("Seeded one scene and one reveal.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      append(`Seed error: ${msg}`);
    }
  };

  const fetchScenes = async () => {
    const invoke = await getInvoke();
    if (!invoke) { append("Not running in Tauri (invoke unavailable)"); return; }
    try {
      const rows = await invoke("list_scenes");
      setScenes(Array.isArray(rows) ? rows : []);
      append(`Fetched ${Array.isArray(rows) ? rows.length : 0} scenes.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      append(`List scenes error: ${msg}`);
    }
  };

  const fetchReveals = async () => {
    const invoke = await getInvoke();
    if (!invoke) { append("Not running in Tauri (invoke unavailable)"); return; }
    try {
      const rows = await invoke("list_reveals");
      setReveals(Array.isArray(rows) ? rows : []);
      append(`Fetched ${Array.isArray(rows) ? rows.length : 0} reveals.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      append(`List reveals error: ${msg}`);
    }
  };

  return (
    <div className="db-harness" style={{ position: "fixed", bottom: 8, right: 8, zIndex: 50 }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="db-harness-panel" title="Toggle DB Harness">
        {open ? "Hide DB Harness" : "Show DB Harness"}
      </button>
      {open && (
        <div id="db-harness-panel" role="region" aria-label="DB Harness" style={{ marginTop: 8, background: "#111", color: "#eee", padding: 12, borderRadius: 6, width: 420, maxHeight: 320, overflow: "auto", boxShadow: "0 4px 10px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={seed}>Seed</button>
            <button className="btn" onClick={fetchScenes}>List Scenes</button>
            <button className="btn" onClick={fetchReveals}>List Reveals</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>Log</div>
          <pre style={{ background: "#000", padding: 8, borderRadius: 4, maxHeight: 80, overflow: "auto" }}>{log || "(empty)"}</pre>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>Scenes</div>
          <pre style={{ background: "#000", padding: 8, borderRadius: 4, maxHeight: 80, overflow: "auto" }}>{JSON.stringify(scenes, null, 2) || "[]"}</pre>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>Reveals</div>
          <pre style={{ background: "#000", padding: 8, borderRadius: 4, maxHeight: 80, overflow: "auto" }}>{JSON.stringify(reveals, null, 2) || "[]"}</pre>
        </div>
      )}
    </div>
  );
}
