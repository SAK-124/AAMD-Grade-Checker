import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useParams } from "react-router-dom";
// import Papa from "papaparse"; // Unused
// @ts-ignore
import { open } from "@tauri-apps/plugin-dialog";

export default function RosterUpload() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    // const [file, setFile] = useState<File | null>(null); // Unused
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState({
        student_id: "",
        name: "",
        email: "",
        section: ""
    });

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Roster', extensions: ['csv', 'xlsx'] }]
            });

            if (selected) {
                const path = Array.isArray(selected) ? selected[0] : selected;
                if (!path) return;

                // setFile(null); // Unused

                if (path.endsWith(".xlsx")) {
                    const res = await invoke<{ headers: string[], data: any[] }>("parse_excel_roster", { filePath: path });
                    setHeaders(res.headers);
                    setParsedData(res.data);
                } else {
                    alert("For CSV, please use the standard file input below (if available) or convert to Excel.");
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    // New State
    const [parsedData, setParsedData] = useState<any[]>([]);

    const finalUpload = async () => {
        if (parsedData.length === 0) return;

        const students = parsedData.map((row: any) => ({
            student_id: row[mapping.student_id] || "",
            name: row[mapping.name] || "",
            email: row[mapping.email] || null,
            section: row[mapping.section] || null
        })).filter((s: any) => s.student_id && s.student_id.trim() !== "");

        try {
            const count = await invoke("save_roster", {
                courseId: courseId,
                students
            });
            alert(`Success! Imported ${count} students.`);
            navigate("/");
        } catch (e) {
            console.error(e);
            alert("Error saving roster: " + e);
        }
    }

    return (
        <div className="container">
            <h1>Upload Roster</h1>
            <div style={{ marginBottom: 20 }}>
                <button onClick={handleSelectFile}>Select Roster File (XLSX)</button>
                <div style={{ marginTop: 10, fontSize: '0.8em', color: '#666' }}>
                    Note: Only .xlsx files supported via this button. For CSV, use the underlying code logic or convert to Excel.
                </div>
            </div>

            {/* Hidden/Removed old input for clarity */}
            {/* <input type="file" accept=".csv" onChange={handleFileChange} /> */}

            {headers.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <h3>Map Columns</h3>
                    <div className="row">
                        <label>Student ID:</label>
                        <select onChange={(e) => setMapping({ ...mapping, student_id: e.target.value })}>
                            <option value="">-- Select --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>
                    <div className="row">
                        <label>Name:</label>
                        <select onChange={(e) => setMapping({ ...mapping, name: e.target.value })}>
                            <option value="">-- Select --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>
                    {/* Add email/section mapping similarly */}

                    <button onClick={finalUpload} style={{ marginTop: 20 }}>Import Roster</button>
                </div>
            )}
        </div>
    );
}
