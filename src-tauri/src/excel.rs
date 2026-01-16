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

// --- Formula Inspection Commands ---

#[derive(Serialize)]
pub struct CellInfo {
    pub address: String,
    pub value: String,
    pub formula: Option<String>,
}

#[derive(Serialize)]
pub struct SheetFormulaMap {
    pub sheet_name: String,
    pub cells: Vec<CellInfo>,
    pub formula_count: usize,
    pub functions_used: Vec<String>,
}

#[derive(Serialize)]
pub struct FormulaMapResult {
    pub sheets: Vec<SheetFormulaMap>,
    pub total_formula_count: usize,
    pub has_pivot: bool,
    pub hidden_sheets: Vec<String>,
}

/// Get formula map for all cells in a workbook
#[tauri::command]
pub async fn get_formula_map(
    pool: State<'_, DbPool>,
    submission_id: String,
    file_path: String,
) -> Result<FormulaMapResult, String> {
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
    let mut sheets = Vec::new();
    let mut total_formula_count = 0;
    
    for sheet_name in &sheet_names {
        // Get formulas for this sheet
        let formulas = excel.worksheet_formula(sheet_name)
            .map_err(|e| e.to_string())?;
        
        // Get values for this sheet
        let range = excel.worksheet_range(sheet_name)
            .map_err(|e| e.to_string())?;
        
        let mut cells = Vec::new();
        let mut formula_count = 0;
        let mut functions_set: std::collections::HashSet<String> = std::collections::HashSet::new();
        
        // Build cell info with formulas
        for (row_idx, row) in range.rows().enumerate() {
            for (col_idx, cell) in row.iter().enumerate() {
                let col_letter = col_to_letter(col_idx);
                let address = format!("{}{}", col_letter, row_idx + 1);
                
                // Check if this cell has a formula
                let formula = formulas.get((row_idx, col_idx))
                    .map(|f| f.to_string());
                
                if let Some(ref f) = formula {
                    formula_count += 1;
                    // Extract function names from formula
                    extract_functions(f, &mut functions_set);
                }
                
                // Only include cells with content or formulas
                let value = cell.to_string();
                if !value.is_empty() || formula.is_some() {
                    cells.push(CellInfo {
                        address,
                        value,
                        formula,
                    });
                }
            }
        }
        
        total_formula_count += formula_count;
        
        sheets.push(SheetFormulaMap {
            sheet_name: sheet_name.clone(),
            cells,
            formula_count,
            functions_used: functions_set.into_iter().collect(),
        });
    }
    
    Ok(FormulaMapResult {
        sheets,
        total_formula_count,
        has_pivot: false, // Would need deeper inspection
        hidden_sheets: vec![], // Would need workbook metadata
    })
}

fn col_to_letter(col: usize) -> String {
    let mut result = String::new();
    let mut n = col;
    loop {
        result.insert(0, (b'A' + (n % 26) as u8) as char);
        if n < 26 {
            break;
        }
        n = n / 26 - 1;
    }
    result
}

fn extract_functions(formula: &str, functions: &mut std::collections::HashSet<String>) {
    // Simple regex-like extraction of function names
    let common_functions = [
        "SUM", "SUMIF", "SUMIFS", "AVERAGE", "AVERAGEIF", "AVERAGEIFS",
        "COUNT", "COUNTIF", "COUNTIFS", "COUNTA", "COUNTBLANK",
        "IF", "IFS", "IFERROR", "IFNA",
        "VLOOKUP", "HLOOKUP", "XLOOKUP", "INDEX", "MATCH",
        "MAX", "MIN", "MAXIFS", "MINIFS",
        "LEFT", "RIGHT", "MID", "LEN", "TRIM", "SUBSTITUTE", "CONCATENATE", "TEXTJOIN",
        "DATE", "YEAR", "MONTH", "DAY", "TODAY", "NOW",
        "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS",
        "AND", "OR", "NOT",
        "FILTER", "SORT", "UNIQUE", "SEQUENCE",
    ];
    
    let upper = formula.to_uppercase();
    for func in common_functions {
        if upper.contains(&format!("{}(", func)) {
            functions.insert(func.to_string());
        }
    }
}

#[derive(Serialize, serde::Deserialize)]
pub struct RangeCheck {
    pub range: String,       // e.g., "D2:D25"
    pub sheet: Option<String>,
    pub check_type: String,  // "must_have_formulas", "must_be_numeric", etc.
    pub description: String,
}

#[derive(Serialize)]
pub struct RangeCheckResult {
    pub range: String,
    pub check_type: String,
    pub passed: bool,
    pub details: String,
}

/// Run rubric-linked formula checks on specified ranges
#[tauri::command]
pub async fn run_formula_checks(
    pool: State<'_, DbPool>,
    submission_id: String,
    file_path: String,
    checks: Vec<RangeCheck>,
) -> Result<Vec<RangeCheckResult>, String> {
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
    
    let mut results = Vec::new();
    
    for check in checks {
        let sheet_name = check.sheet.clone().unwrap_or_else(|| {
            excel.sheet_names().first().cloned().unwrap_or_default()
        });
        
        let formulas = excel.worksheet_formula(&sheet_name)
            .map_err(|e| e.to_string())?;
        
        // Parse range like "D2:D25"
        let (start_row, start_col, end_row, end_col) = parse_range(&check.range)?;
        
        let mut formula_count = 0;
        let mut total_cells = 0;
        
        for row in start_row..=end_row {
            for col in start_col..=end_col {
                total_cells += 1;
                if formulas.get((row as usize, col as usize)).is_some() {
                    formula_count += 1;
                }
            }
        }
        
        let (passed, details) = match check.check_type.as_str() {
            "must_have_formulas" => {
                let ratio = formula_count as f64 / total_cells as f64;
                (ratio >= 0.8, format!("{}/{} cells have formulas ({:.0}%)", formula_count, total_cells, ratio * 100.0))
            },
            "all_formulas" => {
                (formula_count == total_cells, format!("{}/{} cells have formulas", formula_count, total_cells))
            },
            "no_formulas" => {
                (formula_count == 0, format!("{} cells have formulas (expected 0)", formula_count))
            },
            _ => (true, "Unknown check type".to_string()),
        };
        
        results.push(RangeCheckResult {
            range: check.range,
            check_type: check.check_type,
            passed,
            details,
        });
    }
    
    Ok(results)
}

fn parse_range(range: &str) -> Result<(u32, u32, u32, u32), String> {
    // Parse "D2:D25" into (row_start, col_start, row_end, col_end)
    let parts: Vec<&str> = range.split(':').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid range format: {}", range));
    }
    
    let (start_col, start_row) = parse_cell_ref(parts[0])?;
    let (end_col, end_row) = parse_cell_ref(parts[1])?;
    
    Ok((start_row, start_col, end_row, end_col))
}

fn parse_cell_ref(cell: &str) -> Result<(u32, u32), String> {
    let mut col_part = String::new();
    let mut row_part = String::new();
    
    for c in cell.chars() {
        if c.is_alphabetic() {
            col_part.push(c.to_ascii_uppercase());
        } else if c.is_numeric() {
            row_part.push(c);
        }
    }
    
    if col_part.is_empty() || row_part.is_empty() {
        return Err(format!("Invalid cell reference: {}", cell));
    }
    
    // Convert column letters to index (A=0, B=1, ..., Z=25, AA=26, etc.)
    let mut col_idx = 0u32;
    for c in col_part.chars() {
        col_idx = col_idx * 26 + (c as u32 - 'A' as u32 + 1);
    }
    col_idx -= 1; // 0-indexed
    
    let row_idx: u32 = row_part.parse::<u32>().map_err(|_| "Invalid row number")? - 1; // 0-indexed
    
    Ok((col_idx, row_idx))
}
