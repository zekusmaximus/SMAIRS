import { runSceneInventory } from "../src/cli/scene-inventory.js";
import { importManuscript } from "../src/features/manuscript/importer.js";
import { segmentScenes } from "../src/features/manuscript/segmentation.js";
import { buildRevealGraph } from "../src/features/manuscript/reveal-graph.js";
import { readFileSync, rmSync } from "fs";
import { randomUUID } from "crypto";
import initSqlJs from "sql.js";

describe("SQLite persistence", () => {
  const tmpPath = `.smairs/test-${randomUUID()}.db`;
  const prev = process.env.SMAIRS_DB_PATH;

  beforeAll(() => { process.env.SMAIRS_DB_PATH = tmpPath; });
  afterAll(() => {
    if (prev === undefined) delete process.env.SMAIRS_DB_PATH; else process.env.SMAIRS_DB_PATH = prev;
    try { rmSync(tmpPath); } catch { /* ignore */ }
  });

  it("persists scenes and reveals counts", async () => {
    const text = readFileSync("data/manuscript.txt", "utf-8");
    await runSceneInventory(text, { fixedTimestamp: "2024-01-01T00:00:00Z" });
    const ms = importManuscript(text);
    const scenes = segmentScenes(ms);
    const graph = buildRevealGraph(scenes);
  // Open with sql.js
  const SQL = await initSqlJs({});
  const buf = readFileSync(tmpPath);
  const db = new SQL.Database(new Uint8Array(buf));
    const scRows = db.exec("SELECT COUNT(*) as c FROM scenes");
    const revRows = db.exec("SELECT COUNT(*) as c FROM reveals");

  interface ExecRow { values: unknown[][] }
  function extractCount(rows: ExecRow[]): number {
      if (!rows || rows.length === 0) return 0;
      const first = rows[0];
      if (!first || !Array.isArray(first.values) || first.values.length === 0) return 0;
      const row0 = first.values[0];
      if (!row0 || row0.length === 0) return 0;
      const v = row0[0];
      return typeof v === 'number' ? v : Number(v) || 0;
    }

  const scCount = extractCount(scRows as unknown as ExecRow[]);
  const revCount = extractCount(revRows as unknown as ExecRow[]);
  expect(scCount).toBe(scenes.length);
  expect(revCount).toBe(graph.reveals.length);
  });
});
