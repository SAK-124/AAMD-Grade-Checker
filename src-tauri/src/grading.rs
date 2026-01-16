use tauri::State;
use crate::db::DbPool;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// --- Data Structures ---

#[derive(Debug, Serialize, FromRow)]
pub struct SubmissionQueueItem {
    pub id: String,
    pub student_id: Option<String>,
    pub student_name: Option<String>,
    pub status: String,
    pub claimed_by_ta_id: Option<String>,
    pub claimed_by_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SessionBookmark {
    pub submission_id: Option<String>,
    pub question_index: i32,
}

// --- Commands ---

/// List all submissions for an assignment with status and claim info
#[tauri::command]
pub async fn list_submissions(
    pool: State<'_, DbPool>,
    assignment_id: String,
) -> Result<Vec<SubmissionQueueItem>, String> {
    let items = sqlx::query_as::<sqlx::Sqlite, SubmissionQueueItem>(
        r#"
        SELECT 
            sub.id,
            sub.student_id,
            st.name as student_name,
            sub.status,
            sub.claimed_by_ta_id,
            ta.display_name as claimed_by_name
        FROM submissions sub
        LEFT JOIN students st ON sub.student_id = st.student_id 
            AND st.course_id = (SELECT course_id FROM assignments WHERE id = sub.assignment_id)
        LEFT JOIN tas ta ON sub.claimed_by_ta_id = ta.id
        WHERE sub.assignment_id = ?
        ORDER BY st.name ASC, sub.id ASC
        "#
    )
    .bind(&assignment_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(items)
}

/// Claim a submission for grading (TA lock)
#[tauri::command]
pub async fn claim_submission(
    pool: State<'_, DbPool>,
    submission_id: String,
    ta_id: String,
) -> Result<bool, String> {
    // Check if already claimed by another TA
    let current_claim: Option<String> = sqlx::query_scalar(
        "SELECT claimed_by_ta_id FROM submissions WHERE id = ?"
    )
    .bind(&submission_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();
    
    if let Some(existing) = current_claim {
        if existing != ta_id {
            return Err(format!("Submission already claimed by another TA"));
        }
        // Already claimed by this TA
        return Ok(true);
    }
    
    // Claim it
    sqlx::query(
        "UPDATE submissions SET claimed_by_ta_id = ?, claimed_at = CURRENT_TIMESTAMP, status = 'in_progress' WHERE id = ?"
    )
    .bind(&ta_id)
    .bind(&submission_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    // Log audit
    log_audit_internal(&pool, Some(&ta_id), "claim", "submission", &submission_id, None).await?;
    
    Ok(true)
}

/// Release a submission claim
#[tauri::command]
pub async fn release_submission(
    pool: State<'_, DbPool>,
    submission_id: String,
    ta_id: String,
) -> Result<bool, String> {
    // Verify ownership
    let current_claim: Option<String> = sqlx::query_scalar(
        "SELECT claimed_by_ta_id FROM submissions WHERE id = ?"
    )
    .bind(&submission_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();
    
    if let Some(existing) = &current_claim {
        if existing != &ta_id {
            return Err("Cannot release: claimed by another TA".to_string());
        }
    }
    
    sqlx::query(
        "UPDATE submissions SET claimed_by_ta_id = NULL, claimed_at = NULL WHERE id = ?"
    )
    .bind(&submission_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    log_audit_internal(&pool, Some(&ta_id), "release", "submission", &submission_id, None).await?;
    
    Ok(true)
}

/// Force takeover of a submission (admin action, logged)
#[tauri::command]
pub async fn force_claim_submission(
    pool: State<'_, DbPool>,
    submission_id: String,
    ta_id: String,
) -> Result<bool, String> {
    let prev_claim: Option<String> = sqlx::query_scalar(
        "SELECT claimed_by_ta_id FROM submissions WHERE id = ?"
    )
    .bind(&submission_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();
    
    sqlx::query(
        "UPDATE submissions SET claimed_by_ta_id = ?, claimed_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .bind(&ta_id)
    .bind(&submission_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    let details = serde_json::json!({ "previous_ta": prev_claim }).to_string();
    log_audit_internal(&pool, Some(&ta_id), "force_claim", "submission", &submission_id, Some(&details)).await?;
    
    Ok(true)
}

/// Update submission status
#[tauri::command]
pub async fn update_submission_status(
    pool: State<'_, DbPool>,
    submission_id: String,
    status: String,
    ta_id: Option<String>,
) -> Result<(), String> {
    // Validate status
    let valid = ["unstarted", "in_progress", "done", "flagged", "error"];
    if !valid.contains(&status.as_str()) {
        return Err(format!("Invalid status: {}", status));
    }
    
    sqlx::query("UPDATE submissions SET status = ? WHERE id = ?")
        .bind(&status)
        .bind(&submission_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let details = serde_json::json!({ "new_status": status }).to_string();
    log_audit_internal(&pool, ta_id.as_deref(), "status_change", "submission", &submission_id, Some(&details)).await?;
    
    Ok(())
}

/// Get session bookmark for resuming
#[tauri::command]
pub async fn get_session_bookmark(
    pool: State<'_, DbPool>,
    ta_id: String,
    assignment_id: String,
) -> Result<SessionBookmark, String> {
    // Find the last submission this TA was working on
    let last_sub: Option<String> = sqlx::query_scalar(
        r#"
        SELECT sub.id FROM submissions sub
        WHERE sub.assignment_id = ? 
          AND sub.claimed_by_ta_id = ?
          AND sub.status = 'in_progress'
        ORDER BY sub.last_opened_at DESC
        LIMIT 1
        "#
    )
    .bind(&assignment_id)
    .bind(&ta_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(SessionBookmark {
        submission_id: last_sub,
        question_index: 0, // Could store this in a separate table if needed
    })
}

/// Mark submission as last opened (for session resume)
#[tauri::command]
pub async fn touch_submission(
    pool: State<'_, DbPool>,
    submission_id: String,
) -> Result<(), String> {
    sqlx::query("UPDATE submissions SET last_opened_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&submission_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Audit Logging ---

async fn log_audit_internal(
    pool: &DbPool,
    ta_id: Option<&str>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    details: Option<&str>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO audit_log (ta_id, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(ta_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn log_audit(
    pool: State<'_, DbPool>,
    ta_id: Option<String>,
    action: String,
    entity_type: String,
    entity_id: String,
    details: Option<String>,
) -> Result<(), String> {
    log_audit_internal(&pool, ta_id.as_deref(), &action, &entity_type, &entity_id, details.as_deref()).await
}

/// Get audit log entries
#[tauri::command]
pub async fn get_audit_log(
    pool: State<'_, DbPool>,
    limit: i32,
) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query(
        "SELECT id, ts, ta_id, action, entity_type, entity_id, details_json FROM audit_log ORDER BY ts DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        use sqlx::Row;
        result.push(serde_json::json!({
            "id": row.get::<i64, _>("id"),
            "ts": row.get::<String, _>("ts"),
            "ta_id": row.get::<Option<String>, _>("ta_id"),
            "action": row.get::<String, _>("action"),
            "entity_type": row.get::<Option<String>, _>("entity_type"),
            "entity_id": row.get::<Option<String>, _>("entity_id"),
            "details": row.get::<Option<String>, _>("details_json"),
        }));
    }
    
    Ok(result)
}

// --- Session Bookmarks (Enhanced) ---

#[derive(Debug, Serialize)]
pub struct EnhancedSessionBookmark {
    pub assignment_id: String,
    pub submission_id: Option<String>,
    pub question_index: i32,
    pub last_saved_at: Option<String>,
}

/// Save session bookmark with question index
#[tauri::command]
pub async fn save_session_bookmark(
    pool: State<'_, DbPool>,
    ta_id: String,
    assignment_id: String,
    submission_id: String,
    question_index: i32,
) -> Result<(), String> {
    // Upsert into a session_bookmarks table (or use key-value approach)
    // For simplicity, we'll use the audit log with a special action type
    // OR we can create a lightweight table. Let's use a simple approach:
    // Store in submissions.notes as JSON for the TA's last position
    
    // Actually, let's just update last_opened_at and store question_index in a simple table
    // For now, we'll use the existing touch + store question_index in local storage (frontend)
    // OR we add a new column. Let's add to existing submissions table a simple approach.
    
    // Simplest: Store in audit_log with action = "session_bookmark"
    let details = serde_json::json!({
        "assignment_id": assignment_id,
        "submission_id": submission_id,
        "question_index": question_index
    }).to_string();
    
    log_audit_internal(&pool, Some(&ta_id), "session_bookmark", "session", &assignment_id, Some(&details)).await?;
    
    // Also touch the submission
    sqlx::query("UPDATE submissions SET last_opened_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&submission_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Get last session bookmark for a TA on an assignment
#[tauri::command]
pub async fn get_last_session_bookmark(
    pool: State<'_, DbPool>,
    ta_id: String,
    assignment_id: String,
) -> Result<EnhancedSessionBookmark, String> {
    // Find the most recent session_bookmark audit entry
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT entity_id, details_json FROM audit_log WHERE ta_id = ? AND action = 'session_bookmark' AND entity_id = ? ORDER BY ts DESC LIMIT 1"
    )
    .bind(&ta_id)
    .bind(&assignment_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    if let Some((_entity, details_json)) = row {
        if let Ok(details) = serde_json::from_str::<serde_json::Value>(&details_json) {
            return Ok(EnhancedSessionBookmark {
                assignment_id,
                submission_id: details["submission_id"].as_str().map(|s| s.to_string()),
                question_index: details["question_index"].as_i64().unwrap_or(0) as i32,
                last_saved_at: Some(details_json),
            });
        }
    }
    
    // Fallback to basic bookmark
    let basic = get_session_bookmark(pool.clone(), ta_id, assignment_id.clone()).await?;
    Ok(EnhancedSessionBookmark {
        assignment_id,
        submission_id: basic.submission_id,
        question_index: 0,
        last_saved_at: None,
    })
}

// --- Unmatched Queue ---

#[derive(Debug, Serialize, FromRow)]
pub struct UnmatchedSubmission {
    pub id: String,
    pub source_zip_path: String,
    pub folder_path: String,
    pub received_at: String,
    pub suggested_student_id: Option<String>,
}

/// Get all unmatched submissions for an assignment
#[tauri::command]
pub async fn get_unmatched_submissions(
    pool: State<'_, DbPool>,
    assignment_id: String,
) -> Result<Vec<UnmatchedSubmission>, String> {
    let items = sqlx::query_as::<sqlx::Sqlite, UnmatchedSubmission>(
        r#"
        SELECT id, source_zip_path, folder_path, received_at, NULL as suggested_student_id
        FROM submissions 
        WHERE assignment_id = ? AND student_id IS NULL
        ORDER BY received_at ASC
        "#
    )
    .bind(&assignment_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(items)
}

/// Manually match a submission to a student
#[tauri::command]
pub async fn manual_match_submission(
    pool: State<'_, DbPool>,
    submission_id: String,
    student_id: String,
    ta_id: String,
) -> Result<(), String> {
    // Verify student exists
    let course_id: Option<String> = sqlx::query_scalar(
        "SELECT a.course_id FROM submissions s JOIN assignments a ON s.assignment_id = a.id WHERE s.id = ?"
    )
    .bind(&submission_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    let cid = course_id.ok_or("Submission not found")?;
    
    let student_exists: bool = sqlx::query_scalar::<sqlx::Sqlite, i32>(
        "SELECT 1 FROM students WHERE course_id = ? AND student_id = ?"
    )
    .bind(&cid)
    .bind(&student_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .is_some();
    
    if !student_exists {
        return Err(format!("Student {} not found in roster", student_id));
    }
    
    // Update submission
    sqlx::query("UPDATE submissions SET student_id = ?, match_method = 'manual', match_confidence = 1.0 WHERE id = ?")
        .bind(&student_id)
        .bind(&submission_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    // Log audit
    let details = serde_json::json!({ "student_id": student_id }).to_string();
    log_audit_internal(&pool, Some(&ta_id), "manual_match", "submission", &submission_id, Some(&details)).await?;
    
    Ok(())
}

/// Skip/quarantine a submission that cannot be matched
#[tauri::command]
pub async fn quarantine_submission(
    pool: State<'_, DbPool>,
    submission_id: String,
    reason: String,
    ta_id: String,
) -> Result<(), String> {
    sqlx::query("UPDATE submissions SET status = 'error', notes = ? WHERE id = ?")
        .bind(&reason)
        .bind(&submission_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let details = serde_json::json!({ "reason": reason }).to_string();
    log_audit_internal(&pool, Some(&ta_id), "quarantine", "submission", &submission_id, Some(&details)).await?;
    
    Ok(())
}

// --- Corrupt ZIP Detection ---

#[derive(Debug, Serialize)]
pub struct ZipValidationResult {
    pub is_valid: bool,
    pub file_count: usize,
    pub total_size: u64,
    pub is_zip_bomb: bool,
    pub error_message: Option<String>,
}

/// Validate a ZIP file before processing
#[tauri::command]
pub async fn validate_zip(
    file_path: String,
) -> Result<ZipValidationResult, String> {
    use std::fs::File;
    use zip::ZipArchive;
    
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Ok(ZipValidationResult {
            is_valid: false,
            file_count: 0,
            total_size: 0,
            is_zip_bomb: false,
            error_message: Some("File not found".to_string()),
        });
    }
    
    let file = match File::open(path) {
        Ok(f) => f,
        Err(e) => return Ok(ZipValidationResult {
            is_valid: false,
            file_count: 0,
            total_size: 0,
            is_zip_bomb: false,
            error_message: Some(format!("Cannot open file: {}", e)),
        }),
    };
    
    let mut archive = match ZipArchive::new(file) {
        Ok(a) => a,
        Err(e) => return Ok(ZipValidationResult {
            is_valid: false,
            file_count: 0,
            total_size: 0,
            is_zip_bomb: false,
            error_message: Some(format!("Invalid ZIP: {}", e)),
        }),
    };
    
    let file_count = archive.len();
    let mut total_size = 0u64;
    let compressed_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(1);
    
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index_raw(i) {
            total_size += file.size();
        }
    }
    
    // Zip bomb detection: ratio of uncompressed to compressed > 100x is suspicious
    let ratio = total_size as f64 / compressed_size as f64;
    let is_zip_bomb = ratio > 100.0 || total_size > 1_000_000_000; // 1GB limit
    
    Ok(ZipValidationResult {
        is_valid: !is_zip_bomb,
        file_count,
        total_size,
        is_zip_bomb,
        error_message: if is_zip_bomb { 
            Some(format!("Potential zip bomb detected (compression ratio: {:.1}x)", ratio)) 
        } else { 
            None 
        },
    })
}

