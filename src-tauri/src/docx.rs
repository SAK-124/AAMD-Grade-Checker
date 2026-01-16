use tauri::State;
use crate::db::DbPool;
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
pub struct DocxConversionResult {
    pub pdf_path: String,
    pub success: bool,
}

/// Convert DOCX to PDF using LibreOffice headless
#[tauri::command]
pub async fn convert_docx_pdf(
    pool: State<'_, DbPool>,
    submission_id: String,
    file_path: String,
) -> Result<String, String> {
    // Get folder path from submission
    let folder_path: String = sqlx::query_scalar("SELECT folder_path FROM submissions WHERE id = ?")
        .bind(&submission_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let full_path = Path::new(&folder_path).join(&file_path);
    
    if !full_path.exists() {
        return Err("File not found".to_string());
    }
    
    let output_dir = full_path.parent().unwrap();
    
    // Use LibreOffice to convert
    let output = Command::new("soffice")
        .arg("--headless")
        .arg("--convert-to")
        .arg("pdf")
        .arg(&full_path)
        .arg("--outdir")
        .arg(output_dir)
        .output()
        .map_err(|e| format!("Failed to run LibreOffice: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("LibreOffice conversion failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    // Return the PDF filename
    let file_stem = full_path.file_stem().unwrap().to_string_lossy();
    let pdf_name = format!("{}.pdf", file_stem);
    
    Ok(pdf_name)
}
