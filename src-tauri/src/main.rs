#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
use db::{save_reveals, save_scenes};

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&db::db_url(), db::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![save_scenes, save_reveals])
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
