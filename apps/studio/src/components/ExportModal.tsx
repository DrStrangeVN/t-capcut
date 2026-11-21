import React, { useState } from 'react';
import { Download, FileCode, ListPlus, Rocket, X, Zap } from 'lucide-react';
import { engineApi } from '../engine/api';
import { useEditorStore } from '../store/useEditorStore';

export const ExportModal: React.FC = () => {
  const open = useEditorStore((s) => s.exportModalOpen);
  const project = useEditorStore((s) => s.project);
  const projectsList = useEditorStore((s) => s.projectsList);
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  const [mode, setMode] = useState<'hardware' | 'lossless-hybrid' | 'audio-only' | 'subtitle-only'>('hardware');
  const [codec, setCodec] = useState<'h264' | 'hevc' | 'prores'>('h264');
  const [fps, setFps] = useState<number>(30);
  const [subtitleFormat, setSubtitleFormat] = useState<'srt' | 'ass' | 'vtt'>('ass');
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [loudnorm, setLoudnorm] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [resultInfo, setResultInfo] = useState<string | null>(null);
  const [batchQueue, setBatchQueue] = useState<Array<{ projectId: string; name: string; mode: string }>>([]);

  if (!open || !project) return null;

  const handleExport = async () => {
    setExporting(true);
    setResultInfo(null);
    try {
      const { result } = await engineApi.exportVideo(project.id, {
        mode,
        codec,
        fps,
        burnSubtitles,
        loudnorm,
        subtitleFormat,
      });
      const kb = Math.round(result.fileSizeBytes / 1024);
      setResultInfo(
        `Xuất thành công (${result.modeUsed}) trong ${result.durationMs}ms · ${kb} KB → ${result.outputPath}`
      );
      setStatusMessage(`Đã xuất xong: ${result.outputPath}`);
    } catch (err) {
      setResultInfo(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
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
        background: 'rgba(4, 6, 12, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={() => setExportModalOpen(false)}
    >
      <div
        className="liquid-glass-modal"
        style={{ width: 580, maxWidth: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
            <Rocket size={18} color="#22d3ee" />
            <span>Xuất Video, Batch Render & Chuyển Tiếp Pro</span>
          </div>
          <button className="glass-btn" onClick={() => setExportModalOpen(false)}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className={`glass-btn ${mode === 'hardware' ? 'glass-btn-active' : ''}`} onClick={() => setMode('hardware')}>
            <Rocket size={13} /> Hardware VideoToolbox
          </button>
          <button className={`glass-btn ${mode === 'lossless-hybrid' ? 'glass-btn-active' : ''}`} onClick={() => setMode('lossless-hybrid')}>
            <Zap size={13} color="#fbbf24" /> Smart Lossless Copy
          </button>
          <button className={`glass-btn ${mode === 'audio-only' ? 'glass-btn-active' : ''}`} onClick={() => setMode('audio-only')}>
            Audio Only (WAV)
          </button>
          <button className={`glass-btn ${mode === 'subtitle-only' ? 'glass-btn-active' : ''}`} onClick={() => setMode('subtitle-only')}>
            Subtitles (.SRT / .ASS / .VTT)
          </button>
        </div>

        {(mode === 'hardware' || mode === 'lossless-hybrid') && (
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

        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={burnSubtitles} onChange={(e) => setBurnSubtitles(e.target.checked)} />
            Ghi cứng phụ đề Karaoke
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={loudnorm} onChange={(e) => setLoudnorm(e.target.checked)} />
            Chuẩn hóa âm lượng -14 LUFS
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="glass-btn glass-btn-primary" style={{ flex: 1 }} disabled={exporting} onClick={() => void handleExport()}>
            <Download size={14} /> {exporting ? 'Đang xuất...' : 'Xuất Ngay'}
          </button>
          <button
            className="glass-btn"
            onClick={() =>
              setBatchQueue((q) => [...q, { projectId: project.id, name: project.name, mode }])
            }
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
          <div className="mono" style={{ padding: 10, borderRadius: 10, background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52,211,153,0.35)', fontSize: 11, wordBreak: 'break-all' }}>
            {resultInfo}
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
