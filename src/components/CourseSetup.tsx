import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

export default function CourseSetup() {
    const [name, setName] = useState("");
    const [term, setTerm] = useState("");
    const navigate = useNavigate();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            await invoke("create_course", { name, term });
            navigate("/");
        } catch (error) {
            console.error("Failed to create course:", error);
            alert("Error creating course: " + error);
        }
    }

    return (
        <div className="container">
            <h1>Create New Course</h1>
            <form onSubmit={handleSubmit} className="column">
                <div style={{ marginBottom: "10px" }}>
                    <label>Course Name </label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. CS101"
                        required
                    />
                </div>
                <div style={{ marginBottom: "10px" }}>
                    <label>Term </label>
                    <input
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        placeholder="e.g. Fall 2025"
                        required
                    />
                </div>
                <button type="submit">Create Course</button>
            </form>
        </div>
    );
}
