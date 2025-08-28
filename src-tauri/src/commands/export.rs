use std::fs;
use std::io::Write;
use std::path::PathBuf;

fn ensure_out_dir() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    dir.push("out");
    if !dir.exists() { let _ = fs::create_dir_all(&dir); }
    dir
}

#[tauri::command]
pub async fn export_write_temp(name: String, content: String) -> Result<String, String> {
    let mut d = ensure_out_dir();
    d.push(name);
    let mut f = fs::File::create(&d).map_err(|e| e.to_string())?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().to_string())
}

// Removed unused DocxArgs struct to avoid dead_code warning; functions below take explicit params

#[tauri::command]
pub async fn export_pandoc_docx(markdown_path: String, _track_changes: Option<bool>) -> Result<String, String> {
    let out = ensure_out_dir();
    let docx_path = out.join("opening.docx");
    let mut args = vec![markdown_path.clone(), String::from("-o"), docx_path.to_string_lossy().to_string()];
    // Track changes support depends on template/styles; we rely on a template if present
    // Optionally add: --reference-doc=templates/opening-reference.docx
    let template = PathBuf::from("templates").join("opening-reference.docx");
    if template.exists() { args.push(String::from("--reference-doc")); args.push(template.to_string_lossy().to_string()); }
    let status = std::process::Command::new("pandoc").args(&args).status().map_err(|e| e.to_string())?;
    if !status.success() { return Err(format!("pandoc failed with status {:?}", status.code())); }
    Ok(docx_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_pandoc_pdf(markdown_path: String) -> Result<String, String> {
    let out = ensure_out_dir();
    let pdf_path = out.join("opening.pdf");
    let status = std::process::Command::new("pandoc")
        .args(&[markdown_path.clone(), String::from("-o"), pdf_path.to_string_lossy().to_string()])
        .status().map_err(|e| e.to_string())?;
    if !status.success() { return Err(format!("pandoc failed with status {:?}", status.code())); }
    Ok(pdf_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_package_zip(files: Vec<String>, base_name: String) -> Result<String, String> {
    let out = ensure_out_dir();
    let zip_path = out.join(format!("{}.zip", base_name));
    let file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default();
    for p in files {
        let pb = PathBuf::from(&p);
        let name = pb.file_name().unwrap_or_default().to_string_lossy().to_string();
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        let bytes = fs::read(&pb).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(zip_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_docx_track_changes(
    markdown_path: String,
    _changes: Vec<serde_json::Value>
) -> Result<String, String> {
    let out = ensure_out_dir();
    let filter_path = out.join("track-changes.lua");
    let docx_path = out.join("track_changes.docx");

    // Ensure the track-changes filter exists
    if !filter_path.exists() {
        let filter_content = include_str!("../../../filters/track-changes.lua");
        fs::write(&filter_path, filter_content).map_err(|e| e.to_string())?;
    }

    // Run pandoc with the track changes filter
    let status = std::process::Command::new("pandoc")
        .args(&[
            markdown_path,
            "--lua-filter".to_string(),
            filter_path.to_string_lossy().to_string(),
            "-t".to_string(),
            "docx".to_string(),
            "-o".to_string(),
            docx_path.to_string_lossy().to_string(),
        ])
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err(format!("Pandoc track changes export failed with status {:?}", status.code()));
    }

    Ok(docx_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_docx_python(
    original_text: String,
    revised_text: String,
    changes: Vec<serde_json::Value>,
    metadata: serde_json::Value
) -> Result<String, String> {
    let out = ensure_out_dir();
    let input_file = out.join("docx_input.json");
    let python_script = PathBuf::from("src-tauri/src/docx_processor.py");

    // Prepare input data for Python script
    let input_data = serde_json::json!({
        "originalText": original_text,
        "revisedText": revised_text,
        "changes": changes,
        "metadata": metadata
    });

    // Write input data to temporary file
    fs::write(&input_file, serde_json::to_string_pretty(&input_data).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    // Run Python script
    let output = std::process::Command::new("python")
        .args(&[
            python_script.to_string_lossy().to_string(),
            input_file.to_string_lossy().to_string()
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python DOCX processor failed: {}", stderr));
    }

    let output_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(output_path)
}
