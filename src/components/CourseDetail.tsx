import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useParams, Link } from "react-router-dom";
// @ts-ignore
import { save } from "@tauri-apps/plugin-dialog";

interface Assignment {
    id: string;
    course_id: string;
    title: string;
    due_date: string | null;
    created_at: string;
}

export default function CourseDetail() {
    const { courseId } = useParams();
    const [assignments, setAssignments] = useState<Assignment[]>([]);

    useEffect(() => {
        if (courseId) {
            loadAssignments();
        }
    }, [courseId]);

    async function loadAssignments() {
        try {
            const list = await invoke<Assignment[]>("list_assignments", { course_id: courseId }); // Rust arg: course_id
            setAssignments(list);
        } catch (e) {
            console.error(e);
        }
    }

    async function handleExport(assignmentId: string, title: string) {
        try {
            const path = await save({
                defaultPath: `${title}_Grades.xlsx`,
                filters: [{ name: 'Excel', extensions: ['xlsx'] }]
            });

            if (path) {
                await invoke("export_gradebook", { assignmentId, outputPath: path });
                alert("Gradebook exported successfully!");
            }
        } catch (e) {
            console.error(e);
            alert("Export failed: " + e);
        }
    }

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Course Details</h1>
                <div>
                    <Link to={`/import-roster/${courseId}`}>
                        <button>Import Roster</button>
                    </Link>
                    <Link to={`/create-assignment/${courseId}`}>
                        <button style={{ marginLeft: 10 }}>+ New Assignment</button>
                    </Link>
                </div>
            </div>

            <h2>Assignments</h2>
            {assignments.length === 0 ? (
                <p>No assignments yet.</p>
            ) : (
                <ul className="assignment-list">
                    {assignments.map(a => (
                        <li key={a.id} className="row" style={{ justifyContent: 'space-between', border: '1px solid #ccc', padding: 10, margin: '5px 0' }}>
                            <div>
                                <strong>{a.title}</strong>
                                <br />
                                <small>Due: {a.due_date || "No date"}</small>
                            </div>
                            <div>
                                <Link to={`/import-submissions/${courseId}/${a.id}`} style={{ marginRight: 10 }}>Import Subs</Link>
                                <Link to={`/grader/${courseId}/${a.id}`} style={{ marginRight: 10 }}>Open Grader</Link>
                                <button onClick={() => handleExport(a.id, a.title)}>Export</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
