use serde::Deserialize;
use anyhow::Result;

use crate::search::{search_index_read, search_index_write, SearchHit, IndexScene};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildIndexScene {
    pub id: String,
    pub chapter_id: String,
    pub text: String,
    pub start_offset: usize,
}

#[tauri::command]
pub async fn build_search_index(scenes: Vec<BuildIndexScene>) -> Result<(), String> {
    let mut guard = search_index_write().map_err(|e| e.to_string())?;
    let data: Vec<IndexScene> = scenes.into_iter().map(|s| IndexScene { id: s.id, chapter_id: s.chapter_id, text: s.text, start_offset: s.start_offset }).collect();
    match guard.index_manuscript(&data) {
        Ok(()) => Ok(()),
        Err(e) => {
            // If the writer was killed or index corrupted, nuke and recreate once
            let msg = e.to_string();
            if msg.contains("writer was killed") || msg.contains("writer") || msg.contains("killed") || msg.contains("meta.json") || msg.to_lowercase().contains("does not exist") {
                let dir = crate::search::index_dir();
                let _ = std::fs::remove_dir_all(&dir);
                let _ = std::fs::create_dir_all(&dir);
                drop(guard);
                // Re-init global index by taking a new write guard
                let mut retry_guard = search_index_write().map_err(|e| e.to_string())?;
                let data2 = data; // reuse moved data by having it prior
                retry_guard.index_manuscript(&data2).map_err(|e| e.to_string())
            } else {
                Err(msg)
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchArgs { pub query: String, pub limit: Option<usize> }

#[tauri::command]
pub async fn search_manuscript(query: String, limit: Option<usize>) -> Result<Vec<SearchHit>, String> {
    let guard = search_index_read().map_err(|e| e.to_string())?;
    guard.search(&query, limit.unwrap_or(50)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_character_occurrences(character: String) -> Result<Vec<SearchHit>, String> {
    let guard = search_index_read().map_err(|e| e.to_string())?;
    guard.find_character_mentions(&character).map_err(|e| e.to_string())
}
