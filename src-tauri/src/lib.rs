mod db;
mod commands;
mod submissions;
mod excel;
mod export;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match db::init_db(&handle).await {
                    Ok(pool) => {
                        handle.manage(pool);
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize database: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_course,
            commands::list_courses,
            commands::create_ta,
            commands::list_tas,
            commands::save_roster,
            commands::create_assignment,
            commands::list_assignments,
            commands::get_assignment,
            commands::update_rubric,
            submissions::process_submissions,
            commands::get_submission_detail,
            commands::save_grade,
            commands::get_grades,
            excel::analyze_excel,
            excel::generate_excel_pdf,
            excel::parse_excel_roster,
            export::export_gradebook
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
