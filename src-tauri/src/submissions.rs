use crate::db::DbPool;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use sha2::{Sha256, Digest};
use zip::ZipArchive;
use regex::Regex;

#[derive(Serialize, Clone)]
pub struct ProcessResult {
    filename: String,
    status: String, // "Matched", "Unmatched", "Error", "Duplicate"
    student_id: Option<String>,
    message: Option<String>,
}

#[tauri::command]
pub async fn process_submissions(
    app: AppHandle,
    pool: State<'_, DbPool>,
    assignment_id: String,
    file_paths: Vec<String>,
) -> Result<Vec<ProcessResult>, String> {
    let mut results = Vec::new();
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data_dir.join("cache").join(&assignment_id);

    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    // Pre-fetch roster for matching
    // For now, we'll query DB inside loop or just cache it? 
    // Querying inside loop is fine for 150 students. optimized later if needed.
    
    // Regex for student ID detection (Simple patterns for now)
    // Matches 8-digit IDs, or common patterns.
    let id_regex = Regex::new(r"(\d{8})").unwrap(); 

    for path_str in file_paths {
        let path = Path::new(&path_str);
        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        
        // 1. Hash File
        let hash = match compute_sha256(&path) {
            Ok(h) => h,
            Err(e) => {
                results.push(ProcessResult {
                    filename: filename.clone(),
                    status: "Error".to_string(),
                    student_id: None,
                    message: Some(format!("Failed to hash: {}", e)),
                });
                continue;
            }
        };

        // 2. Extract
        let extraction_dir = cache_dir.join(&hash);
        if !extraction_dir.exists() {
            if let Err(e) = extract_zip(&path, &extraction_dir) {
                 results.push(ProcessResult {
                    filename: filename.clone(),
                    status: "Error".to_string(),
                    student_id: None,
                    message: Some(format!("Extraction failed: {}", e)),
                });
                continue;
            }
        }

        // 3. Match Student
        // Strategy A: Filename
        let mut matched_student_id = None;
        if let Some(caps) = id_regex.captures(&filename) {
            matched_student_id = Some(caps.get(1).unwrap().as_str().to_string());
        }

        // Strategy B: Metadata file inside zip (optional, but requested)
        if matched_student_id.is_none() {
            let metadata_path = extraction_dir.join("student_id.txt");
            if metadata_path.exists() {
                if let Ok(content) = fs::read_to_string(metadata_path) {
                    let trimmed = content.trim();
                    if id_regex.is_match(trimmed) {
                         matched_student_id = Some(trimmed.to_string());
                    }
                }
            }
        }
        
        // Strategy C: Check if this ID exists in Roster for this Course
        // We need course_id from assignment... 
        // Let's look up course_id first.
        let course_id_res: Option<String> = sqlx::query_scalar("SELECT course_id FROM assignments WHERE id = ?")
            .bind(&assignment_id)
            .fetch_optional(&*pool)
            .await
            .unwrap_or(None);
            
        let mut valid_match = false;
        if let Some(cid) = &course_id_res {
             if let Some(sid) = &matched_student_id {
                 // Verify student exists in course
                 let exists: bool = sqlx::query_scalar::<sqlx::Sqlite, i32>("SELECT 1 FROM students WHERE course_id = ? AND student_id = ?")
                    .bind(cid)
                    .bind(sid)
                    .fetch_optional(&*pool)
                    .await
                    .unwrap_or(None)
                    .is_some();
                 if exists {
                     valid_match = true;
                 } else {
                     matched_student_id = None; // ID found but not in roster -> Unmatched
                 }
             }
        }

        // 4. DB Insert
        let status = if valid_match { "Matched" } else { "Unmatched" };
        let submission_id = uuid::Uuid::new_v4().to_string();
        
        // TODO: Handle duplicates/updates. For now, simple insert.
        let insert_res = sqlx::query("INSERT INTO submissions (id, assignment_id, student_id, submitted_at, status, folder_path) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(&submission_id)
            .bind(&assignment_id)
            .bind(&matched_student_id)
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(status)
            .bind(extraction_dir.to_string_lossy().to_string())
            .execute(&*pool)
            .await;
            
        if let Err(e) = insert_res {
             results.push(ProcessResult {
                filename,
                status: "Error".to_string(),
                student_id: matched_student_id,
                message: Some(format!("DB Error: {}", e)),
            });
        } else {
            results.push(ProcessResult {
                filename,
                status: status.to_string(),
                student_id: matched_student_id,
                message: None,
            });
        }
    }

    Ok(results)
}

fn compute_sha256(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 { break; }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn extract_zip(zip_path: &Path, out_dir: &Path) -> io::Result<()> {
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => out_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = File::create(&outpath)?;
            io::copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}
