import { v4 as uuidv4 } from 'uuid';

export interface RubricStructure {
    questions: Question[];
}

export interface Question {
    question_id: string;
    title: string;
    max_points: number;
    description?: string;
    comment_presets: CommentPreset[];
    // excel_checks omitted for simplicity in V1 UI, but structuring for it
}

export interface CommentPreset {
    label: string;
    text: string;
    deduction?: number;
}

interface Props {
    value: RubricStructure;
    onChange: (r: RubricStructure) => void;
}

export default function RubricBuilder({ value, onChange }: Props) {

    const addQuestion = () => {
        const newQ: Question = {
            question_id: uuidv4(),
            title: "New Question",
            max_points: 10,
            comment_presets: []
        };
        onChange({ ...value, questions: [...value.questions, newQ] });
    };

    const updateQuestion = (idx: number, q: Question) => {
        const qs = [...value.questions];
        qs[idx] = q;
        onChange({ ...value, questions: qs });
    };

    const removeQuestion = (idx: number) => {
        const qs = [...value.questions];
        qs.splice(idx, 1);
        onChange({ ...value, questions: qs });
    };

    return (
        <div style={{ border: '1px solid #ccc', padding: 10, borderRadius: 5 }}>
            <h3>Rubric Builder</h3>
            {value.questions.map((q, idx) => (
                <div key={q.question_id} style={{ marginBottom: 20, padding: 10, background: '#f9f9f9' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                        <input
                            value={q.title}
                            onChange={(e) => updateQuestion(idx, { ...q, title: e.target.value })}
                            placeholder="Question Title"
                            style={{ fontWeight: 'bold' }}
                        />
                        <input
                            type="number"
                            value={q.max_points}
                            onChange={(e) => updateQuestion(idx, { ...q, max_points: parseFloat(e.target.value) })}
                            width={50}
                        />
                        <button onClick={() => removeQuestion(idx)} style={{ background: 'red' }}>X</button>
                    </div>
                    <textarea
                        value={q.description || ""}
                        onChange={(e) => updateQuestion(idx, { ...q, description: e.target.value })}
                        placeholder="Description (optional)"
                        rows={2}
                        style={{ width: '100%', marginTop: 5 }}
                    />

                    {/* Presets UI could go here */}
                    <small>Preset comments: {q.comment_presets.length}</small>
                </div>
            ))}
            <button onClick={addQuestion}>+ Add Question</button>
        </div>
    );
}
