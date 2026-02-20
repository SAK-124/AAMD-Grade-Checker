import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link } from "react-router-dom";
import DarkModeToggle from "./DarkModeToggle";

interface Course {
    id: string;
    name: string;
    term: string;
}

export default function Dashboard() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        loadCourses();
    }, []);

    useEffect(() => {
        document.body.classList.toggle("dark-mode", isDarkMode);

        return () => {
            document.body.classList.remove("dark-mode");
        };
    }, [isDarkMode]);

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
            <div className="dashboard-header">
                <h1>Courses</h1>
                <DarkModeToggle checked={isDarkMode} onChange={setIsDarkMode} />
            </div>
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
