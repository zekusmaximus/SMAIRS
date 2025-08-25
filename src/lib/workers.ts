export function createWorker<TMsg, TResp>(factory: () => Worker) {
  let w: Worker | null = null;
  function ensure() {
    if (!w) w = factory();
    return w!;
  }
  return {
    post: (msg: TMsg) => new Promise<TResp>((resolve) => {
      const worker = ensure();
      const onMsg = (ev: MessageEvent) => {
        worker.removeEventListener("message", onMsg);
        resolve(ev.data as TResp);
      };
      worker.addEventListener("message", onMsg);
      worker.postMessage(msg);
    }),
    terminate: () => { w?.terminate(); w = null; },
  };
}

// Factories for specific workers (Vite syntax)
export function makeTextAnalysisWorker() {
  return new Worker(new URL("../workers/textAnalysis.worker.ts", import.meta.url), { type: "module" });
}

export function makeDiffWorker() {
  return new Worker(new URL("../workers/diff.worker.ts", import.meta.url), { type: "module" });
}

export function makeSearchIndexWorker() {
  return new Worker(new URL("../workers/searchIndex.worker.ts", import.meta.url), { type: "module" });
}
