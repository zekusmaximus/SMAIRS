#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
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
