use tauri::{AppHandle, Manager, State};
use crate::db::DbPool;
use rust_xlsxwriter::*;
use std::collections::HashMap;
use crate::commands::Assignment;
use sqlx::{FromRow, Error as SqlxError};

#[derive(Debug, FromRow)]
struct ExportGrade {
    student_id: String,
    question_id: String,
    score: Option<f64>,
    comment: Option<String>,
}

#[derive(Debug, FromRow)]
struct ExportStudent {
    student_id: String,
    name: String,
    email: Option<String>, // Make email Option as per DB
}

#[tauri::command]
pub async fn export_gradebook(
    app: AppHandle,
    pool: State<'_, DbPool>,
    assignment_id: String,
    output_path: String,
) -> Result<String, String> {
    let assignment = sqlx::query_as::<sqlx::Sqlite, Assignment>("SELECT * FROM assignments WHERE id = ?")
        .bind(&assignment_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let rubric_json = assignment.rubric_json.unwrap_or_else(|| "{}".to_string());
    let rubric: serde_json::Value = serde_json::from_str(&rubric_json).unwrap_or(serde_json::json!({}));
    let questions = rubric["questions"].as_array().unwrap_or(&vec![]).clone();

    // Use sqlx::query_as instead of query! macro
    let students = sqlx::query_as::<sqlx::Sqlite, ExportStudent>("SELECT student_id, name, email FROM students WHERE course_id = ? ORDER BY name")
        .bind(&assignment.course_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let raw_grades = sqlx::query_as::<sqlx::Sqlite, ExportGrade>(
        r#"
        SELECT sub.student_id, g.question_id, g.score, g.comment 
        FROM grades g
        JOIN submissions sub ON g.submission_id = sub.id
        WHERE sub.assignment_id = ?
        "#
    )
    .bind(&assignment_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut grade_map: HashMap<(String, String), (Option<f64>, Option<String>)> = HashMap::new();
    for g in raw_grades {
        grade_map.insert((g.student_id, g.question_id), (g.score, g.comment));
    }

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    worksheet.write_string(0, 0, "Student ID").map_err(|e| e.to_string())?;
    worksheet.write_string(0, 1, "Name").map_err(|e| e.to_string())?;
    worksheet.write_string(0, 2, "Total Score").map_err(|e| e.to_string())?;

    let mut col_idx = 3;
    for q in &questions {
        let title = q["title"].as_str().unwrap_or("Question");
        let max_pts = q["max_points"].as_f64().unwrap_or(0.0);
        
        let q_header = format!("{} ({} pts)", title, max_pts);
        worksheet.write_string(0, col_idx, &q_header).map_err(|e| e.to_string())?;
        worksheet.write_string(0, col_idx + 1, "Comments").map_err(|e| e.to_string())?;
        col_idx += 2;
    }

    for (row_idx, s) in students.iter().enumerate() {
        let r = (row_idx + 1) as u32;
        worksheet.write_string(r, 0, &s.student_id).map_err(|e| e.to_string())?;
        worksheet.write_string(r, 1, &s.name).map_err(|e| e.to_string())?;

        let mut total = 0.0;
        let mut c_idx = 3;
        
        for q in &questions {
            let q_id = q["question_id"].as_str().unwrap_or("");
            
            if let Some((score, comment)) = grade_map.get(&(s.student_id.clone(), q_id.to_string())) {
                if let Some(val) = score {
                    total += val;
                    worksheet.write_number(r, c_idx, *val).map_err(|e| e.to_string())?;
                }
                if let Some(txt) = comment {
                    worksheet.write_string(r, c_idx + 1, txt).map_err(|e| e.to_string())?;
                }
            }
            c_idx += 2;
        }
        worksheet.write_number(r, 2, total).map_err(|e| e.to_string())?;
    }

    workbook.save(&output_path).map_err(|e| e.to_string())?;

    Ok(output_path)
}
