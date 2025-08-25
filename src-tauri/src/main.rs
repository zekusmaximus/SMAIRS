#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
use db::{save_reveals, save_scenes};
mod jobs;
mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&db::db_url(), db::migrations())
                .build(),
        )
    .invoke_handler(tauri::generate_handler![
            save_scenes,
            save_reveals,
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
        .setup(|app| {
            let window = tauri::WindowBuilder::new(
                app,
                "main",
                tauri::WindowUrl::App("index.html".into()),
            )
            .title("SMAIRS")
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .build()?;
            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
