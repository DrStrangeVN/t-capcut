import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Copy,
  Layers,
  Lock,
  Magnet,
  MousePointer2,
  Scissors,
  Snowflake,
  Sparkles,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { US_PER_SEC, type Clip, type Track } from '@t-capcut/schema';
import { mediaStreamUrl } from '../engine/api';
import { useEditorStore } from '../store/useEditorStore';

const RULER_H = 28;
const TRACK_H = 54;
const HEADER_W = 160;

const CLIP_THEME: Record<Clip['kind'], { fill: string; border: string; accent: string }> = {
  video: { fill: 'rgba(14, 116, 144, 0.52)', border: 'rgba(34, 211, 238, 0.55)', accent: '#22d3ee' },
  image: { fill: 'rgba(29, 78, 216, 0.52)', border: 'rgba(96, 165, 250, 0.55)', accent: '#60a5fa' },
  audio: { fill: 'rgba(6, 95, 70, 0.56)', border: 'rgba(52, 211, 153, 0.55)', accent: '#34d399' },
  text: { fill: 'rgba(146, 64, 14, 0.56)', border: 'rgba(251, 191, 36, 0.55)', accent: '#fbbf24' },
  effect: { fill: 'rgba(91, 33, 182, 0.56)', border: 'rgba(167, 139, 250, 0.55)', accent: '#a78bfa' },
  adjustment: { fill: 'rgba(109, 40, 217, 0.52)', border: 'rgba(192, 132, 252, 0.55)', accent: '#c084fc' },
  sticker: { fill: 'rgba(190, 24, 93, 0.52)', border: 'rgba(244, 114, 182, 0.55)', accent: '#f472b6' },
  compound: { fill: 'rgba(51, 65, 85, 0.65)', border: 'rgba(148, 163, 184, 0.55)', accent: '#cbd5e1' },
};

type DragMode =
  | { kind: 'scrub' }
  | { kind: 'move'; clipId: string; startClientX: number; origStartUs: number; origTrackId: string }
  | { kind: 'trim-left'; clipId: string; startClientX: number; origStartUs: number; origDurUs: number; origSrcStartUs: number }
  | { kind: 'trim-right'; clipId: string; startClientX: number; origDurUs: number };

export const TimelineCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stripCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const dragRef = useRef<DragMode | null>(null);

  const project = useEditorStore((s) => s.project);
  const playheadUs = useEditorStore((s) => s.playheadUs);
  const zoomPxPerSec = useEditorStore((s) => s.zoomPxPerSec);
  const scrollLeftPx = useEditorStore((s) => s.scrollLeftPx);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const tool = useEditorStore((s) => s.tool);
  const waveformCache = useEditorStore((s) => s.waveformCache);
  const pendingPlan = useEditorStore((s) => s.pendingPlan);

  const setPlayheadUs = useEditorStore((s) => s.setPlayheadUs);
  const setZoomPxPerSec = useEditorStore((s) => s.setZoomPxPerSec);
  const setScrollLeftPx = useEditorStore((s) => s.setScrollLeftPx);
  const setSelectedClipId = useEditorStore((s) => s.setSelectedClipId);
  const setTool = useEditorStore((s) => s.setTool);
  const commitProject = useEditorStore((s) => s.commitProject);
  const splitClipAtPlayhead = useEditorStore((s) => s.splitClipAtPlayhead);
  const duplicateSelectedClip = useEditorStore((s) => s.duplicateSelectedClip);
  const prerenderSelectedClip = useEditorStore((s) => s.prerenderSelectedClip);
  const createFreezeFrameAtPlayhead = useEditorStore((s) => s.createFreezeFrameAtPlayhead);
  const createCompoundFromTrack = useEditorStore((s) => s.createCompoundFromTrack);
  const addMarkerAtPlayhead = useEditorStore((s) => s.addMarkerAtPlayhead);

  const [snapGuideX, setSnapGuideX] = useState<number | null>(null);

  const tracks = project ? [...project.tracks].sort((a, b) => b.index - a.index) : [];

  // Preload filmstrip thumbnail images
  useEffect(() => {
    if (!project) return;
    Object.values(project.assets).forEach((a) => {
      if (a.thumbnailStripPath && !stripCacheRef.current.has(a.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = mediaStreamUrl(a.thumbnailStripPath);
        stripCacheRef.current.set(a.id, img);
      }
    });
  }, [project]);

  const usToX = (us: number) => (us / US_PER_SEC) * zoomPxPerSec - scrollLeftPx;
  const xToUs = (x: number) => Math.max(0, Math.round(((x + scrollLeftPx) / zoomPxPerSec) * US_PER_SEC));

  // Virtualized 120Hz Canvas 2D Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Ruler background
    ctx.fillStyle = 'rgba(10, 14, 24, 0.72)';
    ctx.fillRect(0, 0, w, RULER_H);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, RULER_H);
    ctx.lineTo(w, RULER_H);
    ctx.stroke();

    // Time ticks
    const stepSec = zoomPxPerSec > 160 ? 1 : zoomPxPerSec > 70 ? 2 : 5;
    const startSec = Math.floor(scrollLeftPx / zoomPxPerSec / stepSec) * stepSec;
    const endSec = Math.ceil((scrollLeftPx + w) / zoomPxPerSec) + stepSec;
    ctx.font = '10px "SF Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';

    for (let s = Math.max(0, startSec); s <= endSec; s += stepSec) {
      const x = s * zoomPxPerSec - scrollLeftPx;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 9);
      ctx.lineTo(x, RULER_H);
      ctx.stroke();
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      ctx.fillText(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, x + 4, 15);
    }

    // Track lanes
    tracks.forEach((tr, rowIdx) => {
      const y = RULER_H + rowIdx * TRACK_H;
      ctx.fillStyle = tr.isMain ? 'rgba(34, 211, 238, 0.045)' : rowIdx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y, w, TRACK_H);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.moveTo(0, y + TRACK_H);
      ctx.lineTo(w, y + TRACK_H);
      ctx.stroke();

      const trackClips = Object.values(project.clips).filter((c) => c.trackId === tr.id);
      for (const clip of trackClips) {
        const x = usToX(clip.timelineStartUs);
        const cw = Math.max(8, (clip.durationUs / US_PER_SEC) * zoomPxPerSec);
        if (x + cw < 0 || x > w) continue; // Viewport culling

        const cy = y + 5;
        const ch = TRACK_H - 10;
        const theme = CLIP_THEME[clip.kind];
        const isSel = clip.id === selectedClipId;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, cy, cw, ch, 8);
        ctx.clip();

        // Translucent Tinted Liquid Glass Clip Fill
        ctx.fillStyle = theme.fill;
        ctx.fillRect(x, cy, cw, ch);

        // Filmstrip thumbnails for video/image
        const stripImg = clip.assetId ? stripCacheRef.current.get(clip.assetId) : undefined;
        if (stripImg && stripImg.complete && stripImg.naturalWidth > 0 && (clip.kind === 'video' || clip.kind === 'image')) {
          ctx.globalAlpha = 0.55;
          const tileCount = Math.max(1, Math.ceil(cw / 64));
          for (let ti = 0; ti < tileCount; ti++) {
            const sx = (ti % 12) * Math.floor(stripImg.naturalWidth / 12);
            const sw = Math.max(1, Math.floor(stripImg.naturalWidth / (clip.kind === 'image' ? 1 : 12)));
            ctx.drawImage(stripImg, sx, 0, sw, stripImg.naturalHeight, x + ti * 64, cy, 64, ch);
          }
          ctx.globalAlpha = 1;
        }

        // Mipmap Audio Waveform
        const peaks = clip.assetId ? waveformCache[clip.assetId] : undefined;
        if (peaks && peaks.length > 0 && (clip.kind === 'audio' || clip.kind === 'video')) {
          ctx.strokeStyle = clip.kind === 'audio' ? 'rgba(110, 231, 183, 0.9)' : 'rgba(165, 243, 252, 0.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const midY = clip.kind === 'audio' ? cy + ch * 0.5 : cy + ch * 0.78;
          const amp = clip.kind === 'audio' ? ch * 0.42 : ch * 0.18;
          const totalBuckets = Math.floor(peaks.length / 2);
          const startBucket = Math.floor((clip.sourceStartUs / US_PER_SEC) * 100);
          const endBucket = Math.min(totalBuckets, Math.ceil(((clip.sourceStartUs + clip.sourceDurationUs) / US_PER_SEC) * 100));
          const bucketSpan = Math.max(1, endBucket - startBucket);
          const pxStep = Math.max(2, Math.floor(cw / 160));
          for (let px = 0; px < cw; px += pxStep) {
            const bi = Math.min(totalBuckets - 1, startBucket + Math.floor((px / cw) * bucketSpan));
            const minV = peaks[bi * 2] ?? 0;
            const maxV = peaks[bi * 2 + 1] ?? 0;
            ctx.moveTo(x + px, midY - maxV * amp);
            ctx.lineTo(x + px, midY - minV * amp);
          }
          ctx.stroke();
        }

        // Specular top glass highlight
        const grad = ctx.createLinearGradient(0, cy, 0, cy + 12);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, cy, cw, 12);

        // Label badge
        ctx.fillStyle = 'rgba(6, 10, 18, 0.65)';
        ctx.fillRect(x + 4, cy + 3, Math.min(cw - 8, ctx.measureText(clip.name).width + 12), 16);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(clip.name, x + 9, cy + 14.5, Math.max(10, cw - 16));

        // Keyframe Diamonds
        const allKfTimes = new Set<number>();
        Object.values(clip.keyframes).forEach((arr) => arr?.forEach((k) => allKfTimes.add(k.timeUs)));
        allKfTimes.forEach((kt) => {
          const kx = x + (kt / US_PER_SEC) * zoomPxPerSec;
          const ky = cy + ch - 7;
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(kx, ky - 4);
          ctx.lineTo(kx + 4, ky);
          ctx.lineTo(kx, ky + 4);
          ctx.lineTo(kx - 4, ky);
          ctx.closePath();
          ctx.fill();
        });

        ctx.restore();

        // Clip Border + Pre-render cache green bar
        ctx.strokeStyle = isSel ? '#ffffff' : theme.border;
        ctx.lineWidth = isSel ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(x, cy, cw, ch, 8);
        ctx.stroke();

        if (clip.prerenderHash) {
          ctx.fillStyle = '#34d399';
          ctx.fillRect(x + 6, cy + ch - 3, Math.max(0, cw - 12), 2.5);
        }
      }
    });

    // Beat / Scene / User Markers
    for (const mk of project.markers) {
      const mx = usToX(mk.timeUs);
      if (mx < -10 || mx > w + 10) continue;
      ctx.fillStyle = mk.color;
      ctx.beginPath();
      ctx.moveTo(mx, RULER_H - 1);
      ctx.lineTo(mx - 4, RULER_H - 8);
      ctx.lineTo(mx + 4, RULER_H - 8);
      ctx.closePath();
      ctx.fill();
    }

    // T-ChatCut Ghost Diff Preview Overlay
    if (pendingPlan) {
      for (const op of pendingPlan.ops) {
        if (op.timeUs === undefined) continue;
        const ox = usToX(op.timeUs);
        const ow = op.durationUs ? Math.max(6, (op.durationUs / US_PER_SEC) * zoomPxPerSec) : 3;
        ctx.fillStyle = op.op === 'delete' ? 'rgba(251, 113, 133, 0.36)' : 'rgba(34, 211, 238, 0.35)';
        ctx.fillRect(ox, RULER_H, ow, h - RULER_H);
        ctx.strokeStyle = op.op === 'delete' ? '#fb7185' : '#22d3ee';
        ctx.strokeRect(ox, RULER_H, ow, h - RULER_H);
      }
    }

    // Magnetic Snap Line
    if (snapGuideX !== null) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(snapGuideX, 0);
      ctx.lineTo(snapGuideX, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Playhead Laser Line
    const phX = usToX(playheadUs);
    if (phX >= -2 && phX <= w + 2) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, h);
      ctx.stroke();

      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(phX - 6, 0);
      ctx.lineTo(phX + 6, 0);
      ctx.lineTo(phX + 6, 10);
      ctx.lineTo(phX, 17);
      ctx.lineTo(phX - 6, 10);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }, [project, tracks, playheadUs, zoomPxPerSec, scrollLeftPx, selectedClipId, waveformCache, pendingPlan, snapGuideX]);

  const hitTestClip = (x: number, y: number): { clip: Clip; edge: 'left' | 'right' | 'body' } | null => {
    if (!project || y < RULER_H) return null;
    const rowIdx = Math.floor((y - RULER_H) / TRACK_H);
    const track = tracks[rowIdx];
    if (!track) return null;
    const candidates = Object.values(project.clips).filter((c) => c.trackId === track.id);
    for (const c of candidates) {
      const cx = usToX(c.timelineStartUs);
      const cw = Math.max(8, (c.durationUs / US_PER_SEC) * zoomPxPerSec);
      if (x >= cx - 4 && x <= cx + cw + 4) {
        if (x <= cx + 7) return { clip: c, edge: 'left' };
        if (x >= cx + cw - 7) return { clip: c, edge: 'right' };
        return { clip: c, edge: 'body' };
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (y <= RULER_H) {
      dragRef.current = { kind: 'scrub' };
      setPlayheadUs(xToUs(x));
      return;
    }

    const hit = hitTestClip(x, y);
    if (!hit) {
      setSelectedClipId(null);
      setPlayheadUs(xToUs(x));
      dragRef.current = { kind: 'scrub' };
      return;
    }

    setSelectedClipId(hit.clip.id);
    if (tool === 'blade') {
      void splitClipAtPlayhead(hit.clip.id, xToUs(x));
      return;
    }

    if (hit.edge === 'left') {
      dragRef.current = {
        kind: 'trim-left',
        clipId: hit.clip.id,
        startClientX: e.clientX,
        origStartUs: hit.clip.timelineStartUs,
        origDurUs: hit.clip.durationUs,
        origSrcStartUs: hit.clip.sourceStartUs,
      };
    } else if (hit.edge === 'right') {
      dragRef.current = {
        kind: 'trim-right',
        clipId: hit.clip.id,
        startClientX: e.clientX,
        origDurUs: hit.clip.durationUs,
      };
    } else {
      dragRef.current = {
        kind: 'move',
        clipId: hit.clip.id,
        startClientX: e.clientX,
        origStartUs: hit.clip.timelineStartUs,
        origTrackId: hit.clip.trackId,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    if (drag.kind === 'scrub') {
      setPlayheadUs(xToUs(x));
      return;
    }

    const deltaUs = Math.round(((e.clientX - drag.startClientX) / zoomPxPerSec) * US_PER_SEC);
    const clip = project.clips[drag.clipId];
    if (!clip) return;

    if (drag.kind === 'move') {
      let candidate = Math.max(0, drag.origStartUs + deltaUs);
      const snapTargets = [playheadUs, 0, ...project.markers.map((m) => m.timeUs)];
      Object.values(project.clips).forEach((other) => {
        if (other.id !== clip.id) {
          snapTargets.push(other.timelineStartUs, other.timelineStartUs + other.durationUs);
        }
      });
      const snapTolUs = Math.round((8 / zoomPxPerSec) * US_PER_SEC);
      let snappedX: number | null = null;
      for (const st of snapTargets) {
        if (Math.abs(candidate - st) < snapTolUs) {
          candidate = st;
          snappedX = usToX(st);
          break;
        }
      }
      setSnapGuideX(snappedX);
      clip.timelineStartUs = candidate;
      // Trigger canvas repaint smoothly
      useEditorStore.setState({ project: { ...project } });
    } else if (drag.kind === 'trim-left') {
      const clampedDelta = Math.min(drag.origDurUs - 200_000, Math.max(-drag.origStartUs, deltaUs));
      clip.timelineStartUs = drag.origStartUs + clampedDelta;
      clip.durationUs = drag.origDurUs - clampedDelta;
      clip.sourceStartUs = Math.max(0, drag.origSrcStartUs + clampedDelta);
      useEditorStore.setState({ project: { ...project } });
    } else if (drag.kind === 'trim-right') {
      clip.durationUs = Math.max(200_000, drag.origDurUs + deltaUs);
      clip.sourceDurationUs = Math.round(clip.durationUs * (clip.speed.rate || 1));
      useEditorStore.setState({ project: { ...project } });
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag || !project) return;
    dragRef.current = null;
    setSnapGuideX(null);
    if (drag.kind !== 'scrub') {
      void commitProject(`Chỉnh sửa Timeline (${drag.kind})`, project);
    }
  };

  const toggleTrackProp = (track: Track, prop: 'muted' | 'locked' | 'magnetic') => {
    if (!project) return;
    const next = JSON.parse(JSON.stringify(project)) as typeof project;
    const target = next.tracks.find((t) => t.id === track.id);
    if (!target) return;
    target[prop] = !target[prop];
    void commitProject(`Track ${track.name}: ${prop}`, next);
  };

  return (
    <div className="liquid-glass-panel" style={{ height: 320, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Timeline Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className={`glass-btn ${tool === 'select' ? 'glass-btn-active' : ''}`}
            onClick={() => setTool('select')}
            title="Công cụ Chọn (V)"
          >
            <MousePointer2 size={13} /> Select
          </button>
          <button
            className={`glass-btn ${tool === 'blade' ? 'glass-btn-active' : ''}`}
            onClick={() => setTool('blade')}
            title="Dao cắt Blade (B)"
          >
            <Scissors size={13} /> Blade
          </button>
          <button
            className="glass-btn"
            onClick={() => void splitClipAtPlayhead()}
            title="Cắt đôi clip (Cmd+B)"
          >
            Split
          </button>
          <button
            className="glass-btn"
            onClick={() => void duplicateSelectedClip()}
            disabled={!selectedClipId}
            title="Nhân bản clip"
          >
            <Copy size={13} />
          </button>
          <button
            className="glass-btn"
            onClick={() => void prerenderSelectedClip()}
            disabled={!selectedClipId}
            title="Pre-render phân đoạn nặng vào cache"
          >
            <Sparkles size={13} color="#34d399" /> Pre-Render
          </button>
          <button
            className="glass-btn"
            onClick={() => void createFreezeFrameAtPlayhead()}
            title="Đóng băng khung hình tại Playhead (Freeze Frame)"
          >
            <Snowflake size={13} color="#67e8f9" /> Freeze
          </button>
          <button
            className="glass-btn"
            onClick={() => void createCompoundFromTrack()}
            title="Gộp Main Track thành Compound Clip"
          >
            <Layers size={13} color="#c084fc" /> Compound
          </button>
          <button
            className="glass-btn"
            onClick={() => void addMarkerAtPlayhead()}
            title="Thêm Marker tại Playhead (M)"
          >
            <BookmarkPlus size={13} color="#fbbf24" />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="glass-btn" onClick={() => setZoomPxPerSec(zoomPxPerSec * 0.8)}>
            <ZoomOut size={13} />
          </button>
          <input
            type="range"
            className="glass-slider"
            style={{ width: 110 }}
            min={25}
            max={400}
            value={zoomPxPerSec}
            onChange={(e) => setZoomPxPerSec(Number(e.target.value))}
          />
          <button className="glass-btn" onClick={() => setZoomPxPerSec(zoomPxPerSec * 1.25)}>
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      {/* Track Headers + Virtualized Canvas Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Track Header Column */}
        <div style={{ width: HEADER_W, borderRight: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8, 11, 19, 0.55)' }}>
          <div style={{ height: RULER_H, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 10, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            TRACKS ({tracks.length})
          </div>
          {tracks.map((tr) => (
            <div
              key={tr.id}
              style={{
                height: TRACK_H,
                padding: '0 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontSize: 11,
              }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 96 }}>
                <div style={{ fontWeight: 600, color: tr.isMain ? '#22d3ee' : '#e2e8f0' }}>{tr.name}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{tr.type}</div>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                <button
                  onClick={() => toggleTrackProp(tr, 'muted')}
                  style={{ background: 'none', border: 'none', color: tr.muted ? '#fb7185' : '#94a3b8', cursor: 'pointer', padding: 2 }}
                  title="Tắt tiếng track"
                >
                  {tr.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                {tr.isMain && (
                  <button
                    onClick={() => toggleTrackProp(tr, 'magnetic')}
                    style={{ background: 'none', border: 'none', color: tr.magnetic ? '#22d3ee' : '#64748b', cursor: 'pointer', padding: 2 }}
                    title="Magnetic Main Track"
                  >
                    <Magnet size={12} />
                  </button>
                )}
                <button
                  onClick={() => toggleTrackProp(tr, 'locked')}
                  style={{ background: 'none', border: 'none', color: tr.locked ? '#fbbf24' : '#64748b', cursor: 'pointer', padding: 2 }}
                  title="Khóa track"
                >
                  <Lock size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable / Zoomable Canvas */}
        <div
          style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              setZoomPxPerSec(zoomPxPerSec * (e.deltaY < 0 ? 1.12 : 0.9));
            } else {
              setScrollLeftPx(scrollLeftPx + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
            }
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              cursor: tool === 'blade' ? 'crosshair' : 'default',
            }}
          />
        </div>
      </div>
    </div>
  );
};
