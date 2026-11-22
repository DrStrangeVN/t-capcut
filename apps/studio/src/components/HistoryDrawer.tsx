import React from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';

export const HistoryDrawer: React.FC = () => {
  const open = useEditorStore((s) => s.historyDrawerOpen);
  const history = useEditorStore((s) => s.history);
  const setOpen = useEditorStore((s) => s.setHistoryDrawerOpen);
  const jumpToCommand = useEditorStore((s) => s.jumpToCommand);

  if (!open) return null;

  return (
    <div
      className="liquid-glass-chrome"
      style={{
        position: 'fixed',
        top: 66,
        left: 240,
        width: 310,
        maxHeight: 420,
        zIndex: 55,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700 }}>
          <History size={14} color="#22d3ee" />
          <span>Lịch sử chỉnh sửa ({history.length})</span>
        </div>
        <button className="glass-btn" style={{ padding: '3px 6px' }} onClick={() => setOpen(false)}>
          <X size={12} />
        </button>
      </div>

      <div className="glass-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {history.length === 0 ? (
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', padding: 12, textAlign: 'center' }}>
            Chưa có lịch sử chỉnh sửa nào.
          </div>
        ) : (
          history.map((item) => (
            <button
              key={item.id}
              onClick={() => void jumpToCommand(item.id)}
              className={`glass-btn ${item.isCurrent ? 'glass-btn-active' : ''}`}
              style={{
                justifyContent: 'space-between',
                textAlign: 'left',
                padding: '6px 9px',
                fontSize: 11,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 195 }}>
                {item.label}
              </span>
              <span className="mono" style={{ fontSize: 9.5, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 3 }}>
                {!item.isCurrent && <RotateCcw size={10} />}
                {new Date(item.timestamp).toLocaleTimeString()}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
