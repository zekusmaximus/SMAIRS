use std::fs;
use std::io::Write;
use std::path::PathBuf;
use serde::Deserialize;

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

#[derive(Deserialize)]
pub struct DocxArgs { pub markdown_path: String, pub track_changes: Option<bool> }

#[tauri::command]
pub async fn export_pandoc_docx(markdown_path: String, track_changes: Option<bool>) -> Result<String, String> {
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
