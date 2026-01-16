import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
    submissionId: string;
    filePath: string;
    fileContent: any; // We might just pass path
}

interface Analysis {
    sheets: string[];
    formulas_count: number;
}

export default function ExcelInspector({ submissionId, filePath }: Props) {
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [pdfPath, setPdfPath] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [converting, setConverting] = useState(false);

    useEffect(() => {
        analyze();
    }, [submissionId, filePath]);

    async function analyze() {
        setLoading(true);
        try {
            const res = await invoke<Analysis>("analyze_excel", { submissionId, filePath });
            setAnalysis(res);
        } catch (e) {
            console.error("Analysis failed", e);
        }
        setLoading(false);
    }

    async function generatePdf() {
        setConverting(true);
        try {
            const pdfName = await invoke<string>("generate_excel_pdf", { submissionId, filePath });
            // The pdf is generated in the same folder.
            // We need to view it.
            // FileViewer usually handles rendering. 
            // We can tell parent we have a pdf? 
            // OR just display a link "Open PDF Preview".
            setPdfPath(pdfName);
        } catch (e) {
            alert("PDF Conversion failed: " + e);
        }
        setConverting(false);
    }

    return (
        <div style={{ padding: 20 }}>
            <h3>Excel Inspector</h3>
            {loading && <div>Analyzing structure...</div>}

            {analysis && (
                <div>
                    <h4>Sheets ({analysis.sheets.length})</h4>
                    <ul>
                        {analysis.sheets.map(s => <li key={s}>{s}</li>)}
                    </ul>
                    <p>Formulas detected: {analysis.formulas_count} (Analysis limited in V1)</p>
                </div>
            )}

            <div style={{ marginTop: 20 }}>
                <button onClick={generatePdf} disabled={converting}>
                    {converting ? "Converting to PDF..." : "Generate PDF Preview"}
                </button>
            </div>

            {pdfPath && (
                <div style={{ marginTop: 10, color: 'green' }}>
                    PDF Generated: {pdfPath}.
                    <br />
                    (Select the PDF from the file list to view it)
                </div>
            )}
        </div>
    );
}
