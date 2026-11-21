import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  Film,
  Maximize2,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  US_PER_SEC,
  getClipPropertyAtTime,
  mapLocalTimelineToSourceUs,
  type Clip,
} from '@t-capcut/schema';
import { mediaStreamUrl } from '../engine/api';
import { WebGLCompositor } from '../engine/WebGLCompositor';
import { useEditorStore } from '../store/useEditorStore';

function formatTimecode(us: number): string {
  const totalMs = Math.max(0, Math.floor(us / 1000));
  const ms = Math.floor((totalMs % 1000) / 10);
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60_000) % 60;
  const h = Math.floor(totalMs / 3_600_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export const PlayerViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositorRef = useRef<WebGLCompositor | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const maskElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const dragRef = useRef<{ clipId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const project = useEditorStore((s) => s.project);
  const playheadUs = useEditorStore((s) => s.playheadUs);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const showSafeZones = useEditorStore((s) => s.showSafeZones);
  const loadedLuts = useEditorStore((s) => s.loadedLuts);
  const ambientGlowColor = useEditorStore((s) => s.ambientGlowColor);

  const setPlayheadUs = useEditorStore((s) => s.setPlayheadUs);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setSelectedClipId = useEditorStore((s) => s.setSelectedClipId);
  const setShowSafeZones = useEditorStore((s) => s.setShowSafeZones);
  const setAmbientGlowColor = useEditorStore((s) => s.setAmbientGlowColor);
  const splitClipAtPlayhead = useEditorStore((s) => s.splitClipAtPlayhead);
  const deleteSelectedClip = useEditorStore((s) => s.deleteSelectedClip);
  const updateSelectedClip = useEditorStore((s) => s.updateSelectedClip);
  const toggleColoristMode = useEditorStore((s) => s.toggleColoristMode);

  const [renderMs, setRenderMs] = useState(0);

  // Initialize WebGL2 Compositor
  useEffect(() => {
    if (!canvasRef.current) return;
    compositorRef.current = new WebGLCompositor(canvasRef.current);
    return () => {
      compositorRef.current = null;
    };
  }, []);

  // Upload newly registered 3D LUTs
  useEffect(() => {
    const comp = compositorRef.current;
    if (!comp) return;
    Object.values(loadedLuts).forEach((lut) => comp.uploadLut(lut));
  }, [loadedLuts]);

  // Synchronize HTML media elements with Project assets
  useEffect(() => {
    if (!project) return;
    const map = mediaElementsRef.current;
    const maskMap = maskElementsRef.current;

    for (const asset of Object.values(project.assets)) {
      const targetPath =
        project.settings.proxyEnabled && asset.proxyPath ? asset.proxyPath : asset.sourcePath;
      const streamSrc = mediaStreamUrl(targetPath);

      if (asset.kind === 'image') {
        let img = map.get(asset.id) as HTMLImageElement | undefined;
        if (!img || !(img instanceof HTMLImageElement)) {
          img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = streamSrc;
          map.set(asset.id, img);
        }
      } else {
        let vid = map.get(asset.id) as HTMLVideoElement | undefined;
        if (!vid || !(vid instanceof HTMLVideoElement)) {
          vid = document.createElement('video');
          vid.crossOrigin = 'anonymous';
          vid.preload = 'auto';
          vid.playsInline = true;
          vid.src = streamSrc;
          map.set(asset.id, vid);
        } else if (!vid.src.endsWith(encodeURIComponent(targetPath))) {
          vid.src = streamSrc;
        }
      }

      if (asset.mattingMaskPath) {
        let mVid = maskMap.get(asset.id);
        const mSrc = mediaStreamUrl(asset.mattingMaskPath);
        if (!mVid) {
          mVid = document.createElement('video');
          mVid.crossOrigin = 'anonymous';
          mVid.preload = 'auto';
          mVid.muted = true;
          mVid.playsInline = true;
          mVid.src = mSrc;
          maskMap.set(asset.id, mVid);
        }
      }
    }
  }, [project]);

  // Playback Clock & Frame Render Loop
  useEffect(() => {
    if (!project) return;
    let rafId = 0;
    let lastTs = performance.now();
    let glowTick = 0;

    const totalDurationUs = Math.max(
      5 * US_PER_SEC,
      Object.values(project.clips).reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0)
    );

    const tick = (now: number) => {
      const dtMs = now - lastTs;
      lastTs = now;
      let curUs = useEditorStore.getState().playheadUs;

      if (useEditorStore.getState().isPlaying) {
        curUs += Math.round(dtMs * 1000);
        if (curUs >= totalDurationUs) {
          curUs = 0;
          setIsPlaying(false);
        }
        setPlayheadUs(curUs);
      }

      // Sync active video/audio media elements
      const activeClips = Object.values(project.clips).filter(
        (c) => !c.disabled && c.assetId && curUs >= c.timelineStartUs && curUs < c.timelineStartUs + c.durationUs
      );
      const activeAssetIds = new Set(activeClips.map((c) => c.assetId!));

      mediaElementsRef.current.forEach((el, assetId) => {
        if (!(el instanceof HTMLVideoElement)) return;
        const clip = activeClips.find((c) => c.assetId === assetId);
        if (!clip) {
          if (!el.paused) el.pause();
          return;
        }
        const track = project.tracks.find((t) => t.id === clip.trackId);
        const localUs = curUs - clip.timelineStartUs;
        const targetSec = mapLocalTimelineToSourceUs(clip, localUs) / US_PER_SEC;
        el.playbackRate = Math.min(4, Math.max(0.25, clip.speed.rate || 1));
        el.muted = Boolean(clip.audio.muted || track?.muted);
        el.volume = Math.min(1, Math.max(0, clip.audio.volume * (track?.volume ?? 1)));

        if (useEditorStore.getState().isPlaying && !clip.speed.reverse) {
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

        const maskVid = maskElementsRef.current.get(assetId);
        if (maskVid && clip.aiMattingEnabled && Math.abs(maskVid.currentTime - targetSec) > 0.05) {
          maskVid.currentTime = targetSec;
        }
      });

      // Pause inactive masks
      maskElementsRef.current.forEach((mVid, aid) => {
        if (!activeAssetIds.has(aid) && !mVid.paused) mVid.pause();
      });

      const comp = compositorRef.current;
      if (comp) {
        const tStart = performance.now();
        const glow = comp.renderFrame(project, curUs, mediaElementsRef.current, maskElementsRef.current);
        setRenderMs(Math.round((performance.now() - tStart) * 10) / 10);
        glowTick++;
        if (glow && glowTick % 8 === 0) {
          setAmbientGlowColor(glow);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [project, setIsPlaying, setPlayheadUs, setAmbientGlowColor]);

  const activeTextClips: Clip[] = project
    ? Object.values(project.clips).filter(
        (c) =>
          !c.disabled &&
          c.kind === 'text' &&
          c.text &&
          playheadUs >= c.timelineStartUs &&
          playheadUs < c.timelineStartUs + c.durationUs
      )
    : [];

  const totalDurationUs = project
    ? Math.max(
        5 * US_PER_SEC,
        Object.values(project.clips).reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0)
      )
    : 5 * US_PER_SEC;

  const selectedClip = project && selectedClipId ? project.clips[selectedClipId] : null;
  const aspectRatioCss = project ? `${project.settings.width} / ${project.settings.height}` : '16 / 9';

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!project) return;
    const hit =
      selectedClip &&
      playheadUs >= selectedClip.timelineStartUs &&
      playheadUs < selectedClip.timelineStartUs + selectedClip.durationUs
        ? selectedClip
        : Object.values(project.clips).find(
            (c) =>
              !c.disabled &&
              (c.kind === 'video' || c.kind === 'image' || c.kind === 'text') &&
              playheadUs >= c.timelineStartUs &&
              playheadUs < c.timelineStartUs + c.durationUs
          );
    if (!hit) return;
    setSelectedClipId(hit.id);
    dragRef.current = {
      clipId: hit.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: hit.transform.x,
      origY: hit.transform.y,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / Math.max(1, rect.width)) * 2;
    const dy = ((e.clientY - drag.startY) / Math.max(1, rect.height)) * 2;
    const nextX = Math.abs(drag.origX + dx) < 0.03 ? 0 : Number((drag.origX + dx).toFixed(3));
    const nextY = Math.abs(drag.origY + dy) < 0.03 ? 0 : Number((drag.origY + dy).toFixed(3));
    const clip = project.clips[drag.clipId];
    if (clip) {
      clip.transform.x = nextX;
      clip.transform.y = nextY;
    }
  };

  const handleCanvasPointerUp = () => {
    const drag = dragRef.current;
    if (!drag || !project) return;
    dragRef.current = null;
    const clip = project.clips[drag.clipId];
    if (clip) {
      const fx = clip.transform.x;
      const fy = clip.transform.y;
      void updateSelectedClip('Di chuyển vị trí trên Viewport', (c) => {
        c.transform.x = fx;
        c.transform.y = fy;
      });
    }
  };

  return (
    <div className="liquid-glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <Film size={14} color="#22d3ee" />
          <span>Player Preview</span>
          {project && (
            <span className="mono" style={{ padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 11 }}>
              {project.settings.width}×{project.settings.height} · {project.settings.fps}fps
            </span>
          )}
          <span className="mono" style={{ fontSize: 11, color: '#34d399' }}>
            GPU {renderMs}ms
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className={`glass-btn ${showSafeZones ? 'glass-btn-active' : ''}`}
            onClick={() => setShowSafeZones(!showSafeZones)}
            title="Khung an toàn TikTok / Reels / YouTube"
          >
            <Maximize2 size={13} /> Safe Zones
          </button>
          <button
            className={`glass-btn ${project?.settings.coloristMode ? 'glass-btn-active' : ''}`}
            onClick={() => void toggleColoristMode()}
            title="Colorist Mode: Nền xám Rec.709 trung tính khi chỉnh màu"
          >
            <Eye size={13} /> {project?.settings.coloristMode ? 'Colorist On' : 'Colorist'}
          </button>
        </div>
      </div>

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
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          style={{
            position: 'relative',
            aspectRatio: aspectRatioCss,
            maxWidth: '100%',
            maxHeight: '100%',
            height: '100%',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
            background: '#05070b',
            cursor: 'grab',
          }}
        >
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

          {/* Text & Word-by-Word Karaoke Overlay Layer */}
          {activeTextClips.map((tc) => {
            const t = tc.text!;
            const localUs = playheadUs - tc.timelineStartUs;
            const xPct = 50 + getClipPropertyAtTime(tc, 'x', localUs) * 50;
            const yPct = 50 + getClipPropertyAtTime(tc, 'y', localUs) * 50;
            const scale = getClipPropertyAtTime(tc, 'scaleX', localUs);
            const opacity = getClipPropertyAtTime(tc, 'opacity', localUs);
            const words = t.words && t.words.length > 0 ? t.words : null;

            return (
              <div
                key={tc.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedClipId(tc.id);
                }}
                style={{
                  position: 'absolute',
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  opacity,
                  maxWidth: '88%',
                  textAlign: t.align,
                  fontFamily: t.fontFamily,
                  fontSize: `${Math.max(14, t.fontSize * 0.42)}px`,
                  fontWeight: t.fontWeight,
                  fontStyle: t.italic ? 'italic' : 'normal',
                  letterSpacing: `${t.letterSpacing}px`,
                  lineHeight: t.lineHeight,
                  padding: `${t.backgroundPadding * 0.45}px ${t.backgroundPadding * 0.75}px`,
                  borderRadius: `${t.backgroundRadius}px`,
                  background: t.backgroundColor,
                  textShadow: `0 ${t.shadowOffsetY}px ${t.shadowBlur}px ${t.shadowColor}`,
                  WebkitTextStroke: t.strokeWidth > 0 ? `${Math.max(0.5, t.strokeWidth * 0.35)}px ${t.strokeColor}` : undefined,
                  border: selectedClipId === tc.id ? '1.5px dashed #22d3ee' : 'none',
                  pointerEvents: 'auto',
                }}
              >
                {t.karaokeEnabled && words
                  ? words.map((w, wi) => {
                      const active = playheadUs >= w.startUs && playheadUs <= w.endUs;
                      return (
                        <span
                          key={wi}
                          style={{
                            color: active ? t.karaokeActiveColor : t.color,
                            display: 'inline-block',
                            marginRight: '0.28em',
                            transform: active ? 'scale(1.12)' : 'scale(1)',
                            transition: 'transform 90ms ease, color 90ms ease',
                          }}
                        >
                          {w.text}
                        </span>
                      );
                    })
                  : <span style={{ color: t.color }}>{t.text}</span>}
              </div>
            );
          })}

          {/* On-Canvas Gizmo Selection Box */}
          {selectedClip &&
            (selectedClip.kind === 'video' || selectedClip.kind === 'image') &&
            playheadUs >= selectedClip.timelineStartUs &&
            playheadUs < selectedClip.timelineStartUs + selectedClip.durationUs && (
              <div
                style={{
                  position: 'absolute',
                  inset: '8%',
                  border: '1.5px solid rgba(34, 211, 238, 0.75)',
                  borderRadius: 6,
                  pointerEvents: 'none',
                  transform: `translate(${selectedClip.transform.x * 50}%, ${selectedClip.transform.y * 50}%) scale(${selectedClip.transform.scaleX}, ${selectedClip.transform.scaleY}) rotate(${selectedClip.transform.rotation}deg)`,
                }}
              >
                <div style={{ position: 'absolute', top: -4, left: -4, width: 8, height: 8, background: '#22d3ee', borderRadius: 2 }} />
                <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: '#22d3ee', borderRadius: 2 }} />
                <div style={{ position: 'absolute', bottom: -4, left: -4, width: 8, height: 8, background: '#22d3ee', borderRadius: 2 }} />
                <div style={{ position: 'absolute', bottom: -4, right: -4, width: 8, height: 8, background: '#22d3ee', borderRadius: 2 }} />
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

          {/* Empty State Onboarding inside Preview */}
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
              <div>Nhập video/ảnh ở cột Media hoặc bấm <strong>Tạo Video Mẫu 1-Click</strong></div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Refractive Liquid Glass Transport Capsule */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10, zIndex: 2 }}>
        <div className="liquid-glass-pill" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px' }}>
          <span className="mono" style={{ fontSize: 12, color: '#22d3ee', minWidth: 88 }}>
            {formatTimecode(playheadUs)}
          </span>
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
            title="Phát / Tạm dừng (Space)"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button className="glass-btn" onClick={() => setPlayheadUs(totalDurationUs)} title="Đến cuối (End)">
            <SkipForward size={13} />
          </button>

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
