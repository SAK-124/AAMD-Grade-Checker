-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Courses
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    term TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TAs
CREATE TABLE IF NOT EXISTS tas (
    id TEXT PRIMARY KEY, -- UUID
    display_name TEXT NOT NULL,
    initials TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Course TAs (Many-to-Many)
CREATE TABLE IF NOT EXISTS course_tas (
    course_id TEXT NOT NULL,
    ta_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'ta')),
    PRIMARY KEY (course_id, ta_id),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (ta_id) REFERENCES tas(id) ON DELETE CASCADE
);

-- Students
CREATE TABLE IF NOT EXISTS students (
    course_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    section TEXT,
    extra_json TEXT,
    PRIMARY KEY (course_id, student_id),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Assignments
CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    title TEXT NOT NULL,
    due_date DATETIME,
    rubric_json TEXT, -- JSON structure
    rubric_file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Submissions
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    student_id TEXT, -- Nullable until matched
    source_zip_path TEXT NOT NULL,
    zip_hash TEXT NOT NULL,
    received_at DATETIME NOT NULL,
    match_confidence REAL DEFAULT 0,
    match_method TEXT CHECK(match_method IN ('filename', 'metadata', 'manual', 'none')),
    status TEXT NOT NULL DEFAULT 'unstarted' CHECK(status IN ('unstarted', 'in_progress', 'done', 'flagged', 'error')),
    claimed_by_ta_id TEXT,
    claimed_at DATETIME,
    last_opened_at DATETIME,
    notes TEXT,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (claimed_by_ta_id) REFERENCES tas(id) -- Set null? or cascade? Keep history usually, so maybe SET NULL
);

-- Submission Files (extracted content)
CREATE TABLE IF NOT EXISTS submission_files (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    abs_cache_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    is_corrupt BOOLEAN DEFAULT 0,
    detected_encoding TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

-- Grades (Per Question)
CREATE TABLE IF NOT EXISTS grades (
    assignment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    score REAL DEFAULT 0,
    comment TEXT,
    rubric_selections_json TEXT,
    updated_by_ta_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (assignment_id, student_id, question_id),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    -- referencing student in course? Complex FK, usually just trust app logic or link to students table
    FOREIGN KEY (updated_by_ta_id) REFERENCES tas(id)
);

-- Grade Totals
CREATE TABLE IF NOT EXISTS grade_totals (
    assignment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    total_score REAL DEFAULT 0,
    finalized BOOLEAN DEFAULT 0,
    finalized_by_ta_id TEXT,
    finalized_at DATETIME,
    PRIMARY KEY (assignment_id, student_id),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    ta_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details_json TEXT
);

-- Formula Analysis (Excel)
CREATE TABLE IF NOT EXISTS formula_analysis (
    submission_file_id TEXT PRIMARY KEY,
    sheet_name TEXT, -- Might be per sheet? Requirement said per file, but formula count per sheet? 
    -- If per file, these fields should be json aggregation or summary. 
    -- Requirement: "formula_cell_count per sheet". So maybe this table is per sheet or stores JSON.
    -- Let's stick to the requirement list which implies one record per file? 
    -- "formula_analysis ... submission_file_id ... sheet_name". 
    -- If multiple sheets, maybe multiple rows. Let's make PK composite or UUID.
    -- Assuming one analysis summary per file for now, using JSON for details as requested "hidden_sheets_json".
    used_range TEXT,
    formula_cell_count INTEGER,
    has_pivot BOOLEAN,
    has_charts BOOLEAN,
    hidden_sheets_json TEXT, -- List of names
    hidden_rows_cols_json TEXT,
    range_formula_checks_json TEXT, -- Results
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (submission_file_id) REFERENCES submission_files(id) ON DELETE CASCADE
);
