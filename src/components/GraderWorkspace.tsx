import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
// @ts-ignore
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import StudentQueue, { StudentQueueItem } from "./grader/StudentQueue";
import FileViewer, { FileInfo } from "./grader/FileViewer";
import ScoringPanel, { GradeRecord, Rubric } from "./grader/ScoringPanel";

interface Assignment {
    id: string;
    rubric_json: string | null;
}

export default function GraderWorkspace() {
    const { courseId, assignmentId } = useParams();
    const [students, setStudents] = useState<StudentQueueItem[]>([]);

    // Silence unused lint for now
    useEffect(() => {
        console.log(setStudents);
    }, []);
    const [currentSubId, setCurrentSubId] = useState<string | null>(null);
    const [currentFiles, setCurrentFiles] = useState<FileInfo[]>([]);
    const [rubric, setRubric] = useState<Rubric | null>(null);
    const [grades, setGrades] = useState<GradeRecord[]>([]);

    useEffect(() => {
        if (assignmentId) {
            loadAssignment();
            loadSubmissions();
        }
    }, [assignmentId]);

    useEffect(() => {
        if (currentSubId) {
            loadSubmissionDetail(currentSubId);
            loadGrades(currentSubId);
        }
    }, [currentSubId]);

    async function loadAssignment() {
        if (!assignmentId) return;
        try {
            const a = await invoke<Assignment>("get_assignment", { id: assignmentId });
            if (a.rubric_json) {
                setRubric(JSON.parse(a.rubric_json));
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function loadSubmissions() {
        if (!assignmentId) return;
        // We lack a specific "list_submissions" command that returns simple list for queue
        // For now, I might have to add it or reuse "process_submissions" return type?
        // Wait, I need a new command `list_submissions` in backend.
        // Or I can use `process_submissions` if it was idempotent and returned list.
        // Let's implement `list_submissions` in backend quickly next step.
        // For now, mocking or empty.

        // Mocking for UI building
        // setStudents([
        //    { submission_id: "1", student_name: "Mock Student", status: "Matched" }
        // ]);

        // Actually, I should add `list_submissions` command.
        // I will do that in parallel.
    }

    async function loadSubmissionDetail(subId: string) {
        try {
            const detail: any = await invoke("get_submission_detail", { submissionId: subId });
            // sort files if needed
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
            // Reload grades to confirm?
            loadGrades(currentSubId);
        } catch (e) {
            alert("Failed to save: " + e);
        }
    };

    if (!assignmentId) return <div>Invalid Assignment</div>;

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 10, borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between' }}>
                <strong>Grader Workspace</strong>
                <Link to={`/course/${courseId}`}>Exit to Course</Link>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <PanelGroup orientation="horizontal">
                    <Panel defaultSize={20} minSize={15}>
                        <StudentQueue
                            items={students}
                            selectedId={currentSubId}
                            onSelect={setCurrentSubId}
                        />
                    </Panel>
                    <PanelResizeHandle style={{ width: 5, background: '#ccc', cursor: 'col-resize' }} />
                    <Panel defaultSize={50} minSize={30}>
                        {currentSubId ? (
                            <FileViewer files={currentFiles} submissionId={currentSubId} />
                        ) : (
                            <div style={{ padding: 20 }}>Select a submission</div>
                        )}
                    </Panel>
                    <PanelResizeHandle style={{ width: 5, background: '#ccc', cursor: 'col-resize' }} />
                    <Panel defaultSize={30} minSize={20}>
                        <ScoringPanel
                            rubric={rubric}
                            grades={grades}
                            onSave={handleSaveGrade}
                        />
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
}
