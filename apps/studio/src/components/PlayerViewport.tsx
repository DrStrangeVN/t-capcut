import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Crop,
  Eye,
  Film,
  Maximize,
  Maximize2,
  Pause,
  Pipette,
  Play,
  RotateCw,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
} from 'lucide-react';
import {
  US_PER_SEC,
  getClipPropertyAtTime,
  isClipAudioAudible,
  mapLocalTimelineToSourceUs,
  resolveEffectiveClips,
  type Clip,
} from '@t-capcut/schema';
import { assetMediaUrl } from '../engine/api';
import { AudioGraphEngine } from '../engine/AudioGraphEngine';
import { renderAllOverlays2D } from '../engine/OverlayRenderer';
import { playbackClock } from '../engine/PlaybackClock';
import { WebGLCompositor } from '../engine/WebGLCompositor';
import { useEditorStore } from '../store/useEditorStore';
import { VideoScopesPanel } from './VideoScopesPanel';

function formatTimecode(us: number): string {
  const totalMs = Math.max(0, Math.floor(us / 1000));
  const ms = Math.floor((totalMs % 1000) / 10);
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60_000) % 60;
  const h = Math.floor(totalMs / 3_600_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

type GizmoDragState =
  | {
      kind: 'move';
      clipId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      kind: 'scale';
      clipId: string;
      centerClientX: number;
      centerClientY: number;
      startDist: number;
      origScaleX: number;
      origScaleY: number;
    }
  | {
      kind: 'rotate';
      clipId: string;
      centerClientX: number;
      centerClientY: number;
      startAngle: number;
      origRotation: number;
    }
  | {
      kind: 'compare';
    };

export const PlayerViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timecodeRef = useRef<HTMLSpanElement | null>(null);
  const renderMsRef = useRef<HTMLSpanElement | null>(null);
  const shuttleBadgeRef = useRef<HTMLSpanElement | null>(null);
  const vuLeftRef = useRef<HTMLDivElement | null>(null);
  const vuRightRef = useRef<HTMLDivElement | null>(null);

  const compositorRef = useRef<WebGLCompositor | null>(null);
  const audioGraphRef = useRef<AudioGraphEngine | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const mediaSrcSignatureRef = useRef<Map<string, string>>(new Map());
  const maskElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const dragRef = useRef<GizmoDragState | null>(null);

  const project = useEditorStore((s) => s.project);
  const nestedScopeId = useEditorStore((s) => s.nestedScopeId);
  const playheadUs = useEditorStore((s) => s.playheadUs);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const showSafeZones = useEditorStore((s) => s.showSafeZones);
  const showScopes = useEditorStore((s) => s.showScopes);
  const cropMode = useEditorStore((s) => s.cropMode);
  const eyedropperActive = useEditorStore((s) => s.eyedropperActive);
  const loadedLuts = useEditorStore((s) => s.loadedLuts);
  const ambientGlowColor = useEditorStore((s) => s.ambientGlowColor);

  const setPlayheadUs = useEditorStore((s) => s.setPlayheadUs);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setSelectedClipId = useEditorStore((s) => s.setSelectedClipId);
  const setShowSafeZones = useEditorStore((s) => s.setShowSafeZones);
  const setShowScopes = useEditorStore((s) => s.setShowScopes);
  const setCropMode = useEditorStore((s) => s.setCropMode);
  const setEyedropperActive = useEditorStore((s) => s.setEyedropperActive);
  const setAmbientGlowColor = useEditorStore((s) => s.setAmbientGlowColor);
  const splitClipAtPlayhead = useEditorStore((s) => s.splitClipAtPlayhead);
  const deleteSelectedClip = useEditorStore((s) => s.deleteSelectedClip);
  const previewSelectedClip = useEditorStore((s) => s.previewSelectedClip);
  const commitCurrentProject = useEditorStore((s) => s.commitCurrentProject);
  const updateSelectedClip = useEditorStore((s) => s.updateSelectedClip);
  const toggleColoristMode = useEditorStore((s) => s.toggleColoristMode);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  const [snapAxes, setSnapAxes] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [compareMode, setCompareMode] = useState(false);
  const [compareSplitX, setCompareSplitX] = useState(0.5);
  const compareStateRef = useRef<{ active: boolean; splitX: number }>({ active: false, splitX: 0.5 });
  const [inlineTextEdit, setInlineTextEdit] = useState<{ clipId: string; value: string } | null>(null);

  useEffect(() => {
    compareStateRef.current = { active: compareMode, splitX: compareSplitX };
  }, [compareMode, compareSplitX]);

  // Initialize WebGL2 Compositor + WebAudio Graph + dispose on unmount
  useEffect(() => {
    if (!canvasRef.current) return;
    const comp = new WebGLCompositor(canvasRef.current);
    const ag = new AudioGraphEngine();
    compositorRef.current = comp;
    audioGraphRef.current = ag;
    return () => {
      comp.dispose();
      ag.dispose();
      compositorRef.current = null;
      audioGraphRef.current = null;
      mediaElementsRef.current.forEach((el) => {
        if (el instanceof HTMLVideoElement) {
          el.pause();
          el.removeAttribute('src');
          el.load();
        }
      });
      mediaElementsRef.current.clear();
      maskElementsRef.current.forEach((m) => {
        m.pause();
        m.removeAttribute('src');
        m.load();
      });
      maskElementsRef.current.clear();
    };
  }, []);

  // Upload registered 3D LUTs
  useEffect(() => {
    const comp = compositorRef.current;
    if (!comp) return;
    Object.values(loadedLuts).forEach((lut) => comp.uploadLut(lut));
  }, [loadedLuts]);

  // Synchronize Clip-Keyed HTML Media Pool with effective flattened clips (fixes same-assetId PiP/split bug + Compound clips)
  useEffect(() => {
    if (!project) return;
    const flatClips = resolveEffectiveClips(project, nestedScopeId);
    const map = mediaElementsRef.current;
    const sigMap = mediaSrcSignatureRef.current;
    const maskMap = maskElementsRef.current;
    const validIds = new Set<string>();

    for (const clip of flatClips) {
      if (!clip.assetId || (clip.kind !== 'video' && clip.kind !== 'image' && clip.kind !== 'audio')) continue;
      const asset = project.assets[clip.assetId];
      if (!asset) continue;
      validIds.add(clip.id);

      const useProxy = project.settings.proxyEnabled && asset.proxyPath;
      const streamSrc = assetMediaUrl(asset.id, useProxy ? 'proxy' : 'source');

      if (asset.kind === 'image') {
        let img = map.get(clip.id) as HTMLImageElement | undefined;
        if (!img || !(img instanceof HTMLImageElement)) {
          img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = streamSrc;
          map.set(clip.id, img);
          sigMap.set(clip.id, streamSrc);
        } else if (sigMap.get(clip.id) !== streamSrc) {
          img.src = streamSrc;
          sigMap.set(clip.id, streamSrc);
        }
      } else {
        let vid = map.get(clip.id) as HTMLVideoElement | undefined;
        if (!vid || !(vid instanceof HTMLVideoElement)) {
          vid = document.createElement('video');
          vid.crossOrigin = 'anonymous';
          vid.preload = 'auto';
          vid.playsInline = true;
          vid.src = streamSrc;
          map.set(clip.id, vid);
          sigMap.set(clip.id, streamSrc);
        } else if (sigMap.get(clip.id) !== streamSrc) {
          vid.src = streamSrc;
          sigMap.set(clip.id, streamSrc);
        }
      }

      if (asset.mattingMaskPath && clip.aiMattingEnabled) {
        let mVid = maskMap.get(clip.id);
        const mSrc = assetMediaUrl(asset.id, 'mask');
        if (!mVid) {
          mVid = document.createElement('video');
          mVid.crossOrigin = 'anonymous';
          mVid.preload = 'auto';
          mVid.muted = true;
          mVid.playsInline = true;
          mVid.src = mSrc;
          maskMap.set(clip.id, mVid);
        }
      }
    }

    // Prune stale pool entries when clips are deleted
    for (const oldId of Array.from(map.keys())) {
      if (!validIds.has(oldId)) {
        const el = map.get(oldId);
        if (el instanceof HTMLVideoElement) {
          el.pause();
          el.removeAttribute('src');
          el.load();
        }
        map.delete(oldId);
        sigMap.delete(oldId);
      }
    }
    for (const oldMaskId of Array.from(maskMap.keys())) {
      if (!validIds.has(oldMaskId)) {
        const m = maskMap.get(oldMaskId);
        m?.pause();
        m?.removeAttribute('src');
        maskMap.delete(oldMaskId);
      }
    }
  }, [project, nestedScopeId]);

  // Wake WebAudio on play toggle
  useEffect(() => {
    if (isPlaying) {
      audioGraphRef.current?.ensureReady();
    }
  }, [isPlaying]);

  // Zero-ReRender 120Hz Playback Clock & Frame Render Loop
  useEffect(() => {
    if (!project) return;
    let rafId = 0;
    let lastTs = performance.now();
    let lastRenderKey = '';
    let lastMsTextUpdate = 0;

    const flatClips = resolveEffectiveClips(project, nestedScopeId);
    const totalDurationUs = Math.max(
      5 * US_PER_SEC,
      flatClips.reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0)
    );

    const tick = (now: number) => {
      const dtMs = Math.min(80, Math.max(0, now - lastTs));
      lastTs = now;

      let curUs = playbackClock.getTimeUs();
      const playing = playbackClock.isPlaying();
      const shuttle = playbackClock.getShuttleRate();

      if (playing) {
        curUs += Math.round(dtMs * 1000 * shuttle);
        const inPt = project.inPointUs;
        const outPt = project.outPointUs;
        if (inPt != null && outPt != null && outPt > inPt + 100_000) {
          if (curUs >= outPt) curUs = inPt;
          else if (curUs < inPt) curUs = outPt - 50_000;
        } else if (curUs >= totalDurationUs) {
          curUs = 0;
          playbackClock.setPlaying(false);
          setIsPlaying(false);
        } else if (curUs < 0) {
          curUs = 0;
          playbackClock.setPlaying(false);
          setIsPlaying(false);
        }
        playbackClock.setTimeUs(curUs);
      }

      // Direct DOM timecode & shuttle badge update (0 React re-render)
      if (timecodeRef.current) {
        timecodeRef.current.textContent = formatTimecode(curUs);
      }
      if (shuttleBadgeRef.current) {
        shuttleBadgeRef.current.textContent = playing && shuttle !== 1 ? `${shuttle}x` : '';
      }

      // Render 2D Overlays (25 Text/Karaoke/Lower-Third templates + 24 Stickers & Particle Systems) in lockstep
      const ovCanvas = overlayCanvasRef.current;
      if (ovCanvas) {
        const w = project.settings.width;
        const h = project.settings.height;
        if (ovCanvas.width !== w || ovCanvas.height !== h) {
          ovCanvas.width = w;
          ovCanvas.height = h;
        }
        const ovCtx = ovCanvas.getContext('2d');
        if (ovCtx) {
          renderAllOverlays2D(ovCtx, flatClips, curUs, w, h, {
            selectedClipId: useEditorStore.getState().selectedClipId,
            burnSubtitles: true,
          });
        }
      }

      // Active media & audio synchronization per clip.id
      const activeClips = flatClips.filter(
        (c) => c.assetId && curUs >= c.timelineStartUs && curUs < c.timelineStartUs + c.durationUs
      );
      const activeMap = new Map(activeClips.map((c) => [c.id, c]));
      const anyVoiceActive = activeClips.some((c) => c.kind === 'video' && !c.audio.autoDucking && isClipAudioAudible(c, project));

      mediaElementsRef.current.forEach((el, clipId) => {
        if (!(el instanceof HTMLVideoElement)) return;
        const clip = activeMap.get(clipId);
        if (!clip) {
          if (!el.paused) el.pause();
          return;
        }
        const track = project.tracks.find((t) => t.id === clip.trackId);
        const localUs = curUs - clip.timelineStartUs;
        const targetSec = mapLocalTimelineToSourceUs(clip, localUs) / US_PER_SEC;
        const audible = isClipAudioAudible(clip, project);

        el.playbackRate = Math.min(4, Math.max(0.25, (clip.speed.rate || 1) * Math.abs(shuttle)));
        audioGraphRef.current?.attachAndSyncClip(
          el,
          clip,
          localUs,
          audible,
          track?.volume ?? 1,
          anyVoiceActive
        );

        if (playing && shuttle > 0 && !clip.speed.reverse) {
          if (el.paused) {
            el.currentTime = targetSec;
            void el.play().catch(() => {});
          } else if (Math.abs(el.currentTime - targetSec) > 0.16) {
            el.currentTime = targetSec;
          }
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - targetSec) > 0.03) {
            el.currentTime = targetSec;
          }
        }

        const maskVid = maskElementsRef.current.get(clipId);
        if (maskVid && clip.aiMattingEnabled && Math.abs(maskVid.currentTime - targetSec) > 0.05) {
          maskVid.currentTime = targetSec;
        }
      });

      maskElementsRef.current.forEach((mVid, cid) => {
        if (!activeMap.has(cid) && !mVid.paused) mVid.pause();
      });

      // Dirty-frame check: skip GPU pass if paused and project+playhead+media unchanged
      const comp = compositorRef.current;
      const cmp = compareStateRef.current;
      const renderKey = `${project.updatedAt}:${curUs}:${nestedScopeId ?? ''}:${cmp.active ? cmp.splitX.toFixed(3) : 'off'}:${JSON.stringify(project.clips).length}`;
      if (comp && (playing || renderKey !== lastRenderKey || activeClips.some((c) => c.kind === 'video'))) {
        lastRenderKey = renderKey;
        const tStart = performance.now();
        const glow = comp.renderFrame(project, curUs, mediaElementsRef.current, maskElementsRef.current, {
          nestedScopeId,
          compareSplitX: cmp.active ? cmp.splitX : null,
        });
        const costMs = Math.round((performance.now() - tStart) * 10) / 10;
        if (renderMsRef.current && now - lastMsTextUpdate > 140) {
          lastMsTextUpdate = now;
          renderMsRef.current.textContent = `GPU ${costMs}ms`;
        }
        if (glow && glow !== ambientGlowColor) {
          setAmbientGlowColor(glow);
        }
      }

      // Live Stereo VU Meter DOM update
      if (audioGraphRef.current && vuLeftRef.current && vuRightRef.current) {
        const lv = playing ? audioGraphRef.current.getStereoLevels() : { leftNorm: 0, rightNorm: 0 };
        vuLeftRef.current.style.width = `${Math.round(lv.leftNorm * 100)}%`;
        vuRightRef.current.style.width = `${Math.round(lv.rightNorm * 100)}%`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [project, nestedScopeId, setIsPlaying, setAmbientGlowColor, ambientGlowColor]);

  const effectiveClips = project ? resolveEffectiveClips(project, nestedScopeId) : [];
  const totalDurationUs = project
    ? Math.max(
        5 * US_PER_SEC,
        effectiveClips.reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0)
      )
    : 5 * US_PER_SEC;

  const selectedClip = project && selectedClipId ? project.clips[selectedClipId] : null;
  const aspectRatioCss = project ? `${project.settings.width} / ${project.settings.height}` : '16 / 9';

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!project) return;
    const curUs = playbackClock.getTimeUs();

    if (eyedropperActive && selectedClip && compositorRef.current && stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
      const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
      const pickedHex = compositorRef.current.samplePixelHex(nx, ny);
      setEyedropperActive(false);
      void updateSelectedClip(`Chroma Eyedropper ${pickedHex}`, (c) => {
        c.chromaKey.enabled = true;
        c.chromaKey.colorHex = pickedHex;
      });
      setStatusMessage(`Đã hút màu Chroma Key: ${pickedHex}`);
      return;
    }

    const rect = stageRef.current?.getBoundingClientRect();
    const clickNormX = rect ? ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1 : 0;
    const clickNormY = rect ? ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1 : 0;

    const activeAll = Object.values(project.clips).filter(
      (c) => !c.disabled && curUs >= c.timelineStartUs && curUs < c.timelineStartUs + c.durationUs
    );
    const overlayHit = activeAll.find(
      (c) =>
        (c.kind === 'text' || (c.kind === 'sticker' && !c.sticker?.particleType)) &&
        Math.abs(clickNormX - c.transform.x) < 0.42 &&
        Math.abs(clickNormY - c.transform.y) < 0.22
    );

    const hit =
      overlayHit ??
      (selectedClip && curUs >= selectedClip.timelineStartUs && curUs < selectedClip.timelineStartUs + selectedClip.durationUs
        ? selectedClip
        : activeAll.find((c) => c.kind === 'video' || c.kind === 'image' || c.kind === 'compound'));
    if (!hit) return;
    setSelectedClipId(hit.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'move',
      clipId: hit.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: hit.transform.x,
      origY: hit.transform.y,
    };
  };

  const handleCornerScalePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedClip || !stageRef.current) return;
    e.stopPropagation();
    stageRef.current.setPointerCapture(e.pointerId);
    const rect = stageRef.current.getBoundingClientRect();
    const cx = rect.left + (0.5 + selectedClip.transform.x * 0.5) * rect.width;
    const cy = rect.top + (0.5 + selectedClip.transform.y * 0.5) * rect.height;
    const dist = Math.max(12, Math.hypot(e.clientX - cx, e.clientY - cy));
    dragRef.current = {
      kind: 'scale',
      clipId: selectedClip.id,
      centerClientX: cx,
      centerClientY: cy,
      startDist: dist,
      origScaleX: selectedClip.transform.scaleX,
      origScaleY: selectedClip.transform.scaleY,
    };
  };

  const handleRotatePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedClip || !stageRef.current) return;
    e.stopPropagation();
    stageRef.current.setPointerCapture(e.pointerId);
    const rect = stageRef.current.getBoundingClientRect();
    const cx = rect.left + (0.5 + selectedClip.transform.x * 0.5) * rect.width;
    const cy = rect.top + (0.5 + selectedClip.transform.y * 0.5) * rect.height;
    const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
    dragRef.current = {
      kind: 'rotate',
      clipId: selectedClip.id,
      centerClientX: cx,
      centerClientY: cy,
      startAngle: ang,
      origRotation: selectedClip.transform.rotation,
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !project) return;

    if (drag.kind === 'move') {
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = ((e.clientX - drag.startX) / Math.max(1, rect.width)) * 2;
      const dy = ((e.clientY - drag.startY) / Math.max(1, rect.height)) * 2;
      const snapX = Math.abs(drag.origX + dx) < 0.035;
      const snapY = Math.abs(drag.origY + dy) < 0.035;
      setSnapAxes({ x: snapX, y: snapY });
      const nextX = snapX ? 0 : Number((drag.origX + dx).toFixed(3));
      const nextY = snapY ? 0 : Number((drag.origY + dy).toFixed(3));
      previewSelectedClip((c) => {
        c.transform.x = nextX;
        c.transform.y = nextY;
      });
    } else if (drag.kind === 'scale') {
      const curDist = Math.max(10, Math.hypot(e.clientX - drag.centerClientX, e.clientY - drag.centerClientY));
      const ratio = curDist / drag.startDist;
      const sx = Math.min(4, Math.max(0.1, Number((drag.origScaleX * ratio).toFixed(3))));
      const sy = Math.min(4, Math.max(0.1, Number((drag.origScaleY * ratio).toFixed(3))));
      previewSelectedClip((c) => {
        c.transform.scaleX = sx;
        c.transform.scaleY = sy;
      });
    } else if (drag.kind === 'rotate') {
      const curAng = Math.atan2(e.clientY - drag.centerClientY, e.clientX - drag.centerClientX);
      const deg = ((curAng - drag.startAngle) * 180) / Math.PI;
      let nextRot = Math.round(drag.origRotation + deg);
      if (Math.abs(nextRot % 90) < 4) nextRot = Math.round(nextRot / 90) * 90;
      previewSelectedClip((c) => {
        c.transform.rotation = nextRot;
      });
    } else if (drag.kind === 'compare') {
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / Math.max(1, rect.width)));
      setCompareSplitX(nx);
      compareStateRef.current.splitX = nx;
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const wasCompare = drag.kind === 'compare';
    dragRef.current = null;
    setSnapAxes({ x: false, y: false });
    if (!wasCompare) {
      void commitCurrentProject(`Viewport Gizmo (${drag.kind})`);
    }
  };

  const handleStageDoubleClick = () => {
    if (!project) return;
    const curUs = playbackClock.getTimeUs();
    const activeText = Object.values(project.clips).find(
      (c) => c.kind === 'text' && c.text && !c.disabled && curUs >= c.timelineStartUs && curUs < c.timelineStartUs + c.durationUs
    );
    const target = selectedClip?.kind === 'text' && selectedClip.text ? selectedClip : activeText;
    if (target?.text) {
      setSelectedClipId(target.id);
      setInlineTextEdit({ clipId: target.id, value: target.text.text });
    }
  };

  const curTimeForGizmo = playbackClock.getTimeUs();
  const showGizmo =
    selectedClip &&
    (selectedClip.kind === 'video' ||
      selectedClip.kind === 'image' ||
      selectedClip.kind === 'compound' ||
      selectedClip.kind === 'text' ||
      (selectedClip.kind === 'sticker' && !selectedClip.sticker?.particleType)) &&
    curTimeForGizmo >= selectedClip.timelineStartUs &&
    curTimeForGizmo < selectedClip.timelineStartUs + selectedClip.durationUs;

  return (
    <div className="nle-content-surface" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      {/* Ambient Video Glow Halo */}
      {project?.settings.ambientGlow && !project?.settings.coloristMode && (
        <div
          style={{
            position: 'absolute',
            inset: '12% 16%',
            borderRadius: '32px',
            background: ambientGlowColor,
            filter: 'blur(64px)',
            pointerEvents: 'none',
            transition: 'background 300ms ease',
            zIndex: 0,
          }}
        />
      )}

      {/* Viewport Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, zIndex: 2, gap: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <Film size={13} color="#22d3ee" />
          <span>Preview</span>
          {project && (
            <span className="mono" style={{ padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 10.5 }}>
              {project.settings.width}×{project.settings.height} · {project.settings.fps}fps
            </span>
          )}
          <span ref={renderMsRef} className="mono" style={{ fontSize: 10.5, color: '#34d399' }}>
            GPU 0ms
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {selectedClip && (selectedClip.kind === 'video' || selectedClip.kind === 'image') && (
            <button
              className={`glass-btn ${selectedClip.transform.fillMode === 'cover' ? 'glass-btn-active' : ''}`}
              style={{ padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' }}
              onClick={() =>
                void updateSelectedClip(
                  selectedClip.transform.fillMode === 'cover' ? 'Fit Khung Hình' : 'Fill Đầy Khung (Cover)',
                  (c) => {
                    c.transform.fillMode = c.transform.fillMode === 'cover' ? 'fit' : 'cover';
                  }
                )
              }
              title="Bật/tắt Fill đầy khung (loại bỏ viền đen khi khung dọc/ngang lệch nhau)"
            >
              <Maximize size={12} /> {selectedClip.transform.fillMode === 'cover' ? 'Cover' : 'Fit'}
            </button>
          )}
          <button
            className={`glass-btn ${compareMode ? 'glass-btn-active' : ''}`}
            style={{ padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' }}
            onClick={() => setCompareMode(!compareMode)}
            title="So sánh Before/After (Gốc ↔ LUT + Multi-FX GPU)"
          >
            <SplitSquareHorizontal size={12} /> Compare
          </button>
          <button
            className={`glass-btn ${cropMode ? 'glass-btn-active' : ''}`}
            style={{ padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' }}
            onClick={() => setCropMode(!cropMode)}
            title="Chế độ Crop khung hình"
          >
            <Crop size={12} /> Crop
          </button>
          <button
            className={`glass-btn ${eyedropperActive ? 'glass-btn-active' : ''}`}
            style={{ padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' }}
            onClick={() => setEyedropperActive(!eyedropperActive)}
            disabled={!selectedClip}
            title="Hút màu Phông Xanh trực tiếp từ Video"
          >
            <Pipette size={12} /> Eyedropper
          </button>
          <button
            className={`glass-btn ${showScopes ? 'glass-btn-active' : ''}`}
            style={{ padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' }}
            onClick={() => setShowScopes(!showScopes)}
            title="Bật RGB Parade & Luma Waveform Scopes"
          >
            <Activity size={12} /> Scopes
          </button>
          <button
            className={`glass-btn ${showSafeZones ? 'glass-btn-active' : ''}`}
            style={{ padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' }}
            onClick={() => setShowSafeZones(!showSafeZones)}
            title="Khung an toàn TikTok / Reels / YouTube"
          >
            <Maximize2 size={12} /> Safe
          </button>
          <button
            className={`glass-btn ${project?.settings.coloristMode ? 'glass-btn-active' : ''}`}
            style={{ padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' }}
            onClick={() => void toggleColoristMode()}
            title="Colorist Mode: Nền xám Rec.709 trung tính khi chỉnh màu"
          >
            <Eye size={12} /> {project?.settings.coloristMode ? 'Colorist On' : 'Colorist'}
          </button>
        </div>
      </div>

      <VideoScopesPanel sourceCanvasRef={canvasRef} />

      {/* Centered Aspect-Ratio Canvas Stage */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          ref={stageRef}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onDoubleClick={handleStageDoubleClick}
          style={{
            position: 'relative',
            aspectRatio: aspectRatioCss,
            maxWidth: '100%',
            maxHeight: '100%',
            height: '100%',
            borderRadius: 12,
            overflow: 'hidden',
            border: eyedropperActive ? '2px solid #34d399' : '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
            background: '#05070b',
            cursor: eyedropperActive ? 'crosshair' : 'grab',
          }}
        >
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

          {/* Unified WYSIWYG 2D Overlay Layer (Stickers + Particles + Text/Karaoke Animations) */}
          <canvas
            ref={overlayCanvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          />

          {/* Interactive On-Canvas Gizmo (Corner Scale + Top Rotate Handle + Magnetic Snap Guides) */}
          {showGizmo && selectedClip && (
            <div
              style={{
                position: 'absolute',
                inset: '6%',
                border: '1.5px solid rgba(34, 211, 238, 0.85)',
                borderRadius: 6,
                pointerEvents: 'none',
                transform: `translate(${selectedClip.transform.x * 50}%, ${selectedClip.transform.y * 50}%) scale(${selectedClip.transform.scaleX}, ${selectedClip.transform.scaleY}) rotate(${selectedClip.transform.rotation}deg)`,
              }}
            >
              {/* Top Rotation Handle */}
              <div
                onPointerDown={handleRotatePointerDown}
                title="Kéo để xoay clip"
                style={{
                  position: 'absolute',
                  top: -26,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#0e1726',
                  border: '1.5px solid #22d3ee',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'grab',
                  pointerEvents: 'auto',
                }}
              >
                <RotateCw size={11} color="#22d3ee" />
              </div>
              {(
                [
                  { top: -5, left: -5, cursor: 'nwse-resize' },
                  { top: -5, right: -5, cursor: 'nesw-resize' },
                  { bottom: -5, left: -5, cursor: 'nesw-resize' },
                  { bottom: -5, right: -5, cursor: 'nwse-resize' },
                ] as const
              ).map((pos, idx) => (
                <div
                  key={idx}
                  onPointerDown={handleCornerScalePointerDown}
                  title="Kéo để thay đổi tỉ lệ (Scale)"
                  style={{
                    position: 'absolute',
                    width: 11,
                    height: 11,
                    background: '#22d3ee',
                    border: '1.5px solid #04121a',
                    borderRadius: 3,
                    pointerEvents: 'auto',
                    ...pos,
                  }}
                />
              ))}
            </div>
          )}

          {/* Snap Center Flash Guides */}
          {snapAxes.x && (
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1.5, background: '#22d3ee', pointerEvents: 'none' }} />
          )}
          {snapAxes.y && (
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1.5, background: '#22d3ee', pointerEvents: 'none' }} />
          )}

          {/* Before / After Vertical Wipe Compare Handle */}
          {compareMode && (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                stageRef.current?.setPointerCapture(e.pointerId);
                dragRef.current = { kind: 'compare' };
              }}
              style={{
                position: 'absolute',
                left: `${compareSplitX * 100}%`,
                top: 0,
                bottom: 0,
                width: 3,
                marginLeft: -1.5,
                background: 'linear-gradient(180deg, #22d3ee, #ffffff, #a78bfa)',
                boxShadow: '0 0 12px rgba(34,211,238,0.85)',
                cursor: 'ew-resize',
                zIndex: 8,
              }}
            >
              <div
                className="liquid-glass-pill mono"
                style={{
                  position: 'absolute',
                  top: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '3px 8px',
                  fontSize: 9.5,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  color: '#fff',
                  background: 'rgba(2,6,23,0.82)',
                }}
              >
                Gốc ◀ | ▶ Đã chỉnh
              </div>
            </div>
          )}

          {/* Double-Click Inline Text Quick-Edit Modal */}
          {inlineTextEdit && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: 14,
                left: '8%',
                right: '8%',
                padding: 10,
                borderRadius: 12,
                background: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(34,211,238,0.6)',
                display: 'flex',
                gap: 8,
                zIndex: 12,
              }}
            >
              <input
                autoFocus
                className="glass-input"
                value={inlineTextEdit.value}
                onChange={(e) => {
                  const val = e.target.value;
                  setInlineTextEdit({ ...inlineTextEdit, value: val });
                  previewSelectedClip((c) => {
                    if (c.text) {
                      c.text.text = val;
                      c.name = val.slice(0, 24);
                    }
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    setInlineTextEdit(null);
                    void commitCurrentProject('Sửa nhanh Text trên Canvas');
                  }
                }}
              />
              <button
                className="glass-btn glass-btn-primary"
                onClick={() => {
                  setInlineTextEdit(null);
                  void commitCurrentProject('Sửa nhanh Text trên Canvas');
                }}
              >
                OK
              </button>
            </div>
          )}

          {/* TikTok / Reels / Broadcast Safe Zone Guides */}
          {showSafeZones && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', inset: '10% 8% 22% 8%', border: '1px dashed rgba(251, 191, 36, 0.65)', borderRadius: 8 }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(34,211,238,0.28)' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.28)' }} />
            </div>
          )}

          {/* Empty State */}
          {project && Object.keys(project.clips).length === 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
            >
              <Sparkles size={26} color="#22d3ee" />
              <div>Nhập video/ảnh ở cột Media hoặc bấm <strong>Video Mẫu</strong></div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Refractive Liquid Glass Transport Capsule + Stereo VU Meter */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10, zIndex: 2 }}>
        <div className="liquid-glass-pill" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px' }}>
          <span ref={timecodeRef} className="mono" style={{ fontSize: 12, color: '#22d3ee', minWidth: 88 }}>
            {formatTimecode(playheadUs)}
          </span>
          <span ref={shuttleBadgeRef} className="mono" style={{ fontSize: 10.5, color: '#fbbf24', minWidth: 18 }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            / {formatTimecode(totalDurationUs)}
          </span>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.14)' }} />

          <button className="glass-btn" onClick={() => setPlayheadUs(0)} title="Về đầu (Home)">
            <SkipBack size={13} />
          </button>
          <button
            className="glass-btn glass-btn-primary"
            style={{ width: 34, height: 30, borderRadius: 999, padding: 0 }}
            onClick={() => setIsPlaying(!isPlaying)}
            title="Phát / Tạm dừng (Space hoặc J/K/L)"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button className="glass-btn" onClick={() => setPlayheadUs(totalDurationUs)} title="Đến cuối (End)">
            <SkipForward size={13} />
          </button>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.14)' }} />

          {/* Stereo L/R dBFS Meter */}
          <div title="Master Audio Stereo VU Meter (L/R)" style={{ width: 52, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                ref={vuLeftRef}
                style={{ width: '0%', height: '100%', background: 'linear-gradient(90deg, #34d399, #fbbf24 80%, #fb7185)', transition: 'width 40ms linear' }}
              />
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                ref={vuRightRef}
                style={{ width: '0%', height: '100%', background: 'linear-gradient(90deg, #34d399, #fbbf24 80%, #fb7185)', transition: 'width 40ms linear' }}
              />
            </div>
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.14)' }} />

          <button className="glass-btn" onClick={() => void splitClipAtPlayhead()} title="Cắt đôi tại Playhead (Cmd+B)">
            <Scissors size={13} /> Split
          </button>
          <button
            className="glass-btn"
            onClick={() => void deleteSelectedClip()}
            disabled={!selectedClipId}
            title="Xóa clip (Delete)"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
