import React, { useEffect, useRef, useState } from 'react';
import { Activity, X } from 'lucide-react';
import { playbackClock } from '../engine/PlaybackClock';
import { useEditorStore } from '../store/useEditorStore';

interface VideoScopesPanelProps {
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/**
 * Live Hardware Video Scopes (RGB Parade + Luma Waveform) sampled at 8Hz from Player canvas.
 */
export const VideoScopesPanel: React.FC<VideoScopesPanelProps> = ({ sourceCanvasRef }) => {
  const showScopes = useEditorStore((s) => s.showScopes);
  const setShowScopes = useEditorStore((s) => s.setShowScopes);
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'parade' | 'luma'>('parade');

  useEffect(() => {
    if (!showScopes) return;
    if (!sampleCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 90;
      sampleCanvasRef.current = c;
    }

    const drawScopes = () => {
      const src = sourceCanvasRef.current;
      const dst = scopeCanvasRef.current;
      const tmp = sampleCanvasRef.current;
      if (!src || !dst || !tmp || src.width === 0 || src.height === 0) return;

      const tCtx = tmp.getContext('2d', { willReadFrequently: true });
      const dCtx = dst.getContext('2d');
      if (!tCtx || !dCtx) return;

      tCtx.drawImage(src, 0, 0, 160, 90);
      const px = tCtx.getImageData(0, 0, 160, 90).data;

      const w = dst.width;
      const h = dst.height;
      dCtx.fillStyle = '#07090e';
      dCtx.fillRect(0, 0, w, h);

      // IRE Grid lines (0%, 25%, 50%, 75%, 100%)
      dCtx.strokeStyle = 'rgba(255,255,255,0.08)';
      dCtx.lineWidth = 1;
      for (const pct of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const y = Math.round(pct * h);
        dCtx.beginPath();
        dCtx.moveTo(0, y);
        dCtx.lineTo(w, y);
        dCtx.stroke();
      }

      if (mode === 'parade') {
        const colW = w / 3;
        for (let sx = 0; sx < 160; sx += 2) {
          const rx = (sx / 160) * colW;
          const gx = colW + (sx / 160) * colW;
          const bx = colW * 2 + (sx / 160) * colW;
          for (let sy = 0; sy < 90; sy += 2) {
            const idx = (sy * 160 + sx) * 4;
            const r = px[idx];
            const g = px[idx + 1];
            const b = px[idx + 2];
            dCtx.fillStyle = 'rgba(239,68,68,0.34)';
            dCtx.fillRect(rx, h - (r / 255) * h, 2, 2);
            dCtx.fillStyle = 'rgba(34,197,94,0.34)';
            dCtx.fillRect(gx, h - (g / 255) * h, 2, 2);
            dCtx.fillStyle = 'rgba(59,130,246,0.34)';
            dCtx.fillRect(bx, h - (b / 255) * h, 2, 2);
          }
        }
      } else {
        dCtx.fillStyle = 'rgba(34,211,238,0.32)';
        for (let sx = 0; sx < 160; sx += 2) {
          const dx = (sx / 160) * w;
          for (let sy = 0; sy < 90; sy += 2) {
            const idx = (sy * 160 + sx) * 4;
            const luma = 0.2126 * px[idx] + 0.7152 * px[idx + 1] + 0.0722 * px[idx + 2];
            dCtx.fillRect(dx, h - (luma / 255) * h, 2, 2);
          }
        }
      }
    };

    drawScopes();
    const id = setInterval(drawScopes, 125);
    const unsub = playbackClock.subscribe(() => {
      if (!playbackClock.isPlaying()) drawScopes();
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [showScopes, mode, sourceCanvasRef]);

  if (!showScopes) return null;

  return (
    <div
      className="liquid-glass-chrome"
      style={{
        position: 'absolute',
        top: 46,
        right: 12,
        width: 268,
        padding: 10,
        zIndex: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
          <Activity size={13} color="#22d3ee" /> Video Scopes
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`glass-btn ${mode === 'parade' ? 'glass-btn-active' : ''}`}
            style={{ padding: '2px 7px', fontSize: 10 }}
            onClick={() => setMode('parade')}
          >
            RGB Parade
          </button>
          <button
            className={`glass-btn ${mode === 'luma' ? 'glass-btn-active' : ''}`}
            style={{ padding: '2px 7px', fontSize: 10 }}
            onClick={() => setMode('luma')}
          >
            Luma
          </button>
          <button className="glass-btn" style={{ padding: '2px 5px' }} onClick={() => setShowScopes(false)}>
            <X size={11} />
          </button>
        </div>
      </div>
      <canvas
        ref={scopeCanvasRef}
        width={246}
        height={110}
        style={{ width: '100%', height: 110, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
      />
    </div>
  );
};
