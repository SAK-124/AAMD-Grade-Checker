import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
// @ts-ignore
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import StudentQueue, { StudentQueueItem } from "./grader/StudentQueue";
import FileViewer, { FileInfo } from "./grader/FileViewer";
import ScoringPanel, { GradeRecord, Rubric } from "./grader/ScoringPanel";

interface Assignment {
    id: string;
    course_id: string;
    rubric_json: string | null;
    title: string;
}

interface SubmissionFromBackend {
    id: string;
    student_id: string | null;
    student_name: string | null;
    status: string;
    claimed_by_ta_id: string | null;
    claimed_by_name: string | null;
}

export default function GraderWorkspace() {
    const { courseId, assignmentId } = useParams();
    const [students, setStudents] = useState<StudentQueueItem[]>([]);
    const [currentSubId, setCurrentSubId] = useState<string | null>(null);
    const [currentFiles, setCurrentFiles] = useState<FileInfo[]>([]);
    const [rubric, setRubric] = useState<Rubric | null>(null);
    const [grades, setGrades] = useState<GradeRecord[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);

    // Question navigation
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

    // Grading mode: 'student-first' or 'question-first'
    const [gradingMode, setGradingMode] = useState<'student-first' | 'question-first'>('student-first');

    // Current TA (would come from app state/context in real app)
    const [currentTaId] = useState<string>("ta-1"); // Placeholder

    // Search
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (assignmentId) {
            loadAssignment();
            loadSubmissions();
        }
    }, [assignmentId]);

    useEffect(() => {
        if (currentSubId) {
            claimAndLoad(currentSubId);
        }
    }, [currentSubId]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if typing in input
            if ((e.target as HTMLElement).tagName === 'INPUT' ||
                (e.target as HTMLElement).tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'n': // Next
                    if (e.shiftKey) {
                        nextStudent();
                    } else {
                        nextQuestion();
                    }
                    break;
                case 'p': // Previous
                    if (e.shiftKey) {
                        prevStudent();
                    } else {
                        prevQuestion();
                    }
                    break;
                case 'f': // Flag
                    flagCurrentSubmission();
                    break;
                case 'd': // Done
                    markDone();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSubId, currentQuestionIndex, students, rubric]);

    async function loadAssignment() {
        if (!assignmentId) return;
        try {
            const a = await invoke<Assignment>("get_assignment", { id: assignmentId });
            setAssignment(a);
            if (a.rubric_json) {
                setRubric(JSON.parse(a.rubric_json));
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function loadSubmissions() {
        if (!assignmentId) return;
        try {
            const subs = await invoke<SubmissionFromBackend[]>("list_submissions", {
                assignmentId
            });
            setStudents(subs.map(s => ({
                submission_id: s.id,
                student_id: s.student_id,
                student_name: s.student_name || s.student_id || "Unknown",
                status: s.status,
                claimed_by: s.claimed_by_name,
            })));
        } catch (e) {
            console.error("Failed to load submissions:", e);
        }
    }

    async function claimAndLoad(subId: string) {
        try {
            // Claim submission
            await invoke("claim_submission", {
                submissionId: subId,
                taId: currentTaId
            });

            // Touch for session resume
            await invoke("touch_submission", { submissionId: subId });

            // Load details
            await loadSubmissionDetail(subId);
            await loadGrades(subId);

            // Refresh list to show claim
            loadSubmissions();
        } catch (e) {
            console.error("Failed to claim submission:", e);
            alert("Failed to claim: " + e);
        }
    }

    async function loadSubmissionDetail(subId: string) {
        try {
            const detail: any = await invoke("get_submission_detail", { submissionId: subId });
            setCurrentFiles(detail.files);
        } catch (e) {
            console.error(e);
        }
    }

    async function loadGrades(subId: string) {
        try {
            const g = await invoke<GradeRecord[]>("get_grades", { submissionId: subId });
            setGrades(g);
        } catch (e) {
            console.error(e);
        }
    }

    const handleSaveGrade = async (qId: string, score: number | null, comment: string | null) => {
        if (!currentSubId) return;
        try {
            await invoke("save_grade", {
                submissionId: currentSubId,
                questionId: qId,
                score,
                comment
            });
            loadGrades(currentSubId);
        } catch (e) {
            alert("Failed to save: " + e);
        }
    };

    // Navigation functions
    const nextQuestion = useCallback(() => {
        if (!rubric?.questions) return;
        if (currentQuestionIndex < rubric.questions.length - 1) {
            setCurrentQuestionIndex(i => i + 1);
        } else if (gradingMode === 'student-first') {
            // Move to next student
            nextStudent();
            setCurrentQuestionIndex(0);
        }
    }, [rubric, currentQuestionIndex, gradingMode]);

    const prevQuestion = useCallback(() => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(i => i - 1);
        }
    }, [currentQuestionIndex]);

    const nextStudent = useCallback(() => {
        const currentIdx = students.findIndex(s => s.submission_id === currentSubId);
        if (currentIdx < students.length - 1) {
            setCurrentSubId(students[currentIdx + 1].submission_id);
            setCurrentQuestionIndex(0);
        }
    }, [students, currentSubId]);

    const prevStudent = useCallback(() => {
        const currentIdx = students.findIndex(s => s.submission_id === currentSubId);
        if (currentIdx > 0) {
            setCurrentSubId(students[currentIdx - 1].submission_id);
            setCurrentQuestionIndex(0);
        }
    }, [students, currentSubId]);

    const flagCurrentSubmission = async () => {
        if (!currentSubId) return;
        try {
            await invoke("update_submission_status", {
                submissionId: currentSubId,
                status: "flagged",
                taId: currentTaId
            });
            loadSubmissions();
        } catch (e) {
            console.error(e);
        }
    };

    const markDone = async () => {
        if (!currentSubId) return;
        try {
            await invoke("update_submission_status", {
                submissionId: currentSubId,
                status: "done",
                taId: currentTaId
            });
            loadSubmissions();
            nextStudent();
        } catch (e) {
            console.error(e);
        }
    };

    // Filter students by search
    const filteredStudents = students.filter(s =>
        !searchTerm ||
        s.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.student_id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Progress stats
    const doneCount = students.filter(s => s.status === 'done').length;
    const totalCount = students.length;

    if (!assignmentId) return <div>Invalid Assignment</div>;

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
                padding: '10px 15px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#1a1a1a',
                color: '#fff'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <strong>{assignment?.title || 'Grader Workspace'}</strong>
                    <span style={{ color: '#888', fontSize: '0.9em' }}>
                        Progress: {doneCount}/{totalCount} ({totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0}%)
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <select
                        value={gradingMode}
                        onChange={(e) => setGradingMode(e.target.value as any)}
                        style={{ padding: '5px 10px' }}
                    >
                        <option value="student-first">Student-First</option>
                        <option value="question-first">Question-First</option>
                    </select>
                    <span style={{ fontSize: '0.8em', color: '#888' }}>
                        Shortcuts: N=Next Q | Shift+N=Next Student | P=Prev | F=Flag | D=Done
                    </span>
                    <Link to={`/course/${courseId}`} style={{ color: '#4a9eff' }}>Exit</Link>
                </div>
            </div>

            {/* Main workspace */}
            <div style={{ flex: 1, position: 'relative' }}>
                <PanelGroup orientation="horizontal">
                    {/* Student Queue */}
                    <Panel defaultSize={20} minSize={15}>
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}>
                            <div style={{ padding: 10, borderBottom: '1px solid #333' }}>
                                <input
                                    type="text"
                                    placeholder="Search by name/ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        borderRadius: 4,
                                        border: '1px solid #444',
                                        background: '#2a2a2a',
                                        color: '#fff'
                                    }}
                                />
                            </div>
                            <StudentQueue
                                items={filteredStudents}
                                selectedId={currentSubId}
                                onSelect={setCurrentSubId}
                            />
                        </div>
                    </Panel>

                    <PanelResizeHandle style={{ width: 5, background: '#333', cursor: 'col-resize' }} />

                    {/* File Viewer */}
                    <Panel defaultSize={50} minSize={30}>
                        {currentSubId ? (
                            <FileViewer files={currentFiles} submissionId={currentSubId} />
                        ) : (
                            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
                                <h3>Select a submission to begin grading</h3>
                                <p>Use the student queue on the left to select a submission</p>
                            </div>
                        )}
                    </Panel>

                    <PanelResizeHandle style={{ width: 5, background: '#333', cursor: 'col-resize' }} />

                    {/* Scoring Panel */}
                    <Panel defaultSize={30} minSize={20}>
                        <ScoringPanel
                            rubric={rubric}
                            grades={grades}
                            onSave={handleSaveGrade}
                            currentQuestionIndex={currentQuestionIndex}
                            onQuestionChange={setCurrentQuestionIndex}
                            onNextQuestion={nextQuestion}
                            onPrevQuestion={prevQuestion}
                            onMarkDone={markDone}
                            onFlag={flagCurrentSubmission}
                        />
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
}
