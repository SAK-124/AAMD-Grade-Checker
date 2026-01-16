import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UnmatchedSubmission {
    id: string;
    source_zip_path: string;
    folder_path: string;
    received_at: string;
    suggested_student_id: string | null;
}

interface Student {
    student_id: string;
    name: string;
}

interface Props {
    assignmentId: string;
    courseId: string;
    taId: string;
    onComplete: () => void;
}

export default function UnmatchedQueue({ assignmentId, courseId, taId, onComplete }: Props) {
    const [unmatched, setUnmatched] = useState<UnmatchedSubmission[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedStudentId, setSelectedStudentId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        loadData();
    }, [assignmentId]);

    async function loadData() {
        setLoading(true);
        try {
            const [unmatchedRes, studentsRes] = await Promise.all([
                invoke<UnmatchedSubmission[]>("get_unmatched_submissions", { assignmentId }),
                invoke<Student[]>("list_students", { courseId }) // Assuming this exists
            ]);
            setUnmatched(unmatchedRes);
            setStudents(studentsRes);
        } catch (e) {
            console.error("Failed to load data:", e);
        } finally {
            setLoading(false);
        }
    }

    const currentSubmission = unmatched[currentIndex];
    const filteredStudents = students.filter(s =>
        !searchTerm ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.student_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    async function handleMatch() {
        if (!currentSubmission || !selectedStudentId) return;
        setProcessing(true);
        try {
            await invoke("manual_match_submission", {
                submissionId: currentSubmission.id,
                studentId: selectedStudentId,
                taId
            });
            // Move to next
            if (currentIndex < unmatched.length - 1) {
                setCurrentIndex(i => i + 1);
            } else {
                onComplete();
            }
            setSelectedStudentId("");
            setSearchTerm("");
            // Reload to update list
            loadData();
        } catch (e) {
            alert("Match failed: " + e);
        } finally {
            setProcessing(false);
        }
    }

    async function handleSkip() {
        if (!currentSubmission) return;
        setProcessing(true);
        try {
            await invoke("quarantine_submission", {
                submissionId: currentSubmission.id,
                reason: "Skipped during manual resolution",
                taId
            });
            if (currentIndex < unmatched.length - 1) {
                setCurrentIndex(i => i + 1);
            } else {
                onComplete();
            }
            loadData();
        } catch (e) {
            alert("Skip failed: " + e);
        } finally {
            setProcessing(false);
        }
    }

    if (loading) {
        return (
            <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>
                Loading unmatched submissions...
            </div>
        );
    }

    if (unmatched.length === 0) {
        return (
            <div style={{
                padding: 40,
                textAlign: 'center',
                background: '#1e1e1e',
                color: '#2ecc71',
                borderRadius: 8
            }}>
                <h2>✓ All Submissions Matched!</h2>
                <p>No unmatched submissions remaining.</p>
                <button
                    onClick={onComplete}
                    style={{
                        marginTop: 20,
                        padding: '10px 20px',
                        background: '#4a9eff',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: 'pointer'
                    }}
                >
                    Continue to Grading
                </button>
            </div>
        );
    }

    return (
        <div style={{
            background: '#1e1e1e',
            color: '#fff',
            padding: 20,
            borderRadius: 8,
            maxWidth: 600,
            margin: '0 auto'
        }}>
            <h2 style={{ margin: '0 0 10px 0' }}>Resolve Unmatched Submissions</h2>
            <p style={{ color: '#888', marginBottom: 20 }}>
                {currentIndex + 1} of {unmatched.length} remaining
            </p>

            {/* Progress bar */}
            <div style={{
                height: 6,
                background: '#333',
                borderRadius: 3,
                marginBottom: 20,
                overflow: 'hidden'
            }}>
                <div style={{
                    height: '100%',
                    width: `${((currentIndex) / unmatched.length) * 100}%`,
                    background: '#4a9eff',
                    transition: 'width 0.3s'
                }} />
            </div>

            {/* Current submission info */}
            <div style={{
                background: '#252525',
                padding: 15,
                borderRadius: 6,
                marginBottom: 20
            }}>
                <div style={{ fontSize: '0.85em', color: '#888' }}>Source File:</div>
                <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {currentSubmission.source_zip_path.split('/').pop()}
                </div>
                <div style={{ fontSize: '0.85em', color: '#888', marginTop: 10 }}>Received:</div>
                <div>{new Date(currentSubmission.received_at).toLocaleString()}</div>
            </div>

            {/* Student search */}
            <div style={{ marginBottom: 15 }}>
                <input
                    type="text"
                    placeholder="Search student by name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 4,
                        border: '1px solid #444',
                        background: '#2a2a2a',
                        color: '#fff',
                        fontSize: '1em'
                    }}
                />
            </div>

            {/* Student list */}
            <div style={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid #333',
                borderRadius: 4,
                marginBottom: 20
            }}>
                {filteredStudents.slice(0, 50).map(student => (
                    <div
                        key={student.student_id}
                        onClick={() => setSelectedStudentId(student.student_id)}
                        style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            background: selectedStudentId === student.student_id ? '#3a5' : 'transparent',
                            borderBottom: '1px solid #333',
                            display: 'flex',
                            justifyContent: 'space-between'
                        }}
                    >
                        <span>{student.name}</span>
                        <span style={{ color: '#888' }}>{student.student_id}</span>
                    </div>
                ))}
                {filteredStudents.length === 0 && (
                    <div style={{ padding: 15, textAlign: 'center', color: '#888' }}>
                        No matching students found
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
                <button
                    onClick={handleSkip}
                    disabled={processing}
                    style={{
                        padding: '10px 20px',
                        background: '#666',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: processing ? 'not-allowed' : 'pointer'
                    }}
                >
                    Skip / Quarantine
                </button>
                <button
                    onClick={handleMatch}
                    disabled={!selectedStudentId || processing}
                    style={{
                        flex: 1,
                        padding: '10px 20px',
                        background: selectedStudentId ? '#2ecc71' : '#444',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: !selectedStudentId || processing ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    {processing ? 'Processing...' : 'Match & Continue →'}
                </button>
            </div>
        </div>
    );
}
