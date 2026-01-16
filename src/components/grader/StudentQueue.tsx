export interface StudentQueueItem {
    submission_id: string;
    student_name: string | null;
    student_id: string | null;
    status: string;
    claimed_by?: string | null;
}

interface Props {
    items: StudentQueueItem[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

// Status icon mapping
function getStatusIcon(status: string): string {
    switch (status) {
        case 'unstarted': return '⚪';
        case 'in_progress': return '🟡';
        case 'done': return '✅';
        case 'flagged': return '🚩';
        case 'error': return '❌';
        default: return '⚪';
    }
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'done': return '#2ecc71';
        case 'flagged': return '#e74c3c';
        case 'in_progress': return '#f39c12';
        case 'error': return '#e74c3c';
        default: return '#666';
    }
}

export default function StudentQueue({ items, selectedId, onSelect }: Props) {
    return (
        <div style={{ height: '100%', overflowY: 'auto', background: '#1e1e1e', color: '#fff' }}>
            <div style={{
                padding: '10px 15px',
                fontWeight: 'bold',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between'
            }}>
                <span>Students ({items.length})</span>
                <span style={{ fontSize: '0.8em', color: '#888' }}>
                    ✅ {items.filter(i => i.status === 'done').length}
                </span>
            </div>

            {items.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
                    No submissions loaded
                </div>
            ) : (
                items.map(item => (
                    <div
                        key={item.submission_id}
                        onClick={() => onSelect(item.submission_id)}
                        style={{
                            padding: '10px 15px',
                            cursor: 'pointer',
                            background: item.submission_id === selectedId ? '#2a2a2a' : 'transparent',
                            borderLeft: item.submission_id === selectedId ? '3px solid #4a9eff' : '3px solid transparent',
                            borderBottom: '1px solid #333',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                            if (item.submission_id !== selectedId) {
                                (e.target as HTMLElement).style.background = '#252525';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (item.submission_id !== selectedId) {
                                (e.target as HTMLElement).style.background = 'transparent';
                            }
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1.1em' }}>{getStatusIcon(item.status)}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500 }}>
                                    {item.student_name || "Unknown"}
                                </div>
                                <div style={{ fontSize: '0.8em', color: '#888' }}>
                                    {item.student_id || "No ID"}
                                </div>
                            </div>
                            {item.claimed_by && (
                                <span style={{
                                    fontSize: '0.7em',
                                    background: '#444',
                                    padding: '2px 6px',
                                    borderRadius: 3
                                }}>
                                    🔒 {item.claimed_by}
                                </span>
                            )}
                        </div>
                        <div style={{
                            fontSize: '0.75em',
                            color: getStatusColor(item.status),
                            marginTop: 4,
                            textTransform: 'capitalize'
                        }}>
                            {item.status.replace('_', ' ')}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
