import type { AnimatableProperty, Clip, KeyframePoint, Microseconds } from './types.js';

export const EASING_PRESETS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  easeOutExpo: [0.16, 1, 0.3, 1],
  capcutSmooth: [0.25, 0.1, 0.25, 1],
  springSnappy: [0.22, 1.25, 0.36, 1],
};

function sampleBezier(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function sampleBezierDerivative(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Evaluate cubic bezier y(x) for normalized x in [0, 1] using Newton-Raphson + bisection fallback.
 */
export function evaluateCubicBezier(x: number, control: [number, number, number, number]): number {
  const [x1, y1, x2, y2] = control;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x1 === y1 && x2 === y2) return x;

  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sampleBezier(t, x1, x2) - x;
    if (Math.abs(err) < 1e-6) {
      return sampleBezier(t, y1, y2);
    }
    const deriv = sampleBezierDerivative(t, x1, x2);
    if (Math.abs(deriv) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - err / deriv));
  }

  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 14; i++) {
    const cur = sampleBezier(t, x1, x2);
    if (Math.abs(cur - x) < 1e-6) break;
    if (cur < x) lo = t;
    else hi = t;
    t = 0.5 * (lo + hi);
  }
  return sampleBezier(t, y1, y2);
}

export function interpolateKeyframes(
  points: KeyframePoint[] | undefined,
  localTimeUs: Microseconds,
  fallbackValue: number
): number {
  if (!points || points.length === 0) return fallbackValue;
  const sorted = points.length > 1 ? [...points].sort((a, b) => a.timeUs - b.timeUs) : points;
  if (localTimeUs <= sorted[0].timeUs) return sorted[0].value;
  if (localTimeUs >= sorted[sorted.length - 1].timeUs) return sorted[sorted.length - 1].value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (localTimeUs >= a.timeUs && localTimeUs <= b.timeUs) {
      const span = b.timeUs - a.timeUs;
      if (span <= 0) return b.value;
      const progress = (localTimeUs - a.timeUs) / span;
      const eased = evaluateCubicBezier(progress, a.easing ?? [0.42, 0, 0.58, 1]);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return fallbackValue;
}

export function getClipPropertyAtTime(
  clip: Clip,
  prop: AnimatableProperty,
  localTimeUs: Microseconds
): number {
  const baseMap: Record<AnimatableProperty, number> = {
    x: clip.transform.x,
    y: clip.transform.y,
    scaleX: clip.transform.scaleX,
    scaleY: clip.transform.scaleY,
    rotation: clip.transform.rotation,
    opacity: clip.transform.opacity,
    volume: clip.audio.volume,
    blur: 0,
    brightness: clip.colorGrade.brightness,
    contrast: clip.colorGrade.contrast,
    saturation: clip.colorGrade.saturation,
    maskScale: 1,
  };
  return interpolateKeyframes(clip.keyframes[prop], localTimeUs, baseMap[prop]);
}

/**
 * Evaluate speed-ramp multiplier and integrated source time for a clip at local timeline offset.
 */
export function mapLocalTimelineToSourceUs(clip: Clip, localTimeUs: Microseconds): Microseconds {
  const clamped = Math.max(0, Math.min(clip.durationUs, localTimeUs));
  if (clip.speed.mode === 'uniform') {
    const rate = Math.max(0.05, clip.speed.rate);
    const delta = clamped * rate;
    if (clip.speed.reverse) {
      return Math.max(0, clip.sourceStartUs + clip.sourceDurationUs - delta);
    }
    return clip.sourceStartUs + delta;
  }

  // Numerical integration over curve points (trapezoidal rule, 32 steps)
  const steps = 32;
  const pts = [...clip.speed.curvePoints].sort((a, b) => a.position - b.position);
  const sampleSpeed = (u: number): number => {
    if (pts.length === 0) return 1;
    if (u <= pts[0].position) return pts[0].speed;
    if (u >= pts[pts.length - 1].position) return pts[pts.length - 1].speed;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (u >= a.position && u <= b.position) {
        const t = (u - a.position) / Math.max(1e-6, b.position - a.position);
        return a.speed + (b.speed - a.speed) * t;
      }
    }
    return 1;
  };

  const targetFrac = clip.durationUs > 0 ? clamped / clip.durationUs : 0;
  const dt = targetFrac / steps;
  let integral = 0;
  for (let i = 0; i < steps; i++) {
    const s0 = sampleSpeed(i * dt);
    const s1 = sampleSpeed((i + 1) * dt);
    integral += 0.5 * (s0 + s1) * dt;
  }
  const sourceDelta = integral * clip.durationUs;
  if (clip.speed.reverse) {
    return Math.max(0, clip.sourceStartUs + clip.sourceDurationUs - sourceDelta);
  }
  return clip.sourceStartUs + sourceDelta;
}

/**
 * Compute timeline clip duration in microseconds from sourceDurationUs and SpeedState (uniform or speed curve).
 */
export function computeDurationFromSpeed(sourceDurationUs: Microseconds, speed: Clip['speed']): Microseconds {
  if (speed.mode === 'uniform') {
    const rate = Math.max(0.1, speed.rate || 1);
    return Math.max(200_000, Math.round(sourceDurationUs / rate));
  }
  const pts = [...(speed.curvePoints ?? [])].sort((a, b) => a.position - b.position);
  if (pts.length === 0) return sourceDurationUs;
  const sampleSpeed = (u: number): number => {
    if (u <= pts[0].position) return Math.max(0.1, pts[0].speed);
    if (u >= pts[pts.length - 1].position) return Math.max(0.1, pts[pts.length - 1].speed);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (u >= a.position && u <= b.position) {
        const t = (u - a.position) / Math.max(1e-6, b.position - a.position);
        return Math.max(0.1, a.speed + (b.speed - a.speed) * t);
      }
    }
    return 1;
  };
  const steps = 32;
  const dt = 1 / steps;
  let avgSpeedIntegral = 0;
  for (let i = 0; i < steps; i++) {
    avgSpeedIntegral += 0.5 * (sampleSpeed(i * dt) + sampleSpeed((i + 1) * dt)) * dt;
  }
  return Math.max(200_000, Math.round(sourceDurationUs / Math.max(0.1, avgSpeedIntegral)));
}
