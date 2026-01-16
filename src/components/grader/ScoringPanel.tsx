import { useState, useEffect } from "react";

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
    currentQuestionIndex?: number;
    onQuestionChange?: (index: number) => void;
    onNextQuestion?: () => void;
    onPrevQuestion?: () => void;
    onMarkDone?: () => void;
    onFlag?: () => void;
}

export default function ScoringPanel({
    rubric,
    grades,
    onSave,
    currentQuestionIndex = 0,
    onQuestionChange,
    onNextQuestion,
    onPrevQuestion,
    onMarkDone,
    onFlag
}: Props) {
    const [localScore, setLocalScore] = useState<string>("");
    const [localComment, setLocalComment] = useState<string>("");

    const question = rubric?.questions?.[currentQuestionIndex];
    const grade = question ? grades.find(g => g.question_id === question.question_id) : null;

    // Sync local state with grade when question changes
    useEffect(() => {
        if (grade) {
            setLocalScore(grade.score?.toString() ?? "");
            setLocalComment(grade.comment ?? "");
        } else if (question) {
            setLocalScore(question.max_points.toString());
            setLocalComment("");
        }
    }, [question?.question_id, grade]);

    if (!rubric) {
        return (
            <div style={{
                padding: 30,
                textAlign: 'center',
                color: '#888',
                background: '#1e1e1e',
                height: '100%'
            }}>
                <h3>No Rubric Loaded</h3>
                <p>Create a rubric for this assignment to start grading.</p>
            </div>
        );
    }

    if (!question) {
        return <div style={{ padding: 20 }}>No questions in rubric</div>;
    }

    const handleScoreChange = (value: string) => {
        setLocalScore(value);
        const numValue = value ? parseFloat(value) : null;
        onSave(question.question_id, numValue, localComment);
    };

    const handleCommentChange = (value: string) => {
        setLocalComment(value);
        onSave(question.question_id, localScore ? parseFloat(localScore) : null, value);
    };

    const applyPreset = (preset: CommentPreset) => {
        const newComment = (localComment ? localComment + "\n" : "") + preset.text;
        const currentScore = localScore ? parseFloat(localScore) : question.max_points;
        const newScore = preset.deduction ? currentScore - preset.deduction : currentScore;

        setLocalScore(newScore.toString());
        setLocalComment(newComment);
        onSave(question.question_id, newScore, newComment);
    };

    // Calculate total score across all questions
    const totalScore = rubric.questions.reduce((sum, q) => {
        const g = grades.find(gr => gr.question_id === q.question_id);
        return sum + (g?.score ?? 0);
    }, 0);
    const maxTotal = rubric.questions.reduce((sum, q) => sum + q.max_points, 0);

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#1e1e1e',
            color: '#fff'
        }}>
            {/* Question Navigator */}
            <div style={{
                padding: '10px 15px',
                borderBottom: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#252525'
            }}>
                <button
                    onClick={onPrevQuestion}
                    disabled={currentQuestionIndex === 0}
                    style={{
                        padding: '6px 12px',
                        background: currentQuestionIndex === 0 ? '#333' : '#444',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: currentQuestionIndex === 0 ? 'not-allowed' : 'pointer'
                    }}
                >
                    ← Prev
                </button>

                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold' }}>
                        Q{currentQuestionIndex + 1} / {rubric.questions.length}
                    </div>
                    <div style={{ fontSize: '0.8em', color: '#888' }}>
                        Total: {totalScore}/{maxTotal}
                    </div>
                </div>

                <button
                    onClick={onNextQuestion}
                    disabled={currentQuestionIndex === rubric.questions.length - 1}
                    style={{
                        padding: '6px 12px',
                        background: currentQuestionIndex === rubric.questions.length - 1 ? '#333' : '#4a9eff',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: currentQuestionIndex === rubric.questions.length - 1 ? 'not-allowed' : 'pointer'
                    }}
                >
                    Next →
                </button>
            </div>

            {/* Question pills */}
            <div style={{
                display: 'flex',
                gap: 5,
                padding: '8px 15px',
                borderBottom: '1px solid #333',
                overflowX: 'auto'
            }}>
                {rubric.questions.map((q, idx) => {
                    const g = grades.find(gr => gr.question_id === q.question_id);
                    const hasGrade = g && g.score !== null;
                    return (
                        <button
                            key={q.question_id}
                            onClick={() => onQuestionChange?.(idx)}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 12,
                                border: 'none',
                                background: idx === currentQuestionIndex ? '#4a9eff' : hasGrade ? '#2ecc71' : '#444',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '0.85em',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Q{idx + 1}
                        </button>
                    );
                })}
            </div>

            {/* Question Content */}
            <div style={{ flex: 1, padding: 15, overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 10px 0' }}>
                    {question.title}
                    <span style={{ color: '#4a9eff', marginLeft: 10 }}>({question.max_points} pts)</span>
                </h3>

                {question.description && (
                    <p style={{ color: '#aaa', fontSize: '0.9em', marginBottom: 20 }}>
                        {question.description}
                    </p>
                )}

                {/* Score Input */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Score:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                            type="number"
                            value={localScore}
                            onChange={(e) => handleScoreChange(e.target.value)}
                            max={question.max_points}
                            min={0}
                            step={0.5}
                            style={{
                                width: 80,
                                padding: '8px 12px',
                                fontSize: '1.2em',
                                fontWeight: 'bold',
                                borderRadius: 4,
                                border: '1px solid #444',
                                background: '#2a2a2a',
                                color: '#fff',
                                textAlign: 'center'
                            }}
                        />
                        <span style={{ color: '#888' }}>/ {question.max_points}</span>
                    </div>
                </div>

                {/* Comment */}
                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Feedback:</label>
                    <textarea
                        value={localComment}
                        onChange={(e) => handleCommentChange(e.target.value)}
                        rows={4}
                        placeholder="Add feedback for student..."
                        style={{
                            width: '100%',
                            padding: 10,
                            borderRadius: 4,
                            border: '1px solid #444',
                            background: '#2a2a2a',
                            color: '#fff',
                            resize: 'vertical'
                        }}
                    />
                </div>

                {/* Presets */}
                {question.comment_presets.length > 0 && (
                    <div>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9em', color: '#888' }}>
                            Quick Feedback:
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {question.comment_presets.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => applyPreset(p)}
                                    title={p.text + (p.deduction ? ` (-${p.deduction})` : '')}
                                    style={{
                                        padding: '5px 10px',
                                        borderRadius: 4,
                                        border: '1px solid #444',
                                        background: p.deduction ? '#5a3030' : '#303050',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '0.85em'
                                    }}
                                >
                                    {p.label} {p.deduction ? `(-${p.deduction})` : ''}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={{
                padding: '10px 15px',
                borderTop: '1px solid #333',
                display: 'flex',
                gap: 10
            }}>
                <button
                    onClick={onFlag}
                    style={{
                        padding: '8px 16px',
                        background: '#e74c3c',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: 'pointer'
                    }}
                >
                    🚩 Flag
                </button>
                <button
                    onClick={onMarkDone}
                    style={{
                        flex: 1,
                        padding: '8px 16px',
                        background: '#2ecc71',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    ✓ Mark Done & Next
                </button>
            </div>
        </div>
    );
}
