import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface CellInfo {
    address: string;
    value: string;
    formula: string | null;
}

interface SheetFormulaMap {
    sheet_name: string;
    cells: CellInfo[];
    formula_count: number;
    functions_used: string[];
}

interface FormulaMapResult {
    sheets: SheetFormulaMap[];
    total_formula_count: number;
    has_pivot: boolean;
    hidden_sheets: string[];
}

interface RangeCheck {
    range: string;
    sheet?: string;
    check_type: string;
    description: string;
}

interface RangeCheckResult {
    range: string;
    check_type: string;
    passed: boolean;
    details: string;
}

interface Props {
    submissionId: string;
    filePath: string;
    rubricChecks?: RangeCheck[];
}

export default function FormulaInspector({ submissionId, filePath, rubricChecks = [] }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [formulaMap, setFormulaMap] = useState<FormulaMapResult | null>(null);
    const [selectedSheet, setSelectedSheet] = useState<string>("");
    const [selectedCell, setSelectedCell] = useState<CellInfo | null>(null);
    const [checkResults, setCheckResults] = useState<RangeCheckResult[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadFormulaMap();
    }, [submissionId, filePath]);

    useEffect(() => {
        if (rubricChecks.length > 0 && submissionId && filePath) {
            runChecks();
        }
    }, [rubricChecks, submissionId, filePath]);

    async function loadFormulaMap() {
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<FormulaMapResult>("get_formula_map", {
                submissionId,
                filePath
            });
            setFormulaMap(result);
            if (result.sheets.length > 0) {
                setSelectedSheet(result.sheets[0].sheet_name);
            }
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }

    async function runChecks() {
        try {
            const results = await invoke<RangeCheckResult[]>("run_formula_checks", {
                submissionId,
                filePath,
                checks: rubricChecks
            });
            setCheckResults(results);
        } catch (e) {
            console.error("Formula checks failed:", e);
        }
    }

    if (loading) {
        return (
            <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>
                <p>Analyzing formulas...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: 20, color: '#e74c3c' }}>
                <h4>Error loading formula data</h4>
                <p>{error}</p>
                <button onClick={loadFormulaMap}>Retry</button>
            </div>
        );
    }

    if (!formulaMap) return null;

    const currentSheet = formulaMap.sheets.find(s => s.sheet_name === selectedSheet);

    // Filter cells by search
    const filteredCells = currentSheet?.cells.filter(c =>
        !searchTerm ||
        c.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.formula?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];


    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#1e1e1e',
            color: '#fff'
        }}>
            {/* Header */}
            <div style={{
                padding: '10px 15px',
                borderBottom: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                gap: 15
            }}>
                <h4 style={{ margin: 0 }}>Formula Inspector</h4>
                <span style={{ color: '#888', fontSize: '0.9em' }}>
                    {formulaMap.total_formula_count} formulas found
                </span>
            </div>

            {/* Sheet Tabs */}
            <div style={{
                display: 'flex',
                gap: 5,
                padding: '8px 15px',
                borderBottom: '1px solid #333',
                overflowX: 'auto'
            }}>
                {formulaMap.sheets.map(sheet => (
                    <button
                        key={sheet.sheet_name}
                        onClick={() => setSelectedSheet(sheet.sheet_name)}
                        style={{
                            padding: '5px 12px',
                            borderRadius: 4,
                            border: 'none',
                            background: sheet.sheet_name === selectedSheet ? '#4a9eff' : '#333',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.85em'
                        }}
                    >
                        {sheet.sheet_name}
                        <span style={{ marginLeft: 5, opacity: 0.7 }}>
                            ({sheet.formula_count})
                        </span>
                    </button>
                ))}
            </div>

            {/* Stats & Checks */}
            <div style={{
                padding: '10px 15px',
                borderBottom: '1px solid #333',
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap'
            }}>
                {currentSheet && currentSheet.functions_used.length > 0 && (
                    <div>
                        <span style={{ color: '#888', fontSize: '0.8em' }}>Functions: </span>
                        {currentSheet.functions_used.map(f => (
                            <span key={f} style={{
                                background: '#2a5',
                                padding: '2px 6px',
                                borderRadius: 3,
                                marginRight: 4,
                                fontSize: '0.8em'
                            }}>
                                {f}
                            </span>
                        ))}
                    </div>
                )}

                {checkResults.length > 0 && (
                    <div>
                        <span style={{ color: '#888', fontSize: '0.8em' }}>Rubric Checks: </span>
                        {checkResults.map((r, i) => (
                            <span key={i} style={{
                                background: r.passed ? '#2a5' : '#c33',
                                padding: '2px 6px',
                                borderRadius: 3,
                                marginRight: 4,
                                fontSize: '0.8em',
                                cursor: 'pointer'
                            }} title={r.details}>
                                {r.range}: {r.passed ? '✓' : '✗'}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Search */}
            <div style={{ padding: '8px 15px', borderBottom: '1px solid #333' }}>
                <input
                    type="text"
                    placeholder="Search cells, values, formulas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 4,
                        border: '1px solid #444',
                        background: '#2a2a2a',
                        color: '#fff'
                    }}
                />
            </div>

            {/* Cell Grid */}
            <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.85em'
                }}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Cell</th>
                            <th style={thStyle}>Value</th>
                            <th style={thStyle}>Formula</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCells.slice(0, 200).map(cell => (
                            <tr
                                key={cell.address}
                                onClick={() => setSelectedCell(cell)}
                                style={{
                                    cursor: 'pointer',
                                    background: selectedCell?.address === cell.address ? '#333' : 'transparent'
                                }}
                            >
                                <td style={tdStyle}>{cell.address}</td>
                                <td style={tdStyle}>{cell.value.substring(0, 50)}</td>
                                <td style={{
                                    ...tdStyle,
                                    color: cell.formula ? '#4a9eff' : '#666',
                                    fontFamily: 'monospace'
                                }}>
                                    {cell.formula || '(hardcoded)'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredCells.length > 200 && (
                    <p style={{ color: '#888', textAlign: 'center' }}>
                        Showing first 200 of {filteredCells.length} cells
                    </p>
                )}
            </div>

            {/* Selected Cell Detail */}
            {selectedCell && (
                <div style={{
                    padding: 15,
                    borderTop: '1px solid #333',
                    background: '#252525'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <strong>Cell {selectedCell.address}</strong>
                        <button
                            onClick={() => setSelectedCell(null)}
                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{ marginBottom: 5 }}>
                        <span style={{ color: '#888' }}>Value: </span>
                        {selectedCell.value || '(empty)'}
                    </div>
                    {selectedCell.formula ? (
                        <div style={{
                            background: '#1a3a5a',
                            padding: 10,
                            borderRadius: 4,
                            fontFamily: 'monospace',
                            fontSize: '0.9em'
                        }}>
                            ={selectedCell.formula}
                        </div>
                    ) : (
                        <div style={{ color: '#888', fontStyle: 'italic' }}>
                            No formula (hardcoded value)
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '1px solid #333',
    background: '#252525',
    position: 'sticky',
    top: 0
};

const tdStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderBottom: '1px solid #333'
};
