/// <reference lib="webworker" />

export type BuildIndexMsg = { type: "build"; docs: { id: string; text: string }[] };
export type QueryMsg = { type: "query"; q: string };
export type SearchMsg = BuildIndexMsg | QueryMsg;

type Index = Map<string, Set<string>>; // token -> doc ids
let index: Index = new Map();

function tokenize(s: string) {
  return (s.toLowerCase().match(/[a-z0-9]{2,}/g) || []);
}

self.onmessage = (ev: MessageEvent<SearchMsg>) => {
  const msg = ev.data;
  if (msg.type === "build") {
    index = new Map();
    for (const d of msg.docs) {
      const seen = new Set<string>();
      for (const tok of tokenize(d.text)) {
        if (seen.has(tok)) continue; // one vote per doc
        seen.add(tok);
        let s = index.get(tok);
        if (!s) { s = new Set(); index.set(tok, s); }
        s.add(d.id);
      }
    }
    postMessage({ type: "built", size: index.size });
  } else if (msg.type === "query") {
    const toks = tokenize(msg.q);
    let result: Set<string> | null = null;
    for (const t of toks) {
      const ids: Set<string> = index.get(t) || new Set<string>();
  const curr: string[] = Array.from<string>(result || new Set<string>());
  result = result ? new Set<string>(curr.filter((x: string) => ids.has(x))) : new Set<string>(ids);
    }
    postMessage({ type: "result", ids: Array.from(result || []) });
  }
};
