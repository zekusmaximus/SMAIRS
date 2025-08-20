use serde::Deserialize;
use tauri::AppHandle;

// Build database URL (allows override for tests via SMAIRS_DB_PATH env var)
pub fn db_url() -> String {
    let path = std::env::var("SMAIRS_DB_PATH").unwrap_or_else(|_| ".smairs/app.db".into());
    format!("sqlite:{}", path)
}

#[derive(Debug, Deserialize)]
pub struct SceneRecord {
    pub id: String,
    pub chapter_id: String,
    pub start_offset: i64,
    pub end_offset: i64,
    pub word_count: i64,
    pub dialogue_ratio: f64,
}

#[derive(Debug, Deserialize)]
pub struct RevealRecord {
    pub id: String,
    pub description: String,
    pub first_scene_id: String,
    pub prereqs: String, // JSON array string
}

pub fn migrations() -> Vec<tauri_plugin_sql::Migration> {
    vec![tauri_plugin_sql::Migration {
        version: 1,
        description: "create scenes and reveals tables",
        sql: r#"
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
    }]
}

async fn get_db(app: &AppHandle) -> Result<tauri_plugin_sql::Db, tauri_plugin_sql::Error> {
    let url = db_url();
    tauri_plugin_sql::get(app, &url).await
}

#[tauri::command]
pub async fn save_scenes(app: AppHandle, scenes: Vec<SceneRecord>) -> Result<(), String> {
    let db = get_db(&app).await.map_err(|e| e.to_string())?;
    for s in scenes {
        db.execute(
            "INSERT OR REPLACE INTO scenes (id, chapter_id, start_offset, end_offset, word_count, dialogue_ratio) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            &[&s.id, &s.chapter_id, &s.start_offset.to_string(), &s.end_offset.to_string(), &s.word_count.to_string(), &s.dialogue_ratio.to_string()]
        ).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn save_reveals(app: AppHandle, reveals: Vec<RevealRecord>) -> Result<(), String> {
    let db = get_db(&app).await.map_err(|e| e.to_string())?;
    for r in reveals {
        db.execute(
            "INSERT OR REPLACE INTO reveals (id, description, first_scene_id, prereqs) VALUES (?1, ?2, ?3, ?4)",
            &[&r.id, &r.description, &r.first_scene_id, &r.prereqs]
        ).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
