import React, { useRef, useState } from 'react';
import { Download, FileCode, FolderOpen, ListPlus, Rocket, Sparkles, X, Zap } from 'lucide-react';
import { US_PER_SEC } from '@t-capcut/schema';
import { engineApi } from '../engine/api';
import { runWysiwygClientExport } from '../engine/WysiwygExporter';
import { useEditorStore } from '../store/useEditorStore';

export const ExportModal: React.FC = () => {
  const open = useEditorStore((s) => s.exportModalOpen);
  const project = useEditorStore((s) => s.project);
  const projectsList = useEditorStore((s) => s.projectsList);
  const loadedLuts = useEditorStore((s) => s.loadedLuts);
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  const [mode, setMode] = useState<'hardware' | 'wysiwyg-pipe' | 'lossless-hybrid' | 'audio-only' | 'subtitle-only'>('hardware');
  const [codec, setCodec] = useState<'h264' | 'hevc' | 'prores'>('h264');
  const [fps, setFps] = useState<number>(30);
  const [subtitleFormat, setSubtitleFormat] = useState<'srt' | 'ass' | 'vtt'>('ass');
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [loudnorm, setLoudnorm] = useState(true);
  const [useInOutRange, setUseInOutRange] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressSpeed, setProgressSpeed] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [lastOutputPath, setLastOutputPath] = useState<string | null>(null);
  const [resultInfo, setResultInfo] = useState<string | null>(null);
  const [batchQueue, setBatchQueue] = useState<Array<{ projectId: string; name: string; mode: string }>>([]);

  const cancelFlagRef = useRef(false);
  const unsubSseRef = useRef<(() => void) | null>(null);

  if (!open || !project) return null;

  const hasRange =
    project.inPointUs != null &&
    project.outPointUs != null &&
    project.outPointUs > project.inPointUs + 100_000;

  const requiresWysiwygGpu = Object.values(project.clips).some(
    (c) =>
      c.kind === 'sticker' ||
      c.kind === 'effect' ||
      c.effects.length > 0 ||
      Boolean(c.transitionIn && c.transitionIn.type !== 'none') ||
      c.speed.mode === 'curve' ||
      c.mask.shape !== 'none' ||
      Boolean(c.text?.karaokeEnabled)
  );

  const handleExport = async () => {
    setExporting(true);
    setProgressPct(2);
    setProgressSpeed('');
    setResultInfo(null);
    setLastOutputPath(null);
    cancelFlagRef.current = false;

    const rangeStartUs = useInOutRange && hasRange ? project.inPointUs : null;
    const rangeEndUs = useInOutRange && hasRange ? project.outPointUs : null;

    try {
      if (mode === 'wysiwyg-pipe') {
        const res = await runWysiwygClientExport(project, {
          codec,
          fps,
          burnSubtitles,
          loudnorm,
          rangeStartUs,
          rangeEndUs,
          loadedLuts,
          onJobCreated: (jid) => setActiveJobId(jid),
          onProgress: (pct, spd) => {
            setProgressPct(pct);
            setProgressSpeed(spd);
          },
          shouldCancel: () => cancelFlagRef.current,
        });
        const kb = Math.round(res.fileSizeBytes / 1024);
        setLastOutputPath(res.outputPath);
        setResultInfo(`Xuất 100% WYSIWYG thành công (${res.modeUsed}) · ${kb} KB → ${res.outputPath}`);
        setStatusMessage(`Đã xuất WYSIWYG xong: ${res.outputPath}`);
        setExporting(false);
        return;
      }

      const { jobId } = await engineApi.startExport(project.id, {
        mode,
        codec,
        fps,
        burnSubtitles,
        loudnorm,
        subtitleFormat,
        rangeStartUs,
        rangeEndUs,
      });
      setActiveJobId(jobId);

      await new Promise<void>((resolve, reject) => {
        unsubSseRef.current = engineApi.subscribeExportEvents(jobId, {
          onProgress: (ev) => {
            setProgressPct(ev.percent);
            setProgressSpeed(ev.speed || '');
          },
          onDone: (res) => {
            setProgressPct(100);
            const kb = Math.round(res.fileSizeBytes / 1024);
            setLastOutputPath(res.outputPath);
            setResultInfo(`Xuất thành công (${res.modeUsed}) trong ${res.durationMs}ms · ${kb} KB → ${res.outputPath}`);
            setStatusMessage(`Đã xuất xong: ${res.outputPath}`);
            resolve();
          },
          onError: (msg) => reject(new Error(msg)),
          onCancelled: () => reject(new Error('Đã hủy tiến trình xuất video')),
        });
      });
    } catch (err) {
      setResultInfo(`Thông báo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      unsubSseRef.current?.();
      unsubSseRef.current = null;
      setExporting(false);
      setActiveJobId(null);
    }
  };

  const handleCancel = async () => {
    cancelFlagRef.current = true;
    if (activeJobId) {
      await engineApi.cancelExport(activeJobId).catch(() => {});
    }
  };

  const handleRunBatch = async () => {
    if (batchQueue.length === 0) return;
    setExporting(true);
    try {
      const res = await engineApi.batchExport(
        batchQueue.map((j) => ({ projectId: j.projectId, options: { mode: j.mode, codec, fps, burnSubtitles, loudnorm } }))
      );
      setResultInfo(`Batch Render xong ${res.results.length} dự án!`);
      setBatchQueue([]);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadInterop = async (fmt: 'capcut' | 'fcpxml' | 'otio') => {
    const res = await engineApi.exportInterop(project.id, fmt);
    const blob = new Blob([res.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage(`Đã xuất file ${res.filename}`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(4, 6, 12, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={() => setExportModalOpen(false)}
    >
      <div
        className="liquid-glass-modal"
        style={{ width: 610, maxWidth: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
            <Rocket size={18} color="#22d3ee" />
            <span>Xuất Video WYSIWYG, SSE Real-Time & Interop</span>
          </div>
          <button className="glass-btn" onClick={() => setExportModalOpen(false)}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className={`glass-btn ${mode === 'hardware' ? 'glass-btn-active' : ''}`} onClick={() => setMode('hardware')}>
            <Rocket size={13} /> Hardware VideoToolbox (Nhanh)
          </button>
          <button className={`glass-btn ${mode === 'wysiwyg-pipe' ? 'glass-btn-active' : ''}`} onClick={() => setMode('wysiwyg-pipe')}>
            <Sparkles size={13} color="#a78bfa" /> Exact 100% WYSIWYG GPU Pipe {requiresWysiwygGpu ? '★' : ''}
          </button>
          <button className={`glass-btn ${mode === 'lossless-hybrid' ? 'glass-btn-active' : ''}`} onClick={() => setMode('lossless-hybrid')}>
            <Zap size={13} color="#fbbf24" /> Smart Lossless Copy
          </button>
          <button className={`glass-btn ${mode === 'audio-only' ? 'glass-btn-active' : ''}`} onClick={() => setMode('audio-only')}>
            Audio Multi-Track Mix (.WAV)
          </button>
          <button className={`glass-btn ${mode === 'subtitle-only' ? 'glass-btn-active' : ''}`} style={{ gridColumn: '1 / -1' }} onClick={() => setMode('subtitle-only')}>
            Subtitles Only (.SRT / .ASS Karaoke / .VTT)
          </button>
        </div>

        {requiresWysiwygGpu && mode !== 'wysiwyg-pipe' && mode !== 'audio-only' && mode !== 'subtitle-only' && (
          <div style={{ padding: '7px 10px', borderRadius: 10, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)', fontSize: 11, color: '#ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>Timeline có Shader VFX / Chuyển cảnh / Sticker / Karaoke động — khuyên dùng GPU WYSIWYG Pipe để giống Preview 100%.</span>
            <button className="glass-btn" style={{ fontSize: 10.5, padding: '4px 8px', flexShrink: 0 }} onClick={() => setMode('wysiwyg-pipe')}>
              Chọn WYSIWYG
            </button>
          </div>
        )}

        {(mode === 'hardware' || mode === 'lossless-hybrid' || mode === 'wysiwyg-pipe') && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Codec Phần Cứng</label>
              <select className="glass-select" value={codec} onChange={(e) => setCodec(e.target.value as typeof codec)}>
                <option value="h264">H.264 (VideoToolbox)</option>
                <option value="hevc">H.265 / HEVC (VideoToolbox)</option>
                <option value="prores">Apple ProRes</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Frame Rate</label>
              <select className="glass-select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
          </div>
        )}

        {mode === 'subtitle-only' && (
          <select className="glass-select" value={subtitleFormat} onChange={(e) => setSubtitleFormat(e.target.value as typeof subtitleFormat)}>
            <option value="ass">ASS Karaoke (\kf word-synced)</option>
            <option value="srt">SRT Standard</option>
            <option value="vtt">WebVTT</option>
          </select>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={burnSubtitles} onChange={(e) => setBurnSubtitles(e.target.checked)} />
            Ghi cứng phụ đề Karaoke
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={loudnorm} onChange={(e) => setLoudnorm(e.target.checked)} />
            Chuẩn hóa âm lượng -14 LUFS
          </label>
          {hasRange && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22d3ee' }}>
              <input type="checkbox" checked={useInOutRange} onChange={(e) => setUseInOutRange(e.target.checked)} />
              Xuất vùng In/Out ({(project.inPointUs! / US_PER_SEC).toFixed(1)}s → {(project.outPointUs! / US_PER_SEC).toFixed(1)}s)
            </label>
          )}
        </div>

        {/* Live Progress Bar */}
        {exporting && (
          <div style={{ padding: 10, borderRadius: 12, background: 'rgba(34, 211, 238, 0.08)', border: '1px solid rgba(34, 211, 238, 0.3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
              <span>Đang render phần cứng...</span>
              <span className="mono" style={{ color: '#22d3ee' }}>{progressPct}% {progressSpeed ? `· ${progressSpeed}` : ''}</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #22d3ee, #6366f1)', transition: 'width 120ms linear' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {!exporting ? (
            <button className="glass-btn glass-btn-primary" style={{ flex: 1 }} onClick={() => void handleExport()}>
              <Download size={14} /> Xuất Ngay
            </button>
          ) : (
            <button className="glass-btn" style={{ flex: 1, borderColor: '#fb7185', color: '#fb7185' }} onClick={() => void handleCancel()}>
              <X size={14} /> Hủy Xuất Video
            </button>
          )}
          <button
            className="glass-btn"
            disabled={exporting}
            onClick={() => setBatchQueue((q) => [...q, { projectId: project.id, name: project.name, mode }])}
          >
            <ListPlus size={14} /> + Hàng Đợi ({batchQueue.length})
          </button>
        </div>

        {batchQueue.length > 0 && (
          <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
            <span>Hàng đợi Batch: {batchQueue.length} dự án ({projectsList.length} sẵn có)</span>
            <button className="glass-btn glass-btn-primary" disabled={exporting} onClick={() => void handleRunBatch()}>
              Chạy Batch Render
            </button>
          </div>
        )}

        {resultInfo && (
          <div className="mono" style={{ padding: 10, borderRadius: 10, background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52,211,153,0.35)', fontSize: 11, wordBreak: 'break-all', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>{resultInfo}</div>
            {lastOutputPath && (
              <button className="glass-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void engineApi.revealInFinder(lastOutputPath)}>
                <FolderOpen size={13} color="#22d3ee" /> Mở file trong Finder
              </button>
            )}
          </div>
        )}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Xuất file dự án sang các trình dựng khác (Interop):
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="glass-btn" style={{ flex: 1 }} onClick={() => void handleDownloadInterop('capcut')}>
              <FileCode size={13} /> CapCut Draft (.json)
            </button>
            <button className="glass-btn" style={{ flex: 1 }} onClick={() => void handleDownloadInterop('fcpxml')}>
              <FileCode size={13} /> Final Cut (.fcpxml)
            </button>
            <button className="glass-btn" style={{ flex: 1 }} onClick={() => void handleDownloadInterop('otio')}>
              <FileCode size={13} /> DaVinci (.otio)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
