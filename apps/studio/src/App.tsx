import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Command,
  Cpu,
  Download,
  FolderPlus,
  History,
  LayoutTemplate,
  PanelLeftClose,
  PanelRightClose,
  Redo2,
  Undo2,
} from 'lucide-react';
import type { AspectRatioPreset } from '@t-capcut/schema';
import { ChatCutModal } from './components/ChatCutModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { ExportModal } from './components/ExportModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { LeftStudioPanel } from './components/LeftStudioPanel';
import { PlayerViewport } from './components/PlayerViewport';
import { RightInspector } from './components/RightInspector';
import { TemplateHubModal } from './components/TemplateHubModal';
import { TemplateModal } from './components/TemplateModal';
import { TimelineCanvas } from './components/TimelineCanvas';
import { playbackClock } from './engine/PlaybackClock';
import { useEditorStore } from './store/useEditorStore';

const RATIOS: Array<Exclude<AspectRatioPreset, 'custom'>> = ['16:9', '9:16', '1:1', '4:3', '2.35:1'];

function readNumStorage(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 100 ? v : fallback;
  } catch {
    return fallback;
  }
}

export const App: React.FC = () => {
  const init = useEditorStore((s) => s.init);
  const project = useEditorStore((s) => s.project);
  const projectsList = useEditorStore((s) => s.projectsList);
  const busyTask = useEditorStore((s) => s.busyTask);
  const statusMessage = useEditorStore((s) => s.statusMessage);
  const errorMessage = useEditorStore((s) => s.errorMessage);
  const historyDrawerOpen = useEditorStore((s) => s.historyDrawerOpen);

  const selectProject = useEditorStore((s) => s.selectProject);
  const createProject = useEditorStore((s) => s.createProject);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setAspectRatio = useEditorStore((s) => s.setAspectRatio);
  const toggleProxyMode = useEditorStore((s) => s.toggleProxyMode);
  const setHistoryDrawerOpen = useEditorStore((s) => s.setHistoryDrawerOpen);
  const setChatCutOpen = useEditorStore((s) => s.setChatCutOpen);
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen);
  const fullscreenPreview = useEditorStore((s) => s.fullscreenPreview);
  const setFullscreenPreview = useEditorStore((s) => s.setFullscreenPreview);
  const setCommandPaletteOpen = useEditorStore((s) => s.setCommandPaletteOpen);
  const templateHubOpen = useEditorStore((s) => s.templateHubOpen);
  const setTemplateHubOpen = useEditorStore((s) => s.setTemplateHubOpen);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);
  const setErrorMessage = useEditorStore((s) => s.setErrorMessage);

  const headerRef = useRef<HTMLElement | null>(null);
  const headerRectRef = useRef<DOMRect | null>(null);

  const [leftWidth, setLeftWidth] = useState(() => readNumStorage('tcapcut_left_w', 316));
  const [rightWidth, setRightWidth] = useState(() => readNumStorage('tcapcut_right_w', 348));
  const [timelineHeight, setTimelineHeight] = useState(() => readNumStorage('tcapcut_tl_h', 310));
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const nativeInsetLeft =
    typeof window !== 'undefined'
      ? (window as unknown as { __TCAPCUT_NATIVE__?: { titlebarInsetLeft?: number } }).__TCAPCUT_NATIVE__?.titlebarInsetLeft ?? 0
      : 0;

  useEffect(() => {
    void init();
  }, [init]);

  // Cache header rect via ResizeObserver so hover specular rim causes ZERO reflow on mousemove
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const updateRect = () => {
      headerRectRef.current = el.getBoundingClientRect();
    };
    updateRect();
    const ro = new ResizeObserver(updateRect);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 3800);
    return () => clearTimeout(t);
  }, [statusMessage, setStatusMessage]);

  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => setErrorMessage(null), 6000);
    return () => clearTimeout(t);
  }, [errorMessage, setErrorMessage]);

  // Pro NLE & CapCut Keyboard Shortcuts (Space, J/K/L Shuttle, Arrow Frame Step, I/O, [/], Cmd+B, Cmd+K, Cmd+Z)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const st = useEditorStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.code === 'Space') {
        e.preventDefault();
        st.setIsPlaying(!st.isPlaying);
      } else if (key === 'j' && !mod) {
        playbackClock.shuttle('j');
        useEditorStore.setState({ isPlaying: true });
      } else if (key === 'k' && !mod) {
        playbackClock.shuttle('k');
        useEditorStore.setState({ isPlaying: false, playheadUs: playbackClock.getTimeUs() });
      } else if (key === 'l' && !mod) {
        playbackClock.shuttle('l');
        useEditorStore.setState({ isPlaying: true });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playbackClock.stepFrames(e.shiftKey ? -10 : -1, st.project?.settings.fps ?? 30);
        useEditorStore.setState({ isPlaying: false, playheadUs: playbackClock.getTimeUs() });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        playbackClock.stepFrames(e.shiftKey ? 10 : 1, st.project?.settings.fps ?? 30);
        useEditorStore.setState({ isPlaying: false, playheadUs: playbackClock.getTimeUs() });
      } else if (key === 'i' && !mod) {
        void st.setInOutPoint('in');
      } else if (key === 'o' && !mod) {
        void st.setInOutPoint('out');
      } else if (mod && key === 'k') {
        e.preventDefault();
        st.setChatCutOpen(!st.chatCutOpen);
      } else if (mod && key === 'p') {
        e.preventDefault();
        st.setCommandPaletteOpen(!st.commandPaletteOpen);
      } else if (mod && e.shiftKey && key === 'f') {
        e.preventDefault();
        st.setFullscreenPreview(!st.fullscreenPreview);
      } else if (e.key === 'Escape' && st.fullscreenPreview) {
        st.setFullscreenPreview(false);
      } else if (mod && key === 'b') {
        e.preventDefault();
        void st.splitClipAtPlayhead();
      } else if (mod && e.shiftKey && key === 'z') {
        e.preventDefault();
        void st.redo();
      } else if (mod && key === 'z') {
        e.preventDefault();
        void st.undo();
      } else if (key === 'q' || e.key === '[') {
        void st.rippleTrimClip('left');
      } else if (key === 'w' || e.key === ']') {
        void st.rippleTrimClip('right');
      } else if (key === 'v') {
        st.setTool('select');
      } else if (key === 'b' && !mod) {
        st.setTool('blade');
      } else if (key === 'm') {
        void st.addMarkerAtPlayhead();
      } else if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        void st.rippleDeleteClip();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        void st.deleteSelectedClip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const startResize = (axis: 'left' | 'right' | 'timeline', downEvent: React.PointerEvent) => {
    downEvent.preventDefault();
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    const origLeft = leftWidth;
    const origRight = rightWidth;
    const origTl = timelineHeight;

    const onMove = (ev: PointerEvent) => {
      if (axis === 'left') {
        const next = Math.min(460, Math.max(250, origLeft + (ev.clientX - startX)));
        setLeftWidth(next);
        localStorage.setItem('tcapcut_left_w', String(next));
      } else if (axis === 'right') {
        const next = Math.min(480, Math.max(290, origRight - (ev.clientX - startX)));
        setRightWidth(next);
        localStorage.setItem('tcapcut_right_w', String(next));
      } else {
        const next = Math.min(500, Math.max(210, origTl - (ev.clientY - startY)));
        setTimelineHeight(next);
        localStorage.setItem('tcapcut_tl_h', String(next));
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className={`tcapcut-shell ${project?.settings.coloristMode ? 'colorist-mode' : ''}`}
      style={{ padding: 10, gap: 6 }}
    >
      {/* Top macOS Tahoe Liquid Glass Navigation Chrome */}
      <header
        ref={headerRef}
        className="liquid-glass-chrome titlebar-drag"
        onPointerMove={(e) => {
          const r = headerRectRef.current;
          if (!r || !headerRef.current) return;
          headerRef.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
          headerRef.current.style.setProperty('--my', `${e.clientY - r.top}px`);
        }}
        style={{
          height: 50,
          padding: `0 14px 0 ${Math.max(14, nativeInsetLeft)}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div className="titlebar-nodrag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

          <select
            id="tcapcut-project-select"
            name="project_select"
            aria-label="Chọn dự án hiện tại"
            className="glass-select"
            style={{ width: 175, padding: '5px 8px' }}
            value={project?.id ?? ''}
            onChange={(e) => void selectProject(e.target.value)}
          >
            {projectsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.clipCount} clips)
              </option>
            ))}
          </select>

          <button className="glass-btn" onClick={() => void createProject(`Dự án ${projectsList.length + 1}`)} title="Tạo dự án mới">
            <FolderPlus size={13} />
          </button>

          <button className="glass-btn" onClick={() => void undo()} title="Undo (Cmd+Z)">
            <Undo2 size={13} />
          </button>
          <button className="glass-btn" onClick={() => void redo()} title="Redo (Cmd+Shift+Z)">
            <Redo2 size={13} />
          </button>
          <button
            className={`glass-btn ${historyDrawerOpen ? 'glass-btn-active' : ''}`}
            onClick={() => setHistoryDrawerOpen(!historyDrawerOpen)}
            title="Lịch sử thao tác"
          >
            <History size={13} />
          </button>
        </div>

        <div className="titlebar-nodrag" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <button className={`glass-btn ${leftCollapsed ? 'glass-btn-active' : ''}`} onClick={() => setLeftCollapsed(!leftCollapsed)} title="Ẩn/hiện thư viện trái">
            <PanelLeftClose size={13} />
          </button>
          <button className={`glass-btn ${rightCollapsed ? 'glass-btn-active' : ''}`} onClick={() => setRightCollapsed(!rightCollapsed)} title="Ẩn/hiện bảng thuộc tính phải">
            <PanelRightClose size={13} />
          </button>

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
            title="Bật/tắt phát qua Proxy"
          >
            <Cpu size={13} /> Proxy
          </button>

          <button
            className={`glass-btn ${templateHubOpen ? 'glass-btn-active' : ''}`}
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.28), rgba(34,211,238,0.28))',
              borderColor: 'rgba(192,132,252,0.45)',
              color: '#f5f3ff',
              fontWeight: 700,
            }}
            onClick={() => setTemplateHubOpen(true)}
            title="Mở Kho Mẫu CapCut (24+ Mẫu & Nhập draft_content.json / .capcut)"
          >
            <LayoutTemplate size={13} color="#c084fc" /> Kho Mẫu 24+
          </button>

          <button className="glass-btn" onClick={() => setCommandPaletteOpen(true)} title="Command Palette Tìm Nhanh (Cmd+P)">
            <Command size={13} color="#a78bfa" /> <span className="mono" style={{ fontSize: 10 }}>⌘P</span>
          </button>

          <button className="glass-btn" onClick={() => setChatCutOpen(true)} title="Mở T-ChatCut Copilot (Cmd+K)">
            <Bot size={14} color="#22d3ee" /> T-ChatCut <span className="mono" style={{ opacity: 0.65, fontSize: 10 }}>⌘K</span>
          </button>

          <button className="glass-btn glass-btn-primary" onClick={() => setExportModalOpen(true)}>
            <Download size={14} /> Xuất Video
          </button>
        </div>
      </header>

      {/* Resizable 3-Column Studio Workspace */}
      <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0 }}>
        {!leftCollapsed && !fullscreenPreview && (
          <>
            <LeftStudioPanel widthPx={leftWidth} />
            <div className="pane-resizer-v" onPointerDown={(e) => startResize('left', e)} />
          </>
        )}
        <PlayerViewport />
        {!rightCollapsed && !fullscreenPreview && (
          <>
            <div className="pane-resizer-v" onPointerDown={(e) => startResize('right', e)} />
            <RightInspector widthPx={rightWidth} />
          </>
        )}
      </div>

      {!fullscreenPreview && (
        <>
          <div className="pane-resizer-h" onPointerDown={(e) => startResize('timeline', e)} />
          {/* Bottom 120Hz Virtualized Timeline */}
          <TimelineCanvas heightPx={timelineHeight} />
        </>
      )}

      {/* Status Toast */}
      {(busyTask || statusMessage) && (
        <div
          className="liquid-glass-pill"
          style={{
            position: 'fixed',
            bottom: timelineHeight + 22,
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

      {/* Error Toast */}
      {errorMessage && (
        <div
          className="liquid-glass-pill"
          style={{
            position: 'fixed',
            top: 66,
            right: 20,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: '#fda4af',
            borderColor: 'rgba(251,113,133,0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 70,
          }}
          onClick={() => setErrorMessage(null)}
        >
          <AlertTriangle size={14} color="#fb7185" />
          <span>{errorMessage}</span>
        </div>
      )}

      <HistoryDrawer />
      <TemplateHubModal />
      <TemplateModal />
      <CommandPaletteModal />
      <ChatCutModal />
      <ExportModal />
    </div>
  );
};
