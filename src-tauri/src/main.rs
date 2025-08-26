#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
use db::{save_reveals, save_scenes};
mod jobs;
mod commands;

fn main() {
    tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
            save_scenes,
            save_reveals,
            db::list_scenes,
            db::list_reveals,
            jobs::run_example_job,
            commands::analysis::analyze_candidate_command,
            commands::export::export_write_temp,
            commands::export::export_pandoc_docx,
            commands::export::export_pandoc_pdf,
            commands::export::export_package_zip,
            commands::version::version_list,
            commands::version::version_create,
            commands::version::version_save,
            commands::version::version_load,
            commands::version::version_delete,
            commands::version::version_compare
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
