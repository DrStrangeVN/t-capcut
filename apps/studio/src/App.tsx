import React, { useEffect } from 'react';
import {
  Bot,
  Cpu,
  Download,
  FolderPlus,
  Redo2,
  Undo2,
} from 'lucide-react';
import type { AspectRatioPreset } from '@t-capcut/schema';
import { ChatCutModal } from './components/ChatCutModal';
import { ExportModal } from './components/ExportModal';
import { LeftStudioPanel } from './components/LeftStudioPanel';
import { PlayerViewport } from './components/PlayerViewport';
import { RightInspector } from './components/RightInspector';
import { TimelineCanvas } from './components/TimelineCanvas';
import { useEditorStore } from './store/useEditorStore';

const RATIOS: Array<Exclude<AspectRatioPreset, 'custom'>> = ['16:9', '9:16', '1:1', '4:3', '2.35:1'];

export const App: React.FC = () => {
  const init = useEditorStore((s) => s.init);
  const project = useEditorStore((s) => s.project);
  const projectsList = useEditorStore((s) => s.projectsList);
  const busyTask = useEditorStore((s) => s.busyTask);
  const statusMessage = useEditorStore((s) => s.statusMessage);

  const selectProject = useEditorStore((s) => s.selectProject);
  const createProject = useEditorStore((s) => s.createProject);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setAspectRatio = useEditorStore((s) => s.setAspectRatio);
  const toggleProxyMode = useEditorStore((s) => s.toggleProxyMode);
  const setChatCutOpen = useEditorStore((s) => s.setChatCutOpen);
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  useEffect(() => {
    void init();
  }, [init]);

  // Auto-clear status toast
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 3800);
    return () => clearTimeout(t);
  }, [statusMessage, setStatusMessage]);

  // CapCut Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const st = useEditorStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (e.code === 'Space') {
        e.preventDefault();
        st.setIsPlaying(!st.isPlaying);
      } else if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        st.setChatCutOpen(!st.chatCutOpen);
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        void st.splitClipAtPlayhead();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void st.redo();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void st.undo();
      } else if (e.key.toLowerCase() === 'q') {
        void st.rippleTrimClip('left');
      } else if (e.key.toLowerCase() === 'w') {
        void st.rippleTrimClip('right');
      } else if (e.key.toLowerCase() === 'v') {
        st.setTool('select');
      } else if (e.key.toLowerCase() === 'b' && !mod) {
        st.setTool('blade');
      } else if (e.key.toLowerCase() === 'm') {
        void st.addMarkerAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        void st.deleteSelectedClip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Pointer-tracked optical specular rim highlights across Liquid Glass panels
  const handleShellPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const panels = e.currentTarget.querySelectorAll<HTMLElement>('.liquid-glass-panel');
    panels.forEach((panel) => {
      const r = panel.getBoundingClientRect();
      panel.style.setProperty('--mx', `${e.clientX - r.left}px`);
      panel.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  };

  return (
    <div
      className={`tcapcut-shell ${project?.settings.coloristMode ? 'colorist-mode' : ''}`}
      onPointerMove={handleShellPointerMove}
      style={{ padding: 10, gap: 10 }}
    >
      {/* Top Obsidian Liquid Glass Header */}
      <header
        className="liquid-glass-panel titlebar-drag"
        style={{
          height: 50,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div className="titlebar-nodrag" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/logo.png"
            alt="T-CapCut Logo"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              boxShadow: '0 4px 14px rgba(34,211,238,0.35)',
            }}
          />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.02em' }}>T-CapCut</div>
            <div style={{ fontSize: 9.5, color: '#67e8f9', letterSpacing: '0.06em' }}>LIQUID GLASS STUDIO</div>
          </div>

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

          <select
            className="glass-select"
            style={{ width: 180, padding: '5px 8px' }}
            value={project?.id ?? ''}
            onChange={(e) => void selectProject(e.target.value)}
          >
            {projectsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.clipCount} clips)
              </option>
            ))}
          </select>

          <button
            className="glass-btn"
            onClick={() => void createProject(`Dự án ${projectsList.length + 1}`)}
            title="Tạo dự án mới"
          >
            <FolderPlus size={13} />
          </button>

          <button className="glass-btn" onClick={() => void undo()} title="Undo (Cmd+Z)">
            <Undo2 size={13} />
          </button>
          <button className="glass-btn" onClick={() => void redo()} title="Redo (Cmd+Shift+Z)">
            <Redo2 size={13} />
          </button>
        </div>

        <div className="titlebar-nodrag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Aspect Ratio Switcher */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', padding: 3, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', gap: 2 }}>
            {RATIOS.map((r) => (
              <button
                key={r}
                onClick={() => void setAspectRatio(r)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: project?.settings.aspectRatio === r ? 'rgba(34,211,238,0.22)' : 'transparent',
                  color: project?.settings.aspectRatio === r ? '#67e8f9' : '#94a3b8',
                }}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            className={`glass-btn ${project?.settings.proxyEnabled ? 'glass-btn-active' : ''}`}
            onClick={() => void toggleProxyMode()}
            title="Bật/tắt phát qua Proxy siêu mượt"
          >
            <Cpu size={13} /> Proxy
          </button>

          <button className="glass-btn" onClick={() => setChatCutOpen(true)} title="Mở T-ChatCut Copilot (Cmd+K)">
            <Bot size={14} color="#22d3ee" /> T-ChatCut <span className="mono" style={{ opacity: 0.65, fontSize: 10 }}>⌘K</span>
          </button>

          <button className="glass-btn glass-btn-primary" onClick={() => setExportModalOpen(true)}>
            <Download size={14} /> Xuất Video
          </button>
        </div>
      </header>

      {/* Main 3-Column Studio Workspace */}
      <div style={{ flex: 1, display: 'flex', gap: 10, minHeight: 0 }}>
        <LeftStudioPanel />
        <PlayerViewport />
        <RightInspector />
      </div>

      {/* Bottom 120Hz Virtualized Liquid Glass Timeline */}
      <TimelineCanvas />

      {/* Floating Status / Busy Pill */}
      {(busyTask || statusMessage) && (
        <div
          className="liquid-glass-pill"
          style={{
            position: 'fixed',
            bottom: 336,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '7px 16px',
            fontSize: 12,
            fontWeight: 500,
            color: busyTask ? '#67e8f9' : '#34d399',
            zIndex: 60,
          }}
        >
          {busyTask || statusMessage}
        </div>
      )}

      <ChatCutModal />
      <ExportModal />
    </div>
  );
};
