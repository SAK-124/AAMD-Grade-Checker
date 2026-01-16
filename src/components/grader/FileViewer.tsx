import { useState } from "react";
import Editor from "@monaco-editor/react";
import ExcelInspector from "./ExcelInspector";

export interface FileInfo {
    path: string;
    name: string;
    is_dir: boolean;
}

interface Props {
    files: FileInfo[];
    submissionId: string;
}

export default function FileViewer({ files, submissionId }: Props) {
    const [selectedPath, setSelectedPath] = useState<string | null>(null);

    // Filter out directories for viewing list (or show tree later)
    // For V1 List is fine? files received are flattened? Yes per backend logic.

    const activeFile = files.find(f => f.path === selectedPath);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 30, background: '#eee', display: 'flex', overflowX: 'auto' }}>
                {files.map(f => (
                    <div
                        key={f.path}
                        onClick={() => setSelectedPath(f.path)}
                        style={{
                            padding: '5px 10px',
                            cursor: 'pointer',
                            background: f.path === selectedPath ? '#fff' : '#ddd',
                            marginRight: 1,
                            fontSize: '0.9em'
                        }}
                    >
                        {f.name}
                    </div>
                ))}
            </div>
            <div style={{ flex: 1, background: '#fff', padding: 10 }}>
                {!activeFile && <div style={{ color: '#888', textAlign: 'center', marginTop: 50 }}>Select a file to view</div>}
                {activeFile && (
                    <div style={{ height: '100%' }}>
                        {activeFile.name.endsWith(".xlsx") ? (
                            <ExcelInspector submissionId={submissionId} filePath={activeFile.path} fileContent={null} />
                        ) : activeFile.name.endsWith(".txt") || activeFile.name.endsWith(".py") || activeFile.name.endsWith(".md") || activeFile.name.endsWith(".java") || activeFile.name.endsWith(".cpp") ? (
                            <Editor
                                height="100%"
                                defaultLanguage={activeFile.name.split('.').pop()} // Basic detection
                                theme="light"
                                value="// Loading content..." // We need to fetch content! backend `read_file`?
                            // We didn't enable read_file via frontend.
                            // We can use tauri-plugin-fs `readTextFile` if we have absolute path.
                            // But backend cache path is hidden? 
                            // Actually, `process_submissions` returns relative. 
                            // We need a backend command `read_submission_file(submission_id, path)`.
                            />
                        ) : (
                            <div>Preview not supported for this file type yet.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
