
export interface Rubric {
    questions: Question[];
}

export interface Question {
    question_id: string;
    title: string;
    max_points: number;
    description?: string;
    comment_presets: CommentPreset[];
}

export interface CommentPreset {
    label: string;
    text: string;
    deduction?: number;
}

export interface GradeRecord {
    id: number;
    question_id: string;
    score: number | null;
    comment: string | null;
}

interface Props {
    rubric: Rubric | null;
    grades: GradeRecord[];
    onSave: (qId: string, score: number | null, comment: string | null) => void;
}

import { useState } from "react";

export default function ScoringPanel({ rubric, grades, onSave }: Props) {
    // We could have "Active Question" Step
    const [activeQIndex, setActiveQIndex] = useState(0);

    if (!rubric) return <div style={{ padding: 10 }}>No Rubric Loaded</div>;

    const question = rubric.questions[activeQIndex];
    const grade = grades.find(g => g.question_id === question.question_id);

    // Local state for editing before save? Or direct?
    // Direct for simplicity

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 10, borderBottom: '1px solid #eee' }}>
                <button disabled={activeQIndex === 0} onClick={() => setActiveQIndex(activeQIndex - 1)}>Prev</button>
                <span style={{ margin: '0 10px' }}>Question {activeQIndex + 1} / {rubric.questions.length}</span>
                <button disabled={activeQIndex === rubric.questions.length - 1} onClick={() => setActiveQIndex(activeQIndex + 1)}>Next</button>
            </div>

            <div style={{ flex: 1, padding: 10, overflowY: 'auto' }}>
                <h3>{question.title} ({question.max_points} pts)</h3>
                <p style={{ color: '#666' }}>{question.description}</p>

                <div style={{ marginTop: 20 }}>
                    <label>Score:</label>
                    <input
                        type="number"
                        value={grade?.score ?? ""}
                        onChange={(e) => onSave(question.question_id, e.target.value ? parseFloat(e.target.value) : null, grade?.comment || "")}
                        style={{ width: 60, marginLeft: 10 }}
                    />
                </div>

                <div style={{ marginTop: 20 }}>
                    <label>Comment:</label><br />
                    <textarea
                        value={grade?.comment || ""}
                        onChange={(e) => onSave(question.question_id, grade?.score ?? null, e.target.value)}
                        rows={4}
                        style={{ width: '100%' }}
                    />
                </div>

                {question.comment_presets.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                        <small>Presets:</small>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {question.comment_presets.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        // Append or replace? Append usually.
                                        const newComment = (grade?.comment ? grade.comment + "\n" : "") + p.text;
                                        // Deduction logic?
                                        const currentScore = grade?.score ?? question.max_points;
                                        const newScore = p.deduction ? currentScore - p.deduction : currentScore;
                                        onSave(question.question_id, newScore, newComment);
                                    }}
                                    title={p.text}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
