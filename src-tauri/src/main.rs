#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
            smairs::db::save_scenes,
            smairs::db::save_reveals,
            smairs::db::list_scenes,
            smairs::db::list_reveals,
            smairs::db::load_scenes,
            smairs::db::load_reveals,
            smairs::db::get_manuscript_metadata,
            smairs::db::clear_all,
            smairs::jobs::run_example_job,
            smairs::commands::analysis::analyze_candidate_command,
            smairs::commands::candidates::generate_candidates,
            smairs::commands::export::export_write_temp,
            smairs::commands::export::export_pandoc_docx,
            smairs::commands::export::export_pandoc_pdf,
            smairs::commands::export::export_package_zip,
            smairs::commands::export::export_docx_track_changes,
            smairs::commands::export::export_docx_python,
            smairs::commands::version::version_list,
            smairs::commands::version::version_create,
            smairs::commands::version::version_save,
            smairs::commands::version::version_load,
            smairs::commands::version::version_delete,
            smairs::commands::version::version_compare,
            smairs::commands::search::build_search_index,
            smairs::commands::search::search_manuscript,
            smairs::commands::search::find_character_occurrences
            ,smairs::commands::fs::load_manuscript_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
