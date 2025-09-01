use serde::{Deserialize, Serialize};
use std::io::Write;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCandidatesInput {
    pub scenes: Vec<SceneIn>,
    pub strategy: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneIn {
    pub id: String,
    pub chapter_id: String,
    pub text: String,
    pub start_offset: usize,
    pub end_offset: usize,
    pub word_count: usize,
    pub dialogue_ratio: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpeningCandidateOut {
    pub id: String,
    pub scene_ids: Vec<String>,
    pub r#type: String,
}

#[tauri::command]
pub async fn generate_candidates(payload: GenerateCandidatesInput) -> Result<Vec<OpeningCandidateOut>, String> {
    let script_input = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    let output_res = tauri::async_runtime::spawn_blocking(move || {
        let child = std::process::Command::new("node")
            .arg("--import=tsx")
            .arg("scripts/generate-candidates.ts")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(std::path::Path::new(".."))
            .spawn();
        let mut child = child.map_err(|e| e.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(script_input.as_bytes()).map_err(|e| e.to_string())?;
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        Ok::<_, String>(out)
    }).await.map_err(|e| e.to_string())?;

    let output = output_res?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(err);
    }
    let stdout_str = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    if stdout_str.trim().is_empty() {
        let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("candidate script produced no output. stderr: {}", stderr_str));
    }
    let result: Vec<OpeningCandidateOut> = serde_json::from_str(&stdout_str).map_err(|e| {
        let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
        format!("failed to parse candidate JSON: {}. stdout prefix: {:?} stderr: {}", e, &stdout_str.chars().take(200).collect::<String>(), stderr_str)
    })?;
    Ok(result)
}
