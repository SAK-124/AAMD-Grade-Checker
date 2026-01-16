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
