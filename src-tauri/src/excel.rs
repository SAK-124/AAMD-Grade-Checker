use tauri::{AppHandle, Manager, State};
use crate::db::DbPool;
use calamine::{Reader, Xlsx, open_workbook, Data, Error as CalamineError};
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::collections::HashMap;
use std::io::BufReader;
use std::fs::File;

#[derive(Serialize)]
pub struct WorkbookAnalysis {
    sheets: Vec<String>,
    formulas_count: usize,
    has_pivot: bool, 
}

#[tauri::command]
pub async fn analyze_excel(
    _app: AppHandle,
    pool: State<'_, DbPool>,
    submission_id: String,
    file_path: String, 
) -> Result<WorkbookAnalysis, String> {
    let folder_path: String = sqlx::query_scalar("SELECT folder_path FROM submissions WHERE id = ?")
        .bind(&submission_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let full_path = Path::new(&folder_path).join(&file_path);
    
    if !full_path.exists() {
        return Err("File not found".to_string());
    }

    let file = File::open(&full_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut excel: Xlsx<BufReader<File>> = Xlsx::new(reader).map_err(|e| e.to_string())?;
    
    let sheet_names = excel.sheet_names().to_vec();
    
    Ok(WorkbookAnalysis {
        sheets: sheet_names,
        formulas_count: 0, 
        has_pivot: false
    })
}

#[tauri::command]
pub async fn generate_excel_pdf(
    _app: AppHandle,
    pool: State<'_, DbPool>,
    submission_id: String,
    file_path: String,
) -> Result<String, String> {
     let folder_path: String = sqlx::query_scalar("SELECT folder_path FROM submissions WHERE id = ?")
        .bind(&submission_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let full_path = Path::new(&folder_path).join(&file_path);
    let output_dir = full_path.parent().unwrap();
    
    let output = Command::new("soffice")
        .arg("--headless")
        .arg("--convert-to")
        .arg("pdf")
        .arg(&full_path)
        .arg("--outdir")
        .arg(output_dir)
        .output()
        .map_err(|e| format!("Failed to run libreoffice: {}", e))?;
        
    if !output.status.success() {
        return Err(format!("LibreOffice failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    let file_stem = full_path.file_stem().unwrap().to_string_lossy();
    let pdf_name = format!("{}.pdf", file_stem);
    
    Ok(pdf_name)
}

#[derive(Serialize)]
pub struct ExcelParseResult {
    headers: Vec<String>,
    data: Vec<HashMap<String, String>>,
}

#[tauri::command]
pub async fn parse_excel_roster(
    file_path: String,
) -> Result<ExcelParseResult, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let file = File::open(&path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut excel: Xlsx<BufReader<File>> = Xlsx::new(reader).map_err(|e| e.to_string())?;
    
    let sheet_name = excel.sheet_names().first().ok_or("No sheets found")?.clone();
    
    // Compiler said Result has no ok_or, so worksheet_range returns Result directly.
    let range = excel.worksheet_range(&sheet_name).map_err(|e| e.to_string())?;
    
    let mut rows = range.rows();
    
    let headers_row = rows.next().ok_or("Empty sheet")?;
    
    // Explicit type annotation using Data enum
    let headers: Vec<String> = headers_row.iter().map(|c: &Data| c.to_string()).collect();
    
    let mut data = Vec::new();
    for row in rows {
        let mut row_map = HashMap::new();
        // row is &[Data]
        for (i, cell) in row.iter().enumerate() {
            if i < headers.len() {
                // cell is &Data
                row_map.insert(headers[i].clone(), cell.to_string());
            }
        }
        data.push(row_map);
    }
    
    Ok(ExcelParseResult {
        headers,
        data
    })
}
