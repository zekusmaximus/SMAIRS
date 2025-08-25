/// <reference lib="webworker" />
import DiffModule from "@/features/manuscript/diff-engine";
type DiffEngineClass = new () => { generateDiff: (a: string, x: unknown[], y: unknown[], z: unknown[]) => unknown };

type DiffMsg = { type: "diff"; a: string; b: string };
type DiffResp = { type: "result"; patches: unknown };

self.onmessage = (ev: MessageEvent<DiffMsg>) => {
  const { data } = ev;
  if (data.type === "diff") {
  const DiffEngineCtor = (DiffModule as unknown as { DiffEngine?: DiffEngineClass }).DiffEngine;
  if (!DiffEngineCtor) { postMessage({ type: "result", patches: null }); return; }
  const engine = new DiffEngineCtor();
    const res = engine.generateDiff(data.a, [], [], []);
    const result = res; // passthrough
    const resp: DiffResp = { type: "result", patches: result };
    postMessage(resp);
  }
};
