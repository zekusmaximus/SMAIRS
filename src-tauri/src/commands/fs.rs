use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn load_manuscript_text(path: Option<String>) -> Result<String, String> {
    let p = path.unwrap_or_else(|| String::from("data/manuscript.txt"));
    // Try given path as-is (absolute or relative to CWD)
    match fs::read_to_string(&p) {
        Ok(s) => return Ok(s),
        Err(e) => {
            // If it looks like a repo-relative path and we're running from src-tauri, try ../
            let pb = PathBuf::from(&p);
            if pb.components().count() >= 2 {
                let mut up = PathBuf::from("..");
                up.push(pb);
                if let Ok(s2) = fs::read_to_string(&up) {
                    return Ok(s2);
                }
            }
            return Err(format!("{}: {}", p, e));
        }
    }
}
