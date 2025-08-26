import { performance } from "node:perf_hooks";
import { searchAPI } from "../src/features/search/searchApi";
import { importManuscript } from "../src/features/manuscript/importer";
import { segmentScenes } from "../src/features/manuscript/segmentation";
import { readFileSync } from "node:fs";

async function main() {
  const raw = readFileSync("data/manuscript.txt", "utf8");
  const ms = importManuscript(raw);
  const scenes = segmentScenes(ms);
  const t0 = performance.now();
  await searchAPI.buildIndex(scenes);
  const tIndex = performance.now() - t0;
  const t1 = performance.now();
  const res = await searchAPI.search("" + (scenes[0]?.text.split(" ").slice(0, 3).join(" ") ?? "the"));
  const tSearch = performance.now() - t1;
  console.log({ scenes: scenes.length, tIndex: Math.round(tIndex), tSearch: Math.round(tSearch), res: res.slice(0, 3) });
}

main().catch((e) => { console.error(e); process.exit(1); });
