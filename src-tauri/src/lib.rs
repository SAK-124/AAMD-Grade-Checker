mod db;
mod commands;
mod submissions;
mod excel;
mod export;
mod grading;
mod docx;

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
            // Course & TA
            commands::create_course,
            commands::list_courses,
            commands::create_ta,
            commands::list_tas,
            commands::save_roster,
            // Assignments
            commands::create_assignment,
            commands::list_assignments,
            commands::get_assignment,
            commands::update_rubric,
            // Submissions
            submissions::process_submissions,
            commands::get_submission_detail,
            commands::read_submission_file,
            // Grading
            commands::save_grade,
            commands::get_grades,
            grading::list_submissions,
            grading::claim_submission,
            grading::release_submission,
            grading::force_claim_submission,
            grading::update_submission_status,
            grading::get_session_bookmark,
            grading::touch_submission,
            grading::log_audit,
            grading::get_audit_log,
            // Excel
            excel::analyze_excel,
            excel::generate_excel_pdf,
            excel::parse_excel_roster,
            excel::get_formula_map,
            excel::run_formula_checks,
            // DOCX
            docx::convert_docx_pdf,
            // Export
            export::export_gradebook
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
