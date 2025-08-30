import type { Scene } from "../features/manuscript/types.js";
import { buildRevealGraph } from "../features/manuscript/reveal-graph.js";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

export interface SceneRecord {
  id: string;
  chapter_id: string;
  start_offset: number;
  end_offset: number;
  word_count: number;
  dialogue_ratio: number;
}

export interface RevealRecord {
  id: string;
  description: string;
  first_scene_id: string;
  prereqs: string; // JSON array of reveal ids
}

function dbPath(): string {
  const envPath = (import.meta as { env?: { SMAIRS_DB_PATH?: string } })?.env?.SMAIRS_DB_PATH;
  return envPath || ".smairs/app.db";
}

// Lightweight invoke wrapper; returns false if tauri runtime unavailable.
async function tryInvoke(command: string, payload: Record<string, unknown>): Promise<boolean> {
  // In Vitest environment always skip tauri invoke so that sql.js fallback is exercised deterministically.
  const processEnv = typeof process !== 'undefined' ? (process as { env?: { VITEST?: string; JEST_WORKER_ID?: string } }).env : undefined;
  const isTest = processEnv?.VITEST || processEnv?.JEST_WORKER_ID;
  if (isTest) return false;
  try {
  // Dynamic import (optional dependency inside Node tests)
  const mod = await import("@tauri-apps/api").then(m => m as unknown as { invoke?: (cmd: string, args: Record<string, unknown>) => Promise<unknown> });
    if (typeof mod.invoke === "function") {
      await mod.invoke(command, payload);
      return true;
    }
  } catch { /* not in tauri runtime */ }
  return false;
}

// --- sql.js (pure wasm) fallback (no native build) ---
// Minimal structural type for sql.js we use
interface SqlJsStatement { run(params?: unknown[]): void; free(): void }
interface SqlJsDatabase { run(sql: string): void; prepare(sql: string): SqlJsStatement; export(): Uint8Array }
let sqlJsDb: SqlJsDatabase | null = null;
let sqlJsInitPromise: Promise<void> | null = null;

async function ensureSqlJsDb(): Promise<SqlJsDatabase> {
  if (sqlJsDb) return sqlJsDb;
  if (!sqlJsInitPromise) {
    sqlJsInitPromise = (async () => {
  const init = (await import("sql.js")).default as (cfg?: unknown) => Promise<{ Database: new (data?: Uint8Array) => SqlJsDatabase }>; // dynamically load
      const SQL = await init({});
      const path = dbPath();
      const dir = require("path").dirname(path);
      mkdirSync(dir, { recursive: true });
      let db: SqlJsDatabase;
      if (existsSync(path)) {
        const buf = readFileSync(path);
        db = new SQL.Database(new Uint8Array(buf));
      } else {
        db = new SQL.Database();
      }
      // create tables
      db.run(`CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        chapter_id TEXT,
        start_offset INTEGER,
        end_offset INTEGER,
        word_count INTEGER,
        dialogue_ratio REAL
      );`);
      db.run(`CREATE TABLE IF NOT EXISTS reveals (
        id TEXT PRIMARY KEY,
        description TEXT,
        first_scene_id TEXT,
        prereqs TEXT
      );`);
      sqlJsDb = db;
    })();
  }
  await sqlJsInitPromise;
  return sqlJsDb as unknown as SqlJsDatabase;
}

function persistSqlJsDb() {
  if (!sqlJsDb) return;
  const data = sqlJsDb.export();
  writeFileSync(dbPath(), Buffer.from(data));
}

export async function saveScenes(records: SceneRecord[]): Promise<void> {
  if (!records.length) return;
  if (await tryInvoke("save_scenes", { scenes: records })) return;
  const db = await ensureSqlJsDb();
  // debug: indicate fallback path used
  const debugDb = (import.meta as { env?: { DEBUG_DB?: string } })?.env?.DEBUG_DB === '1';
  if (debugDb) console.log('[db] saveScenes fallback inserting', records.length);
  db.run('BEGIN');
  const stmt = db.prepare(`INSERT OR REPLACE INTO scenes (id, chapter_id, start_offset, end_offset, word_count, dialogue_ratio) VALUES (?, ?, ?, ?, ?, ?)`);
  try {
    for (const r of records) {
      stmt.run([r.id, r.chapter_id, r.start_offset, r.end_offset, r.word_count, r.dialogue_ratio]);
    }
    stmt.free();
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  persistSqlJsDb();
}

export async function saveReveals(records: RevealRecord[]): Promise<void> {
  if (!records.length) return;
  if (await tryInvoke("save_reveals", { reveals: records })) return;
  const db = await ensureSqlJsDb();
  const debugDb = (import.meta as { env?: { DEBUG_DB?: string } })?.env?.DEBUG_DB === '1';
  if (debugDb) console.log('[db] saveReveals fallback inserting', records.length);
  db.run('BEGIN');
  const stmt = db.prepare(`INSERT OR REPLACE INTO reveals (id, description, first_scene_id, prereqs) VALUES (?, ?, ?, ?)`);
  try {
    for (const r of records) {
      stmt.run([r.id, r.description, r.first_scene_id, r.prereqs]);
    }
    stmt.free();
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  persistSqlJsDb();
}

export function toSceneRecords(scenes: Scene[]): SceneRecord[] {
  return scenes.map(s => ({ id: s.id, chapter_id: s.chapterId, start_offset: s.startOffset, end_offset: s.endOffset, word_count: s.wordCount, dialogue_ratio: s.dialogueRatio }));
}
export function toRevealRecordsFromScenes(scenes: Scene[]): RevealRecord[] {
  const graph = buildRevealGraph(scenes);
  return graph.reveals.map(r => ({ id: r.id, description: r.description, first_scene_id: r.firstExposureSceneId, prereqs: JSON.stringify(r.preReqs) }));
}

// Test-only helper (not used in production) to force initialization & flush.
export async function __forcePersistForTests(): Promise<void> {
  const db = await ensureSqlJsDb();
  // no-op usage to avoid unused variable fold
  if (db) persistSqlJsDb();
}
