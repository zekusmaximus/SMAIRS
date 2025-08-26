use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// Build database file path (allows override for tests via SMAIRS_DB_PATH env var)
pub fn db_path() -> PathBuf {
    let p = std::env::var("SMAIRS_DB_PATH").unwrap_or_else(|_| ".smairs/app.db".into());
    PathBuf::from(p)
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct SceneRecord {
    pub id: String,
    pub chapter_id: String,
    pub start_offset: i64,
    pub end_offset: i64,
    pub word_count: i64,
    pub dialogue_ratio: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct RevealRecord {
    pub id: String,
    pub description: String,
    pub first_scene_id: String,
    pub prereqs: String, // JSON array string
}

fn ensure_db_dir_exists(path: &Path) -> std::io::Result<()> {
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
    Ok(())
}

fn open_db() -> Result<rusqlite::Connection, String> {
    let path = db_path();
    ensure_db_dir_exists(&path).map_err(|e| e.to_string())?;
    let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS scenes (
            id TEXT PRIMARY KEY,
            chapter_id TEXT,
            start_offset INTEGER,
            end_offset INTEGER,
            word_count INTEGER,
            dialogue_ratio REAL
        );
        CREATE TABLE IF NOT EXISTS reveals (
            id TEXT PRIMARY KEY,
            description TEXT,
            first_scene_id TEXT,
            prereqs TEXT
        );
        "#,
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ManuscriptMeta {
    pub scene_count: i64,
    pub reveal_count: i64,
}

#[tauri::command]
pub async fn save_scenes(scenes: Vec<SceneRecord>) -> Result<(), String> {
    let mut conn = open_db()?;
    {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO scenes (id, chapter_id, start_offset, end_offset, word_count, dialogue_ratio)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
            ).map_err(|e| e.to_string())?;
            for s in scenes {
                stmt.execute((
                    &s.id,
                    &s.chapter_id,
                    s.start_offset,
                    s.end_offset,
                    s.word_count,
                    s.dialogue_ratio,
                )).map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn save_reveals(reveals: Vec<RevealRecord>) -> Result<(), String> {
    let mut conn = open_db()?;
    {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO reveals (id, description, first_scene_id, prereqs)
                 VALUES (?1, ?2, ?3, ?4)"
            ).map_err(|e| e.to_string())?;
            for r in reveals {
                stmt.execute((
                    &r.id,
                    &r.description,
                    &r.first_scene_id,
                    &r.prereqs,
                )).map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_scenes() -> Result<Vec<SceneRecord>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare("SELECT id, chapter_id, start_offset, end_offset, word_count, dialogue_ratio FROM scenes ORDER BY start_offset ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SceneRecord {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                start_offset: row.get(2)?,
                end_offset: row.get(3)?,
                word_count: row.get(4)?,
                dialogue_ratio: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}

#[tauri::command]
pub async fn list_reveals() -> Result<Vec<RevealRecord>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare("SELECT id, description, first_scene_id, prereqs FROM reveals ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(RevealRecord {
                id: row.get(0)?,
                description: row.get(1)?,
                first_scene_id: row.get(2)?,
                prereqs: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}

// New load operations with manuscript_id parameter for future multi-manuscript support.
// Currently the schema has no manuscript_id column, so we ignore the parameter and return all rows.
#[tauri::command]
pub async fn load_scenes(_manuscript_id: Option<String>) -> Result<Vec<SceneRecord>, String> {
    list_scenes().await
}

#[tauri::command]
pub async fn load_reveals(_manuscript_id: Option<String>) -> Result<Vec<RevealRecord>, String> {
    list_reveals().await
}

#[tauri::command]
pub async fn get_manuscript_metadata() -> Result<ManuscriptMeta, String> {
    let conn = open_db()?;
    let scene_count: i64 = conn
        .query_row("SELECT COUNT(1) FROM scenes", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let reveal_count: i64 = conn
        .query_row("SELECT COUNT(1) FROM reveals", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(ManuscriptMeta { scene_count, reveal_count })
}

#[tauri::command]
pub async fn clear_all() -> Result<(), String> {
    let conn = open_db()?;
    conn.execute("DELETE FROM scenes", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM reveals", []).map_err(|e| e.to_string())?;
    Ok(())
}
