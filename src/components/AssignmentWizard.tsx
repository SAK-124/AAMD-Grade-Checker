import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useParams, useNavigate } from "react-router-dom";
import RubricBuilder, { RubricStructure } from "./RubricBuilder";

export default function AssignmentWizard() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [title, setTitle] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [rubric, setRubric] = useState<RubricStructure>({ questions: [] });

    async function handleFinish() {
        if (!courseId) return;
        try {
            // 1. Create Assignment
            const assignmentId = await invoke<string>("create_assignment", {
                course_id: courseId,
                title,
                due_date: dueDate || null
            });

            // 2. Save Rubric
            await invoke("update_rubric", {
                assignment_id: assignmentId,
                rubric_json: JSON.stringify(rubric)
            });

            alert("Assignment created!");
            navigate(`/course/${courseId}`);
        } catch (e) {
            console.error(e);
            alert("Error creating assignment: " + e);
        }
    }

    return (
        <div className="container">
            <h1>New Assignment</h1>
            {step === 1 && (
                <div className="column">
                    <label>Title</label>
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Homework 1" />
                    <label>Due Date</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    <button onClick={() => setStep(2)} disabled={!title}>Next: Define Rubric</button>
                </div>
            )}

            {step === 2 && (
                <div className="column full-height">
                    <RubricBuilder value={rubric} onChange={setRubric} />
                    <div className="row" style={{ marginTop: 20 }}>
                        <button onClick={() => setStep(1)}>Back</button>
                        <button onClick={handleFinish} style={{ marginLeft: 10 }}>Create Assignment</button>
                    </div>
                </div>
            )}
        </div>
    );
}
