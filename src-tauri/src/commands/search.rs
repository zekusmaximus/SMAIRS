use serde::Deserialize;
use anyhow::Result;

use smairs::search::{search_index_read, search_index_write, SearchHit, IndexScene};

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
    guard.index_manuscript(&data).map_err(|e| e.to_string())
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
