import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import ExcelInspector from "./ExcelInspector";
import FormulaInspector from "./FormulaInspector";
import { invoke } from "@tauri-apps/api/core";

export interface FileInfo {
    path: string;
    name: string;
    is_dir: boolean;
}

interface Props {
    files: FileInfo[];
    submissionId: string;
}

// File type detection
function getFileType(name: string): 'excel' | 'code' | 'pdf' | 'image' | 'docx' | 'other' {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'xlsx' || ext === 'xls') return 'excel';
    if (['py', 'r', 'rmd', 'js', 'ts', 'java', 'cpp', 'c', 'h', 'txt', 'md', 'json', 'csv', 'sql', 'html', 'css'].includes(ext)) return 'code';
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (ext === 'docx' || ext === 'doc') return 'docx';
    return 'other';
}

function getLanguage(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
        'py': 'python',
        'r': 'r',
        'rmd': 'markdown',
        'js': 'javascript',
        'ts': 'typescript',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'h': 'c',
        'txt': 'plaintext',
        'md': 'markdown',
        'json': 'json',
        'csv': 'plaintext',
        'sql': 'sql',
        'html': 'html',
        'css': 'css'
    };
    return langMap[ext] || 'plaintext';
}

export default function FileViewer({ files, submissionId }: Props) {
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>("");
    const [loadingContent, setLoadingContent] = useState(false);
    const [excelView, setExcelView] = useState<'pdf' | 'formulas'>('pdf');

    const activeFile = files.find(f => f.path === selectedPath);
    const fileType = activeFile ? getFileType(activeFile.name) : 'other';

    // Load file content when selection changes
    useEffect(() => {
        if (activeFile && (fileType === 'code' || fileType === 'other')) {
            loadFileContent(activeFile.path);
        }
    }, [selectedPath, activeFile?.path]);

    async function loadFileContent(path: string) {
        setLoadingContent(true);
        try {
            const content = await invoke<string>("read_submission_file", {
                submissionId,
                filePath: path
            });
            setFileContent(content);
        } catch (e) {
            setFileContent(`Error loading file: ${e}`);
        } finally {
            setLoadingContent(false);
        }
    }

    // Group files by type for stats
    const excelFiles = files.filter(f => getFileType(f.name) === 'excel');
    const codeFiles = files.filter(f => getFileType(f.name) === 'code');

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}>
            {/* File tabs */}
            <div style={{
                background: '#252525',
                display: 'flex',
                overflowX: 'auto',
                borderBottom: '1px solid #333'
            }}>
                {files.map(f => (
                    <div
                        key={f.path}
                        onClick={() => setSelectedPath(f.path)}
                        style={{
                            padding: '8px 15px',
                            cursor: 'pointer',
                            background: f.path === selectedPath ? '#1e1e1e' : 'transparent',
                            color: f.path === selectedPath ? '#fff' : '#888',
                            borderBottom: f.path === selectedPath ? '2px solid #4a9eff' : '2px solid transparent',
                            fontSize: '0.85em',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5
                        }}
                    >
                        <span>{getFileIcon(f.name)}</span>
                        {f.name}
                    </div>
                ))}
            </div>

            {/* Content area */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {!activeFile ? (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        color: '#888'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <h3>Select a file to view</h3>
                            <p style={{ fontSize: '0.9em' }}>
                                {files.length} files available
                                {excelFiles.length > 0 && ` • ${excelFiles.length} Excel`}
                                {codeFiles.length > 0 && ` • ${codeFiles.length} Code`}
                            </p>
                        </div>
                    </div>
                ) : fileType === 'excel' ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Excel view toggle */}
                        <div style={{
                            padding: '8px 15px',
                            borderBottom: '1px solid #333',
                            display: 'flex',
                            gap: 10
                        }}>
                            <button
                                onClick={() => setExcelView('pdf')}
                                style={{
                                    padding: '5px 12px',
                                    background: excelView === 'pdf' ? '#4a9eff' : '#333',
                                    border: 'none',
                                    color: '#fff',
                                    borderRadius: 4,
                                    cursor: 'pointer'
                                }}
                            >
                                📄 PDF Preview
                            </button>
                            <button
                                onClick={() => setExcelView('formulas')}
                                style={{
                                    padding: '5px 12px',
                                    background: excelView === 'formulas' ? '#4a9eff' : '#333',
                                    border: 'none',
                                    color: '#fff',
                                    borderRadius: 4,
                                    cursor: 'pointer'
                                }}
                            >
                                📊 Formula Inspector
                            </button>
                        </div>
                        <div style={{ flex: 1 }}>
                            {excelView === 'pdf' ? (
                                <ExcelInspector
                                    submissionId={submissionId}
                                    filePath={activeFile.path}
                                    fileContent={null}
                                />
                            ) : (
                                <FormulaInspector
                                    submissionId={submissionId}
                                    filePath={activeFile.path}
                                />
                            )}
                        </div>
                    </div>
                ) : fileType === 'code' ? (
                    <div style={{ height: '100%' }}>
                        {loadingContent ? (
                            <div style={{ padding: 20, color: '#888' }}>Loading...</div>
                        ) : (
                            <Editor
                                height="100%"
                                language={getLanguage(activeFile.name)}
                                theme="vs-dark"
                                value={fileContent}
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    wordWrap: 'on'
                                }}
                            />
                        )}
                    </div>
                ) : fileType === 'pdf' ? (
                    <div style={{ height: '100%', padding: 10 }}>
                        <iframe
                            src={`file://${activeFile.path}`}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="PDF Viewer"
                        />
                    </div>
                ) : fileType === 'image' ? (
                    <div style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20
                    }}>
                        <img
                            src={`file://${activeFile.path}`}
                            alt={activeFile.name}
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        />
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>
                        <p>Preview not available for this file type.</p>
                        <button
                            onClick={() => {
                                // Open externally using Tauri opener
                                import('@tauri-apps/plugin-opener').then(m => {
                                    m.openUrl(`file://${activeFile.path}`);
                                });
                            }}
                            style={{
                                marginTop: 10,
                                padding: '8px 16px',
                                background: '#4a9eff',
                                border: 'none',
                                color: '#fff',
                                borderRadius: 4,
                                cursor: 'pointer'
                            }}
                        >
                            Open Externally
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function getFileIcon(name: string): string {
    const type = getFileType(name);
    switch (type) {
        case 'excel': return '📊';
        case 'code': return '📝';
        case 'pdf': return '📄';
        case 'image': return '🖼️';
        case 'docx': return '📃';
        default: return '📁';
    }
}
