import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  Copy,
  Layers,
  Lock,
  Magnet,
  MousePointer2,
  Plus,
  Scissors,
  Snowflake,
  Sparkles,
  Trash2,
  Unlink,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  US_PER_SEC,
  getScopeTracksAndClips,
  type Clip,
  type Track,
  type TrackType,
} from '@t-capcut/schema';
import { assetMediaUrl } from '../engine/api';
import { playbackClock } from '../engine/PlaybackClock';
import { useEditorStore } from '../store/useEditorStore';

const RULER_H = 26;
const TRACK_H = 44;
const HEADER_W = 196;

const CLIP_THEME: Record<Clip['kind'], { fill: string; border: string; accent: string }> = {
  video: { fill: 'rgba(14, 116, 144, 0.52)', border: 'rgba(34, 211, 238, 0.55)', accent: '#22d3ee' },
  image: { fill: 'rgba(29, 78, 216, 0.52)', border: 'rgba(96, 165, 250, 0.55)', accent: '#60a5fa' },
  audio: { fill: 'rgba(6, 95, 70, 0.56)', border: 'rgba(52, 211, 153, 0.55)', accent: '#34d399' },
  text: { fill: 'rgba(146, 64, 14, 0.56)', border: 'rgba(251, 191, 36, 0.55)', accent: '#fbbf24' },
  effect: { fill: 'rgba(91, 33, 182, 0.56)', border: 'rgba(167, 139, 250, 0.55)', accent: '#a78bfa' },
  adjustment: { fill: 'rgba(109, 40, 217, 0.52)', border: 'rgba(192, 132, 252, 0.55)', accent: '#c084fc' },
  sticker: { fill: 'rgba(190, 24, 93, 0.52)', border: 'rgba(244, 114, 182, 0.55)', accent: '#f472b6' },
  compound: { fill: 'rgba(51, 65, 85, 0.72)', border: 'rgba(192, 132, 252, 0.7)', accent: '#c084fc' },
};

type DragMode =
  | { kind: 'scrub' }
  | {
      kind: 'move';
      clipId: string;
      startClientX: number;
      startClientY: number;
      origStartUs: number;
      origTrackId: string;
      isDuplicate: boolean;
    }
  | { kind: 'trim-left'; clipId: string; startClientX: number; origStartUs: number; origDurUs: number; origSrcStartUs: number }
  | { kind: 'trim-right'; clipId: string; startClientX: number; origDurUs: number }
  | { kind: 'keyframe'; clipId: string; origTimeUs: number; currentTimeUs: number }
  | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number };

interface TimelineCanvasProps {
  heightPx?: number;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ heightPx = 310 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stripCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const dragRef = useRef<DragMode | null>(null);
  const draftClipsRef = useRef<Record<string, Clip> | null>(null);
  const snapGuideXRef = useRef<number | null>(null);

  const project = useEditorStore((s) => s.project);
  const nestedScopeId = useEditorStore((s) => s.nestedScopeId);
  const zoomPxPerSec = useEditorStore((s) => s.zoomPxPerSec);
  const scrollLeftPx = useEditorStore((s) => s.scrollLeftPx);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const tool = useEditorStore((s) => s.tool);
  const waveformCache = useEditorStore((s) => s.waveformCache);
  const pendingPlan = useEditorStore((s) => s.pendingPlan);

  const setPlayheadUs = useEditorStore((s) => s.setPlayheadUs);
  const setZoomPxPerSec = useEditorStore((s) => s.setZoomPxPerSec);
  const setScrollLeftPx = useEditorStore((s) => s.setScrollLeftPx);
  const setSelectedClipId = useEditorStore((s) => s.setSelectedClipId);
  const toggleClipSelection = useEditorStore((s) => s.toggleClipSelection);
  const setSelectedClipIds = useEditorStore((s) => s.setSelectedClipIds);
  const setTool = useEditorStore((s) => s.setTool);
  const commitProject = useEditorStore((s) => s.commitProject);
  const splitClipAtPlayhead = useEditorStore((s) => s.splitClipAtPlayhead);
  const duplicateSelectedClip = useEditorStore((s) => s.duplicateSelectedClip);
  const prerenderSelectedClip = useEditorStore((s) => s.prerenderSelectedClip);
  const createFreezeFrameAtPlayhead = useEditorStore((s) => s.createFreezeFrameAtPlayhead);
  const createCompoundFromTrack = useEditorStore((s) => s.createCompoundFromTrack);
  const enterNestedScope = useEditorStore((s) => s.enterNestedScope);
  const exitNestedScope = useEditorStore((s) => s.exitNestedScope);
  const ungroupCompoundClip = useEditorStore((s) => s.ungroupCompoundClip);
  const addTrack = useEditorStore((s) => s.addTrack);
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const toggleTrackProp = useEditorStore((s) => s.toggleTrackProp);
  const moveKeyframeTime = useEditorStore((s) => s.moveKeyframeTime);
  const deleteKeyframeAtTime = useEditorStore((s) => s.deleteKeyframeAtTime);
  const setInOutPoint = useEditorStore((s) => s.setInOutPoint);
  const clearInOutPoints = useEditorStore((s) => s.clearInOutPoints);
  const addMarkerAtPlayhead = useEditorStore((s) => s.addMarkerAtPlayhead);
  const addAssetToTimeline = useEditorStore((s) => s.addAssetToTimeline);
  const uploadMediaFile = useEditorStore((s) => s.uploadMediaFile);

  const [addTrackMenu, setAddTrackMenu] = useState(false);

  const scope = project ? getScopeTracksAndClips(project, nestedScopeId) : null;
  const tracks = scope ? [...scope.tracks].sort((a, b) => b.index - a.index) : [];

  // Preload filmstrip thumbnail images via secure asset route
  useEffect(() => {
    if (!project) return;
    Object.values(project.assets).forEach((a) => {
      if (a.thumbnailStripPath && !stripCacheRef.current.has(a.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = assetMediaUrl(a.id, 'strip');
        stripCacheRef.current.set(a.id, img);
      }
    });
  }, [project]);

  const drawTimeline = useCallback(() => {
    const canvas = canvasRef.current;
    const st = useEditorStore.getState();
    const proj = st.project;
    if (!canvas || !proj) return;
    const activeScope = getScopeTracksAndClips(proj, st.nestedScopeId);
    const activeTracks = [...activeScope.tracks].sort((a, b) => b.index - a.index);
    const clipsRecord = draftClipsRef.current ?? activeScope.clips;
    const curUs = playbackClock.getTimeUs();
    const zoom = st.zoomPxPerSec;
    const scrollLeft = st.scrollLeftPx;
    const selSet = new Set(st.selectedClipIds.length > 0 ? st.selectedClipIds : st.selectedClipId ? [st.selectedClipId] : []);

    const usToX = (us: number) => (us / US_PER_SEC) * zoom - scrollLeft;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
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
    ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
    ctx.fillRect(0, 0, w, RULER_H);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, RULER_H);
    ctx.lineTo(w, RULER_H);
    ctx.stroke();

    // In / Out Range Bar on Ruler
    if (proj.inPointUs != null && proj.outPointUs != null && proj.outPointUs > proj.inPointUs) {
      const ix = usToX(proj.inPointUs);
      const ox = usToX(proj.outPointUs);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
      ctx.fillRect(ix, RULER_H - 6, Math.max(4, ox - ix), 6);
    }

    // Time ticks
    const stepSec = zoom > 160 ? 1 : zoom > 70 ? 2 : 5;
    const startSec = Math.floor(scrollLeft / zoom / stepSec) * stepSec;
    const endSec = Math.ceil((scrollLeft + w) / zoom) + stepSec;
    ctx.font = '10px "SF Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';

    for (let s = Math.max(0, startSec); s <= endSec; s += stepSec) {
      const x = s * zoom - scrollLeft;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 9);
      ctx.lineTo(x, RULER_H);
      ctx.stroke();
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      ctx.fillText(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, x + 4, 15);
    }

    // Track lanes & clips
    activeTracks.forEach((tr, rowIdx) => {
      const y = RULER_H + rowIdx * TRACK_H;
      ctx.fillStyle = tr.isMain ? 'rgba(34, 211, 238, 0.045)' : rowIdx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.14)';
      ctx.fillRect(0, y, w, TRACK_H);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.moveTo(0, y + TRACK_H);
      ctx.lineTo(w, y + TRACK_H);
      ctx.stroke();

      const trackClips = Object.values(clipsRecord).filter((c) => c.trackId === tr.id);
      for (const clip of trackClips) {
        const x = usToX(clip.timelineStartUs);
        const cw = Math.max(8, (clip.durationUs / US_PER_SEC) * zoom);
        if (x + cw < 0 || x > w) continue;

        const cy = y + 5;
        const ch = TRACK_H - 10;
        const theme = CLIP_THEME[clip.kind];
        const isSel = selSet.has(clip.id);

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, cy, cw, ch, 8);
        ctx.clip();

        ctx.fillStyle = theme.fill;
        ctx.fillRect(x, cy, cw, ch);

        // Filmstrip thumbnails matching exact tile cols (default 24)
        const stripImg = clip.assetId ? stripCacheRef.current.get(clip.assetId) : undefined;
        if (stripImg && stripImg.complete && stripImg.naturalWidth > 0 && (clip.kind === 'video' || clip.kind === 'image')) {
          const cols = clip.kind === 'image' ? 1 : proj.assets[clip.assetId!]?.filmstripCols ?? 24;
          ctx.globalAlpha = 0.55;
          const tileCount = Math.max(1, Math.ceil(cw / 64));
          const sw = Math.max(1, Math.floor(stripImg.naturalWidth / cols));
          for (let ti = 0; ti < tileCount; ti++) {
            const tileIdx = Math.min(cols - 1, Math.floor((ti / tileCount) * cols));
            const sx = tileIdx * sw;
            ctx.drawImage(stripImg, sx, 0, sw, stripImg.naturalHeight, x + ti * 64, cy, 64, ch);
          }
          ctx.globalAlpha = 1;
        }

        // Mipmap Audio Waveform
        const peaks = clip.assetId ? st.waveformCache[clip.assetId] : undefined;
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

        // Specular top edge highlight
        const grad = ctx.createLinearGradient(0, cy, 0, cy + 12);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, cy, cw, 12);

        // Clip label badge
        const badgeText = clip.kind === 'compound' ? `[Compound] ${clip.name}` : clip.name;
        ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = 'rgba(6, 10, 18, 0.68)';
        ctx.fillRect(x + 4, cy + 3, Math.min(cw - 8, ctx.measureText(badgeText).width + 12), 16);
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(badgeText, x + 9, cy + 14.5, Math.max(10, cw - 16));

        // Interactive Keyframe Diamonds
        const allKfTimes = new Set<number>();
        Object.values(clip.keyframes).forEach((arr) => arr?.forEach((k) => allKfTimes.add(k.timeUs)));
        allKfTimes.forEach((kt) => {
          const kx = x + (kt / US_PER_SEC) * zoom;
          const ky = cy + ch - 7;
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(kx, ky - 4.5);
          ctx.lineTo(kx + 4.5, ky);
          ctx.lineTo(kx, ky + 4.5);
          ctx.lineTo(kx - 4.5, ky);
          ctx.closePath();
          ctx.fill();
        });

        ctx.restore();

        // Selection ring & prerender indicator
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

    // Markers
    for (const mk of proj.markers) {
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

    // T-ChatCut Ghost Diff Overlay
    if (st.pendingPlan) {
      for (const op of st.pendingPlan.ops) {
        if (op.timeUs === undefined) continue;
        const ox = usToX(op.timeUs);
        const ow = op.durationUs ? Math.max(6, (op.durationUs / US_PER_SEC) * zoom) : 3;
        ctx.fillStyle = op.op === 'delete' ? 'rgba(251, 113, 133, 0.36)' : 'rgba(34, 211, 238, 0.35)';
        ctx.fillRect(ox, RULER_H, ow, h - RULER_H);
        ctx.strokeStyle = op.op === 'delete' ? '#fb7185' : '#22d3ee';
        ctx.strokeRect(ox, RULER_H, ow, h - RULER_H);
      }
    }

    // Marquee selection box
    const drag = dragRef.current;
    if (drag?.kind === 'marquee') {
      const mx = Math.min(drag.startX, drag.curX);
      const my = Math.min(drag.startY, drag.curY);
      const mw = Math.abs(drag.curX - drag.startX);
      const mh = Math.abs(drag.curY - drag.startY);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx, my, mw, mh);
    }

    // Magnetic Snap Guide
    if (snapGuideXRef.current !== null) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(snapGuideXRef.current, 0);
      ctx.lineTo(snapGuideXRef.current, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Playhead Laser Line
    const phX = usToX(curUs);
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
  }, []);

  // Redraw when React store metadata changes AND imperatively on every 120Hz PlaybackClock tick!
  useEffect(() => {
    let raf = 0;
    const scheduleDraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(drawTimeline);
    };
    scheduleDraw();
    const unsub = playbackClock.subscribe(scheduleDraw);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [drawTimeline, project, nestedScopeId, zoomPxPerSec, scrollLeftPx, selectedClipId, selectedClipIds, waveformCache, pendingPlan]);

  const usToX = (us: number) => (us / US_PER_SEC) * zoomPxPerSec - scrollLeftPx;
  const xToUs = (x: number) => Math.max(0, Math.round(((x + scrollLeftPx) / zoomPxPerSec) * US_PER_SEC));

  const hitTestClip = (x: number, y: number): { clip: Clip; edge: 'left' | 'right' | 'body'; keyframeTimeUs?: number } | null => {
    if (!scope || y < RULER_H) return null;
    const rowIdx = Math.floor((y - RULER_H) / TRACK_H);
    const track = tracks[rowIdx];
    if (!track) return null;
    const cy = RULER_H + rowIdx * TRACK_H + 5;
    const ch = TRACK_H - 10;

    const candidates = Object.values(scope.clips).filter((c) => c.trackId === track.id);
    for (const c of candidates) {
      const cx = usToX(c.timelineStartUs);
      const cw = Math.max(8, (c.durationUs / US_PER_SEC) * zoomPxPerSec);
      if (x >= cx - 4 && x <= cx + cw + 4) {
        // Keyframe diamond hit test
        const ky = cy + ch - 7;
        if (Math.abs(y - ky) <= 7) {
          for (const arr of Object.values(c.keyframes)) {
            if (!arr) continue;
            for (const kf of arr) {
              const kx = cx + (kf.timeUs / US_PER_SEC) * zoomPxPerSec;
              if (Math.abs(x - kx) <= 6) {
                return { clip: c, edge: 'body', keyframeTimeUs: kf.timeUs };
              }
            }
          }
        }
        if (x <= cx + 7) return { clip: c, edge: 'left' };
        if (x >= cx + cw - 7) return { clip: c, edge: 'right' };
        return { clip: c, edge: 'body' };
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!project || !scope) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (y <= RULER_H) {
      dragRef.current = { kind: 'scrub' };
      setPlayheadUs(xToUs(x));
      return;
    }

    const hit = hitTestClip(x, y);
    if (!hit) {
      if (!e.shiftKey) setSelectedClipId(null);
      dragRef.current = { kind: 'marquee', startX: x, startY: y, curX: x, curY: y };
      return;
    }

    const track = tracks.find((t) => t.id === hit.clip.trackId);
    if (track?.locked || hit.clip.locked) {
      setSelectedClipId(hit.clip.id);
      return;
    }

    if (e.shiftKey) {
      toggleClipSelection(hit.clip.id);
    } else {
      setSelectedClipId(hit.clip.id);
    }

    if (tool === 'blade') {
      void splitClipAtPlayhead(hit.clip.id, xToUs(x));
      return;
    }

    if (hit.keyframeTimeUs !== undefined) {
      dragRef.current = {
        kind: 'keyframe',
        clipId: hit.clip.id,
        origTimeUs: hit.keyframeTimeUs,
        currentTimeUs: hit.keyframeTimeUs,
      };
      return;
    }

    // Clone working clip map cleanly so we never mutate React state in-place before commit
    draftClipsRef.current = JSON.parse(JSON.stringify(scope.clips)) as Record<string, Clip>;

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
      let targetClipId = hit.clip.id;
      if (e.altKey) {
        const dupId = `${hit.clip.id}_alt_${Math.random().toString(36).slice(2, 5)}`;
        draftClipsRef.current[dupId] = { ...JSON.parse(JSON.stringify(hit.clip)), id: dupId };
        targetClipId = dupId;
      }
      dragRef.current = {
        kind: 'move',
        clipId: targetClipId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origStartUs: hit.clip.timelineStartUs,
        origTrackId: hit.clip.trackId,
        isDuplicate: e.altKey,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !project || !scope) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drag.kind === 'scrub') {
      setPlayheadUs(xToUs(x));
      return;
    }

    if (drag.kind === 'marquee') {
      drag.curX = x;
      drag.curY = y;
      drawTimeline();
      return;
    }

    if (drag.kind === 'keyframe') {
      const clip = scope.clips[drag.clipId];
      if (!clip) return;
      const newLocal = Math.max(0, Math.min(clip.durationUs, xToUs(x) - clip.timelineStartUs));
      drag.currentTimeUs = newLocal;
      drawTimeline();
      return;
    }

    const draftClips = draftClipsRef.current;
    if (!draftClips) return;
    const clip = draftClips[drag.clipId];
    if (!clip) return;

    const deltaUs = Math.round(((e.clientX - drag.startClientX) / zoomPxPerSec) * US_PER_SEC);

    if (drag.kind === 'move') {
      let candidate = Math.max(0, drag.origStartUs + deltaUs);
      // Cross-track vertical dragging
      const hoverRow = Math.min(tracks.length - 1, Math.max(0, Math.floor((y - RULER_H) / TRACK_H)));
      const hoverTrack = tracks[hoverRow];
      if (hoverTrack && !hoverTrack.locked) {
        const compatible =
          (clip.kind === 'audio' && hoverTrack.type === 'audio') ||
          (clip.kind === 'text' && hoverTrack.type === 'text') ||
          ((clip.kind === 'effect' || clip.kind === 'adjustment') && (hoverTrack.type === 'effect' || hoverTrack.type === 'adjustment')) ||
          ((clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'compound') &&
            (hoverTrack.type === 'video' || hoverTrack.type === 'overlay'));
        if (compatible) {
          clip.trackId = hoverTrack.id;
        }
      }

      const snapTargets = [playbackClock.getTimeUs(), 0, ...project.markers.map((m) => m.timeUs)];
      Object.values(draftClips).forEach((other) => {
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
      snapGuideXRef.current = snappedX;
      clip.timelineStartUs = candidate;
      drawTimeline();
    } else if (drag.kind === 'trim-left') {
      const clampedDelta = Math.min(drag.origDurUs - 200_000, Math.max(-drag.origStartUs, deltaUs));
      clip.timelineStartUs = drag.origStartUs + clampedDelta;
      clip.durationUs = drag.origDurUs - clampedDelta;
      clip.sourceStartUs = Math.max(0, drag.origSrcStartUs + clampedDelta);
      drawTimeline();
    } else if (drag.kind === 'trim-right') {
      clip.durationUs = Math.max(200_000, drag.origDurUs + deltaUs);
      clip.sourceDurationUs = Math.round(clip.durationUs * (clip.speed.rate || 1));
      drawTimeline();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !project || !scope) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    snapGuideXRef.current = null;

    if (drag.kind === 'scrub') return;

    if (drag.kind === 'marquee') {
      const dx = Math.abs(drag.curX - drag.startX);
      const dy = Math.abs(drag.curY - drag.startY);
      if (dx < 6 && dy < 6) {
        setPlayheadUs(xToUs(drag.startX));
      } else {
        const minX = Math.min(drag.startX, drag.curX);
        const maxX = Math.max(drag.startX, drag.curX);
        const minY = Math.min(drag.startY, drag.curY);
        const maxY = Math.max(drag.startY, drag.curY);
        const hitIds: string[] = [];
        tracks.forEach((tr, rowIdx) => {
          const ty = RULER_H + rowIdx * TRACK_H;
          if (ty + TRACK_H < minY || ty > maxY) return;
          Object.values(scope.clips)
            .filter((c) => c.trackId === tr.id)
            .forEach((c) => {
              const cx = usToX(c.timelineStartUs);
              const cw = (c.durationUs / US_PER_SEC) * zoomPxPerSec;
              if (cx + cw >= minX && cx <= maxX) hitIds.push(c.id);
            });
        });
        setSelectedClipIds(hitIds);
      }
      drawTimeline();
      return;
    }

    if (drag.kind === 'keyframe') {
      if (Math.abs(drag.currentTimeUs - drag.origTimeUs) > 10_000) {
        void moveKeyframeTime(drag.clipId, drag.origTimeUs, drag.currentTimeUs);
      }
      return;
    }

    const finishedClips = draftClipsRef.current;
    draftClipsRef.current = null;
    if (finishedClips) {
      const next = JSON.parse(JSON.stringify(project)) as typeof project;
      if (nestedScopeId && next.nestedTimelines?.[nestedScopeId]) {
        next.nestedTimelines[nestedScopeId].clips = finishedClips;
      } else {
        next.clips = finishedClips;
      }
      void commitProject(drag.kind === 'move' && drag.isDuplicate ? 'Nhân bản (Option+Drag)' : `Timeline (${drag.kind})`, next);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTestClip(x, y);
    if (!hit) return;
    if (hit.keyframeTimeUs !== undefined) {
      void deleteKeyframeAtTime(hit.clip.id, hit.keyframeTimeUs);
      return;
    }
    if (hit.clip.kind === 'compound' && hit.clip.compoundTimelineId) {
      enterNestedScope(hit.clip.compoundTimelineId);
    }
  };

  const handleCanvasDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dropUs = xToUs(x);
    const rowIdx = Math.min(tracks.length - 1, Math.max(0, Math.floor((y - RULER_H) / TRACK_H)));
    const targetTrack = tracks[rowIdx];

    const assetJson = e.dataTransfer.getData('application/x-tcapcut-asset');
    if (assetJson) {
      try {
        const asset = JSON.parse(assetJson) as NonNullable<typeof project.assets[string]>;
        void addAssetToTimeline(asset, targetTrack?.id, dropUs);
      } catch {
        // ignore
      }
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (file) {
      void (async () => {
        await uploadMediaFile(file);
        const latest = useEditorStore.getState().project;
        if (!latest) return;
        const newestAsset = Object.values(latest.assets).sort((a, b) => b.createdAt - a.createdAt)[0];
        if (newestAsset) {
          await addAssetToTimeline(newestAsset, targetTrack?.id, dropUs);
        }
      })();
    }
  };

  const selectedClip = scope && selectedClipId ? scope.clips[selectedClipId] : null;

  return (
    <div className="nle-content-surface" style={{ height: heightPx, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      {/* Timeline Toolbar + Nested Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {nestedScopeId && (
            <button className="glass-btn glass-btn-active" onClick={() => exitNestedScope()} title="Quay lại Main Timeline">
              <ArrowLeft size={13} /> Main Timeline &gt; {scope?.name}
            </button>
          )}
          <button
            className={`glass-btn ${tool === 'select' ? 'glass-btn-active' : ''}`}
            onClick={() => setTool('select')}
            title="Chọn & Marquee (V)"
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
          <button className="glass-btn" onClick={() => void splitClipAtPlayhead()} title="Cắt đôi clip (Cmd+B)">
            Split
          </button>
          <button className="glass-btn" onClick={() => void duplicateSelectedClip()} disabled={!selectedClipId} title="Nhân bản (hoặc Option+Drag)">
            <Copy size={13} />
          </button>
          <button className="glass-btn" onClick={() => void prerenderSelectedClip()} disabled={!selectedClipId} title="Pre-render segment cache">
            <Sparkles size={13} color="#34d399" /> Pre-Render
          </button>
          <button className="glass-btn" onClick={() => void createFreezeFrameAtPlayhead()} title="Freeze Frame tại Playhead">
            <Snowflake size={13} color="#67e8f9" /> Freeze
          </button>
          <button className="glass-btn" onClick={() => void createCompoundFromTrack()} title="Gộp Compound Clip">
            <Layers size={13} color="#c084fc" /> Compound
          </button>
          {selectedClip?.kind === 'compound' && (
            <button className="glass-btn" onClick={() => void ungroupCompoundClip(selectedClip.id)} title="Tách Compound Clip">
              <Unlink size={13} color="#fbbf24" /> Ungroup
            </button>
          )}
          <button className="glass-btn" onClick={() => void addMarkerAtPlayhead()} title="Marker (M)">
            <BookmarkPlus size={13} color="#fbbf24" />
          </button>

          <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
            <button className="glass-btn" style={{ padding: '4px 7px', fontSize: 10.5 }} onClick={() => void setInOutPoint('in')} title="Đặt điểm In (I)">
              I
            </button>
            <button className="glass-btn" style={{ padding: '4px 7px', fontSize: 10.5 }} onClick={() => void setInOutPoint('out')} title="Đặt điểm Out (O)">
              O
            </button>
            {project?.inPointUs != null && (
              <button className="glass-btn" style={{ padding: '4px 6px', fontSize: 10 }} onClick={() => void clearInOutPoints()} title="Xóa vùng I/O">
                Clear I/O
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <button className="glass-btn" onClick={() => setAddTrackMenu(!addTrackMenu)} title="Thêm Track mới">
              <Plus size={13} /> Track
            </button>
            {addTrackMenu && (
              <div
                className="liquid-glass-chrome"
                style={{ position: 'absolute', bottom: 36, right: 0, width: 150, padding: 6, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {(['overlay', 'video', 'audio', 'text', 'effect'] as TrackType[]).map((tt) => (
                  <button
                    key={tt}
                    className="glass-btn"
                    style={{ fontSize: 11, justifyContent: 'flex-start' }}
                    onClick={() => {
                      setAddTrackMenu(false);
                      void addTrack(tt);
                    }}
                  >
                    + Track {tt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="glass-btn" onClick={() => setZoomPxPerSec(zoomPxPerSec * 0.8)}>
            <ZoomOut size={13} />
          </button>
          <input
            type="range"
            className="glass-slider"
            style={{ width: 96 }}
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
        <div className="glass-scroll" style={{ width: HEADER_W, borderRight: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8, 11, 19, 0.72)', overflowY: 'auto' }}>
          <div style={{ height: RULER_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', fontSize: 10, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span>TRACKS ({tracks.length})</span>
            {selectedClipIds.length > 1 && <span style={{ color: '#22d3ee' }}>{selectedClipIds.length} chọn</span>}
          </div>
          {tracks.map((tr: Track) => (
            <div
              key={tr.id}
              style={{
                height: TRACK_H,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontSize: 11,
              }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 82 }}>
                <div style={{ fontWeight: 600, color: tr.isMain ? '#22d3ee' : '#e2e8f0' }}>{tr.name}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{tr.type}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => void toggleTrackProp(tr.id, 'solo')}
                  style={{
                    background: tr.solo ? 'rgba(251,191,36,0.22)' : 'none',
                    border: 'none',
                    borderRadius: 4,
                    color: tr.solo ? '#fbbf24' : '#64748b',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 4px',
                  }}
                  title="Solo Track (Chỉ nghe Track này)"
                >
                  S
                </button>
                <button
                  onClick={() => void toggleTrackProp(tr.id, 'muted')}
                  style={{ background: 'none', border: 'none', color: tr.muted ? '#fb7185' : '#94a3b8', cursor: 'pointer', padding: 2 }}
                  title="Mute Track"
                >
                  {tr.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                {tr.isMain && (
                  <button
                    onClick={() => void toggleTrackProp(tr.id, 'magnetic')}
                    style={{ background: 'none', border: 'none', color: tr.magnetic ? '#22d3ee' : '#64748b', cursor: 'pointer', padding: 2 }}
                    title="Magnetic Main Track"
                  >
                    <Magnet size={12} />
                  </button>
                )}
                <button
                  onClick={() => void toggleTrackProp(tr.id, 'locked')}
                  style={{ background: 'none', border: 'none', color: tr.locked ? '#fbbf24' : '#64748b', cursor: 'pointer', padding: 2 }}
                  title="Lock Track"
                >
                  <Lock size={12} />
                </button>
                {!tr.isMain && (
                  <button
                    onClick={() => void removeTrack(tr.id)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2 }}
                    title="Xóa Track trống"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

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
            onDoubleClick={handleDoubleClick}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleCanvasDrop}
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
