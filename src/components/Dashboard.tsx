import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link } from "react-router-dom";

interface Course {
    id: string;
    name: string;
    term: string;
}

export default function Dashboard() {
    const [courses, setCourses] = useState<Course[]>([]);

    useEffect(() => {
        loadCourses();
    }, []);

    async function loadCourses() {
        try {
            const result = await invoke<Course[]>("list_courses");
            setCourses(result);
        } catch (error) {
            console.error("Failed to load courses:", error);
        }
    }

    return (
        <div className="container">
            <h1>Courses</h1>
            <Link to="/create-course">
                <button>+ New Course</button>
            </Link>
            <div className="course-list" style={{ marginTop: "20px" }}>
                {courses.length === 0 ? (
                    <p>No courses found. Create one to get started.</p>
                ) : (
                    <ul>
                        {courses.map((c) => (
                            <li key={c.id}>
                                <strong>{c.name}</strong> ({c.term})
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
