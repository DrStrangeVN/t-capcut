import lottie from 'lottie-web/build/player/lottie_canvas.min.js';

interface CachedLottie {
  canvas: HTMLCanvasElement;
  anim: { goToAndStop: (frame: number, isFrame: boolean) => void; destroy: () => void; totalFrames: number };
  fps: number;
  totalFrames: number;
  w: number;
  h: number;
  lastFrameRendered: number;
}

const lottieCache = new Map<string, CachedLottie>();

function hashKey(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < Math.min(str.length, 4096); i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${str.length}_${h >>> 0}`;
}

export function renderLottieFrameToCanvas(
  lottieJson: string,
  tSec: number,
  overrideDurSec?: number
): HTMLCanvasElement | null {
  const key = hashKey(lottieJson);
  let entry = lottieCache.get(key);
  if (!entry) {
    try {
      const data = JSON.parse(lottieJson) as { w?: number; h?: number; fr?: number; ip?: number; op?: number };
      const w = Math.max(64, Math.min(1024, data.w || 400));
      const h = Math.max(64, Math.min(1024, data.h || 400));
      const fps = Math.max(10, data.fr || 30);
      const totalFrames = Math.max(2, (data.op ?? 60) - (data.ip ?? 0));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const anim = (lottie as unknown as {
        loadAnimation: (cfg: Record<string, unknown>) => CachedLottie['anim'];
      }).loadAnimation({
        renderer: 'canvas',
        loop: true,
        autoplay: false,
        animationData: data,
        rendererSettings: {
          context: ctx,
          clearCanvas: true,
          progressiveLoad: false,
        },
      });
      entry = { canvas, anim, fps, totalFrames, w, h, lastFrameRendered: -1 };
      lottieCache.set(key, entry);
      if (lottieCache.size > 24) {
        const firstKey = lottieCache.keys().next().value;
        if (firstKey) {
          lottieCache.get(firstKey)?.anim.destroy();
          lottieCache.delete(firstKey);
        }
      }
    } catch {
      return null;
    }
  }

  const cycleSec = overrideDurSec && overrideDurSec > 0 ? overrideDurSec : entry.totalFrames / entry.fps;
  const phase = ((tSec % Math.max(0.2, cycleSec)) + cycleSec) % cycleSec;
  const targetFrame = Math.floor((phase / cycleSec) * entry.totalFrames) % Math.max(1, Math.floor(entry.totalFrames));
  if (targetFrame !== entry.lastFrameRendered) {
    entry.lastFrameRendered = targetFrame;
    try {
      entry.anim.goToAndStop(targetFrame, true);
    } catch {
      // keep previous frame cleanly
    }
  }
  return entry.canvas;
}
