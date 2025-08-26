use serde::Serialize;
use tauri::Emitter;
use std::thread;
use std::time::Duration;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub id: String,
    pub percent: u8,
    pub step: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogPayload {
    pub id: String,
    pub level: Option<String>,
    pub message: String,
    pub timestamp: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DonePayload<T: Serialize> {
    pub id: String,
    pub result: Option<T>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub id: String,
    pub error: String,
    pub code: Option<String>,
}

fn topic(id: &str, suffix: &str) -> String { format!("job::{}::{}", id, suffix) }

pub fn emit_progress(app: &tauri::AppHandle, id: &str, percent: u8, step: Option<&str>) {
    let _ = app.emit(
        &topic(id, "progress"),
        ProgressPayload { id: id.to_string(), percent, step: step.map(|s| s.to_string()) },
    );
}

pub fn emit_log(app: &tauri::AppHandle, id: &str, message: &str, level: Option<&str>) {
    let _ = app.emit(
        &topic(id, "log"),
        LogPayload { id: id.to_string(), level: level.map(|s| s.to_string()), message: message.to_string(), timestamp: None },
    );
}

pub fn emit_done<T: Serialize + Clone>(app: &tauri::AppHandle, id: &str, result: Option<T>) {
    let _ = app.emit(
        &topic(id, "done"),
        DonePayload { id: id.to_string(), result },
    );
}

pub fn emit_error(app: &tauri::AppHandle, id: &str, error: &str, code: Option<&str>) {
    let _ = app.emit(
        &topic(id, "error"),
        ErrorPayload { id: id.to_string(), error: error.to_string(), code: code.map(|s| s.to_string()) },
    );
}

// Example long-running job to demonstrate emissions.
#[tauri::command]
pub async fn run_example_job(app: tauri::AppHandle, id: String) -> Result<(), String> {
    emit_log(&app, &id, "Starting job", Some("info"));
    let steps = ["prepare", "analyze", "summarize", "finalize"];
    for (i, step) in steps.iter().enumerate() {
        emit_log(&app, &id, &format!("Step: {}", step), Some("info"));
        emit_progress(&app, &id, ((i as u8) * 25) as u8, Some(step));
        // Simulate work
        thread::sleep(Duration::from_millis(300));
    }
    emit_progress(&app, &id, 100, Some("complete"));
    emit_done::<serde_json::Value>(&app, &id, None);
    Ok(())
}
