import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useParams, useNavigate } from "react-router-dom";

interface ProcessResult {
    filename: string;
    status: string;
    student_id: string | null;
    message: string | null;
}

export default function ImportSubmissions() {
    const { courseId, assignmentId } = useParams(); // Need assignmentId
    // @ts-ignore
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);
    const [results, setResults] = useState<ProcessResult[]>([]);

    if (!courseId) return null; // Avoid unused variable check

    const [dragActive, setDragActive] = useState(false);

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (!assignmentId) return;

        const paths: string[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const f = e.dataTransfer.files[i] as any;
            if (f.name.endsWith(".zip")) { // Basic client check
                if (f.path) paths.push(f.path);
            }
        }

        if (paths.length > 0) {
            setSubmitting(true);
            try {
                const res = await invoke<ProcessResult[]>("process_submissions", {
                    assignmentId,
                    filePaths: paths
                });
                setResults(res);
            } catch (err: any) {
                alert("Error: " + err);
            }
            setSubmitting(false);
        } else {
            alert("No ZIP files found or unable to resolve paths. (Try dropping files directly)");
        }
    };

    return (
        <div className="container">
            <h1>Import Submissions</h1>
            {!assignmentId && <p className="error">No Assignment ID</p>}

            <div
                className={`drop-zone ${dragActive ? 'active' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                style={{
                    border: '2px dashed #ccc',
                    padding: 50,
                    textAlign: 'center',
                    background: dragActive ? '#eee' : '#fff'
                }}
            >
                <p>Drag and drop ZIP files here</p>
                <p>(Bulk upload supported)</p>
            </div>

            {submitting && <p>Processing... (This may take a while)</p>}

            {results.length > 0 && (
                <div style={{ marginTop: 30 }}>
                    <h3>Results</h3>
                    <table border={1} style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Status</th>
                                <th>Student ID</th>
                                <th>Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r, i) => (
                                <tr key={i} style={{ background: r.status === 'Matched' ? '#dff0d8' : '#f2dede' }}>
                                    <td>{r.filename}</td>
                                    <td>{r.status}</td>
                                    <td>{r.student_id || "-"}</td>
                                    <td>{r.message}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
