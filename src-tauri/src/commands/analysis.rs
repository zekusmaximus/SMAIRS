use serde::{Deserialize, Serialize};
use crate::jobs::{emit_log, emit_progress, emit_error, emit_done};
use std::io::Write;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeCandidateInput {
    pub id: String, // job id for events
    pub candidate_id: String,
    pub manuscript_text: String,
    pub candidate_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpeningAnalysisOut {
    pub id: String,
    pub candidate_id: String,
    pub confidence: f32,
    pub spoiler_count: i32,
    pub edit_burden_percent: f32,
    pub rationale: String,
}

fn validate_text(input: &str) -> bool { !input.trim().is_empty() }

#[tauri::command]
pub async fn analyze_candidate_command(app: tauri::AppHandle, payload: AnalyzeCandidateInput) -> Result<OpeningAnalysisOut, String> {
    let job_id = payload.id.clone();
    emit_log(&app, &job_id, "Starting candidate analysis", Some("info"));
    emit_progress(&app, &job_id, 1, Some("prepare"));
    if !validate_text(&payload.manuscript_text) { let msg = "Empty manuscript_text".to_string(); emit_error(&app, &job_id, &msg, Some("invalid_input")); return Err(msg); }
    // Prepare JSON payload for Node analysis script
    let script_input = serde_json::json!({
        "candidateId": payload.candidate_id,
        "manuscriptText": payload.manuscript_text,
        "candidateText": payload.candidate_text.clone().unwrap_or_default(),
    }).to_string();

    // Spawn Node process running tsx via --import (Node >= 18.19 / 20.6)
    let output_res = tauri::async_runtime::spawn_blocking(move || {
        let child = std::process::Command::new("node")
            .arg("--import=tsx")
            .arg("scripts/analyze-candidate.ts")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            // Ensure the script path and tsx loader resolve from the project root
            .current_dir(std::path::Path::new(".."))
            .spawn();
    let mut child = child.map_err(|e| e.to_string())?;
    if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(script_input.as_bytes()).map_err(|e| e.to_string())?;
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        Ok::<_, String>(out)
    }).await.map_err(|e| e.to_string())?;

    // Unwrap the inner Result<Output, String>
    let output = output_res?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        emit_error(&app, &job_id, &err, Some("analysis_failed"));
        return Err(err);
    }

    let json_str = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let result: OpeningAnalysisOut = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;

    emit_progress(&app, &job_id, 100, Some("complete"));
    emit_done(&app, &job_id, Some(&result));
    Ok(result)
}
