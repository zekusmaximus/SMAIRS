use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VersionMetadata {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub parent_id: Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VersionSnapshot {
    pub meta: VersionMetadata,
    pub manuscript: Option<String>,
    pub candidates: Option<serde_json::Value>,
    pub analyses: Option<serde_json::Value>,
    pub decisions: Option<serde_json::Value>,
}

fn versions_dir() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    dir.push(".smairs");
    dir.push("versions");
    dir
}

#[tauri::command]
pub fn version_list() -> Result<Vec<VersionMetadata>, String> {
    let dir = versions_dir();
    let mut out: Vec<VersionMetadata> = vec![];
    if dir.exists() {
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                if entry.file_name().to_string_lossy() == ".trash" { continue; }
                let mut meta_path = entry.path();
                meta_path.push("meta.json");
                if meta_path.exists() {
                    if let Ok(txt) = fs::read_to_string(&meta_path) {
                        if let Ok(m) = serde_json::from_str::<VersionMetadata>(&txt) {
                            out.push(m);
                        }
                    }
                }
            }
        }
    }
    out.sort_by_key(|m| m.created_at);
    Ok(out)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateArgs {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub snapshot: Option<serde_json::Value>,
}

#[tauri::command]
pub fn version_create(args: CreateArgs) -> Result<VersionMetadata, String> {
    let mut dir = versions_dir();
    dir.push(&args.id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let now_ms: i64 = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()) as i64;
    let meta = VersionMetadata { id: args.id.clone(), name: args.name.clone(), created_at: now_ms, parent_id: args.parent_id.clone(), description: None };
    let mut meta_path = dir.clone();
    meta_path.push("meta.json");
    fs::write(&meta_path, serde_json::to_vec_pretty(&meta).unwrap()).map_err(|e| e.to_string())?;
    if let Some(s) = args.snapshot {
        let mut snap_path = dir.clone();
        snap_path.push("snapshot.json");
        fs::write(&snap_path, serde_json::to_vec_pretty(&s).unwrap()).map_err(|e| e.to_string())?;
    }
    Ok(meta)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveArgs { pub id: String, pub snapshot: serde_json::Value }

#[tauri::command]
pub fn version_save(args: SaveArgs) -> Result<bool, String> {
    let mut dir = versions_dir();
    dir.push(&args.id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut snap_path = dir.clone();
    snap_path.push("snapshot.json");
    fs::write(&snap_path, serde_json::to_vec_pretty(&args.snapshot).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadArgs { pub id: String }

#[tauri::command]
pub fn version_load(args: LoadArgs) -> Result<serde_json::Value, String> {
    let mut dir = versions_dir();
    dir.push(&args.id);
    let mut meta_path = dir.clone();
    meta_path.push("meta.json");
    let meta_txt = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let meta: VersionMetadata = serde_json::from_str(&meta_txt).map_err(|e| e.to_string())?;
    let mut snap_path = dir.clone();
    snap_path.push("snapshot.json");
    let snapshot_txt = fs::read_to_string(&snap_path).unwrap_or("{}".to_string());
    let mut snapshot: serde_json::Value = serde_json::from_str(&snapshot_txt).unwrap_or(serde_json::json!({}));
    // Ensure meta is present
    snapshot["meta"] = serde_json::to_value(meta).unwrap();
    Ok(snapshot)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteArgs { pub id: String }

#[tauri::command]
pub fn version_delete(args: DeleteArgs) -> Result<bool, String> {
    let mut dir = versions_dir();
    dir.push(&args.id);
    if dir.exists() {
        // Move to .trash for safety
        let mut trash = versions_dir();
        trash.push(".trash");
        fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
        let ts: i64 = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()) as i64;
        let mut dst = trash.clone();
        dst.push(format!("{}-{}", args.id, ts));
        fs::rename(&dir, &dst).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareArgs { pub a_id: String, pub b_id: String }

#[tauri::command]
pub fn version_compare(args: CompareArgs) -> Result<serde_json::Value, String> {
    // Load both snapshots and compute a minimal metrics diff similar to TS fallback
    let a = version_load(LoadArgs { id: args.a_id.clone() }).map_err(|e| e.to_string())?;
    let b = version_load(LoadArgs { id: args.b_id.clone() }).map_err(|e| e.to_string())?;
    let a_meta: VersionMetadata = serde_json::from_value(a["meta"].clone()).unwrap();
    let b_meta: VersionMetadata = serde_json::from_value(b["meta"].clone()).unwrap();
    let a_anal = a.get("analyses").cloned().unwrap_or_else(|| serde_json::json!({}));
    let b_anal = b.get("analyses").cloned().unwrap_or_else(|| serde_json::json!({}));
    let a_map: serde_json::Map<String, serde_json::Value> = serde_json::from_value(a_anal).unwrap_or(serde_json::Map::new());
    let b_map: serde_json::Map<String, serde_json::Value> = serde_json::from_value(b_anal).unwrap_or(serde_json::Map::new());
    let avg = |vals: &Vec<f64>| if vals.len() > 0 { vals.iter().sum::<f64>() / vals.len() as f64 } else { 0.0 };
    let a_conf: Vec<f64> = a_map.values().filter_map(|v| v.get("confidence").and_then(|x| x.as_f64())).collect();
    let b_conf: Vec<f64> = b_map.values().filter_map(|v| v.get("confidence").and_then(|x| x.as_f64())).collect();
    let avg_delta = avg(&b_conf) - avg(&a_conf);
    let a_spoilers: i64 = a_map.values().filter_map(|v| v.get("spoilerCount").and_then(|x| x.as_i64())).sum();
    let b_spoilers: i64 = b_map.values().filter_map(|v| v.get("spoilerCount").and_then(|x| x.as_i64())).sum();

    // decisions diff
    let a_dec = a.get("decisions").cloned().unwrap_or_else(|| serde_json::json!({}));
    let b_dec = b.get("decisions").cloned().unwrap_or_else(|| serde_json::json!({}));
    let a_dmap: serde_json::Map<String, serde_json::Value> = serde_json::from_value(a_dec).unwrap_or(serde_json::Map::new());
    let b_dmap: serde_json::Map<String, serde_json::Value> = serde_json::from_value(b_dec).unwrap_or(serde_json::Map::new());
    let mut ids: Vec<String> = a_dmap.keys().cloned().collect();
    for k in b_dmap.keys() { if !ids.contains(k) { ids.push(k.clone()); } }
    let mut diffs: Vec<serde_json::Value> = vec![];
    for id in ids {
      let a_v = a_dmap.get(&id).cloned();
      let b_v = b_dmap.get(&id).cloned();
      if a_v != b_v { diffs.push(serde_json::json!({ "id": id, "a": a_v, "b": b_v })); }
    }

    Ok(serde_json::json!({
      "a": a_meta,
      "b": b_meta,
      "metrics": { "avgConfidenceDelta": avg_delta, "spoilerDelta": (b_spoilers - a_spoilers) },
      "decisionsChanged": diffs,
    }))
}
