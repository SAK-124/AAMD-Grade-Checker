export interface StudentQueueItem {
    submission_id: string;
    student_name: string | null;
    student_id: string | null;
    status: string;
}

interface Props {
    items: StudentQueueItem[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export default function StudentQueue({ items, selectedId, onSelect }: Props) {
    return (
        <div style={{ height: '100%', overflowY: 'auto', background: '#f5f5f5' }}>
            <div style={{ padding: 10, fontWeight: 'bold' }}>Students ({items.length})</div>
            {items.map(item => (
                <div
                    key={item.submission_id}
                    onClick={() => onSelect(item.submission_id)}
                    style={{
                        padding: '8px 10px',
                        cursor: 'pointer',
                        background: item.submission_id === selectedId ? '#fff' : 'transparent',
                        borderLeft: item.submission_id === selectedId ? '4px solid blue' : '4px solid transparent',
                        borderBottom: '1px solid #ddd'
                    }}
                >
                    <div style={{ fontWeight: 'bold' }}>{item.student_name || "Unknown"}</div>
                    <div style={{ fontSize: '0.8em', color: '#666' }}>{item.student_id || "No ID"}</div>
                    <div style={{ fontSize: '0.7em' }}>{item.status}</div>
                </div>
            ))}
        </div>
    );
}
