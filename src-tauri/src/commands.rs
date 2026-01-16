use crate::db::DbPool;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::{State, AppHandle};
use uuid::Uuid;

#[derive(Serialize, FromRow)]
pub struct Course {
    id: String,
    name: String,
    term: String,
    created_at: String, // String for simplicity in JSON, sqlite stores likely as TEXT/DATETIME
}

#[derive(Serialize, FromRow)]
pub struct Ta {
    id: String,
    display_name: String,
    initials: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateStudent {
    student_id: String,
    name: String,
    email: Option<String>,
    section: Option<String>,
}

#[tauri::command]
pub async fn save_roster(
    pool: State<'_, DbPool>,
    course_id: String,
    students: Vec<CreateStudent>,
) -> Result<usize, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Clear existing roster? "Imports a course roster once... reuses it". 
    // Requirement "Roster import...". Usually M1 is simple import.
    // Let's assume append or overwrite? "Reuse" implies persistence.
    // I'll assume I should insert and ignore duplicates or just insert.
    // For M1, let's just insert.
    
    let mut count = 0;
    for s in students {
        sqlx::query("INSERT OR REPLACE INTO students (course_id, student_id, name, email, section) VALUES (?, ?, ?, ?, ?)")
            .bind(&course_id)
            .bind(&s.student_id)
            .bind(&s.name)
            .bind(&s.email)
            .bind(&s.section)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        count += 1;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(count)
}


#[tauri::command]
pub async fn create_course(
    pool: State<'_, DbPool>,
    name: String,
    term: String,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO courses (id, name, term) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(&term)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub async fn list_courses(pool: State<'_, DbPool>) -> Result<Vec<Course>, String> {
    let courses = sqlx::query_as::<sqlx::Sqlite, Course>("SELECT id, name, term, created_at FROM courses ORDER BY created_at DESC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(courses)
}

#[tauri::command]
pub async fn create_ta(
    pool: State<'_, DbPool>,
    display_name: String,
    initials: String,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO tas (id, display_name, initials) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&display_name)
        .bind(&initials)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub async fn list_tas(pool: State<'_, DbPool>) -> Result<Vec<Ta>, String> {
    let tas = sqlx::query_as::<sqlx::Sqlite, Ta>("SELECT id, display_name, initials FROM tas ORDER BY display_name ASC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(tas)
}
#[derive(Serialize, FromRow)]
pub struct Assignment {
    pub id: String,
    pub course_id: String,
    pub title: String,
    pub due_date: Option<String>,
    pub rubric_json: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Rubric {
    questions: Vec<Question>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Question {
    question_id: String,
    title: String,
    max_points: f64,
    description: Option<String>,
    comment_presets: Vec<CommentPreset>,
    excel_checks: Option<Vec<ExcelCheck>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CommentPreset {
    label: String,
    text: String,
    deduction: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum ExcelCheck {
    #[serde(rename = "range_must_have_formulas")]
    RangeMustHaveFormulas { sheet: String, range: String },
    #[serde(rename = "must_use_functions")]
    MustUseFunctions { functions: Vec<String> },
    #[serde(rename = "must_have_pivot")]
    MustHavePivot,
}

#[tauri::command]
pub async fn create_assignment(
    pool: State<'_, DbPool>,
    course_id: String,
    title: String,
    due_date: Option<String>,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO assignments (id, course_id, title, due_date) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&course_id)
        .bind(&title)
        .bind(&due_date)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub async fn list_assignments(pool: State<'_, DbPool>, course_id: String) -> Result<Vec<Assignment>, String> {
    let assignments = sqlx::query_as::<sqlx::Sqlite, Assignment>(
        "SELECT id, course_id, title, due_date, rubric_json, created_at FROM assignments WHERE course_id = ? ORDER BY created_at DESC"
    )
    .bind(course_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(assignments)
}

#[tauri::command]
pub async fn get_assignment(pool: State<'_, DbPool>, id: String) -> Result<Assignment, String> {
    let assignment = sqlx::query_as::<sqlx::Sqlite, Assignment>(
        "SELECT id, course_id, title, due_date, rubric_json, created_at FROM assignments WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Assignment not found")?;
    Ok(assignment)
}

#[tauri::command]
pub async fn update_rubric(
    pool: State<'_, DbPool>,
    assignment_id: String,
    rubric_json: String, // Expecting valid JSON string
) -> Result<(), String> {
    // Validate JSON structure simply
    let _rubric: Rubric = serde_json::from_str(&rubric_json).map_err(|e| format!("Invalid Rubric JSON: {}", e))?;

    sqlx::query("UPDATE assignments SET rubric_json = ? WHERE id = ?")
        .bind(&rubric_json)
        .bind(&assignment_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[derive(Serialize, Debug)]
pub struct SubmissionDetail {
    submission_id: String,
    student_id: Option<String>,
    student_name: Option<String>,
    status: String,
    files: Vec<FileInfo>,
}

#[derive(Serialize, Debug)]
pub struct FileInfo {
    path: String, // Relative path in cache
    name: String,
    is_dir: bool,
}

#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct GradeRecord {
    id: i64, // Auto increment
    submission_id: String,
    question_id: String,
    score: Option<f64>,
    comment: Option<String>,
}

#[tauri::command]
pub async fn get_submission_detail(
    pool: State<'_, DbPool>,
    submission_id: String,
) -> Result<SubmissionDetail, String> {
    // 1. Get stats
    let row: (Option<String>, Option<String>, String, String) = sqlx::query_as(
        r#"
        SELECT s.student_id, st.name, s.status, s.folder_path
        FROM submissions s
        LEFT JOIN students st ON s.student_id = st.student_id AND s.course_id = (SELECT course_id FROM assignments WHERE id = s.assignment_id)
        WHERE s.id = ?
        "#
    )
    .bind(&submission_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Submission not found")?;

    let (student_id, student_name, status, folder_path) = row;

    // 2. Walk dir for files
    let mut files = Vec::new();
    let root = std::path::Path::new(&folder_path);
    if root.exists() {
        for entry in walkdir::WalkDir::new(root) {
            if let Ok(e) = entry {
                let p = e.path();
                if p.is_file() {
                    if let Ok(rel) = p.strip_prefix(root) {
                         files.push(FileInfo {
                             path: rel.to_string_lossy().to_string(),
                             name: p.file_name().unwrap().to_string_lossy().to_string(),
                             is_dir: false
                         });
                    }
                }
            }
        }
    }

    Ok(SubmissionDetail {
        submission_id,
        student_id,
        student_name,
        status,
        files
    })
}

#[tauri::command]
pub async fn save_grade(
    pool: State<'_, DbPool>,
    submission_id: String,
    question_id: String,
    score: Option<f64>,
    comment: Option<String>,
) -> Result<(), String> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM grades WHERE submission_id = ? AND question_id = ?")
        .bind(&submission_id)
        .bind(&question_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(id) = exists {
        sqlx::query("UPDATE grades SET score = ?, comment = ? WHERE id = ?")
            .bind(score)
            .bind(comment)
            .bind(id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        sqlx::query("INSERT INTO grades (submission_id, question_id, score, comment) VALUES (?, ?, ?, ?)")
            .bind(&submission_id)
            .bind(&question_id)
            .bind(score)
            .bind(comment)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_grades(
    pool: State<'_, DbPool>,
    submission_id: String,
) -> Result<Vec<GradeRecord>, String> {
    let grades = sqlx::query_as::<sqlx::Sqlite, GradeRecord>(
        "SELECT id, submission_id, question_id, score, comment FROM grades WHERE submission_id = ?"
    )
    .bind(submission_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(grades)
}

/// Read a file's content from a submission
#[tauri::command]
pub async fn read_submission_file(
    pool: State<'_, DbPool>,
    submission_id: String,
    file_path: String,
) -> Result<String, String> {
    let folder_path: String = sqlx::query_scalar("SELECT folder_path FROM submissions WHERE id = ?")
        .bind(&submission_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let full_path = std::path::Path::new(&folder_path).join(&file_path);
    
    if !full_path.exists() {
        return Err("File not found".to_string());
    }
    
    std::fs::read_to_string(&full_path).map_err(|e| e.to_string())
}
