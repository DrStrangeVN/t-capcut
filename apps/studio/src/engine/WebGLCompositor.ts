import {
  getClipPropertyAtTime,
  resolveEffectiveClips,
  type BlendMode,
  type Clip,
  type ColorGradeState,
  type Microseconds,
  type Project,
  type ShaderEffectInstance,
} from '@t-capcut/schema';
import { TRANSITION_BY_ID, VFX_BY_ID } from '@t-capcut/presets';

export interface LoadedLutTexture {
  id: string;
  title: string;
  size: number;
  data: Float32Array;
}

function easeOutCubic(t: number): number {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}

function evaluateClipAnimation(
  clip: Clip,
  localUs: number,
  durationUs: number
): { dx: number; dy: number; dScale: number; dRot: number; dOpacity: number } {
  let dx = 0;
  let dy = 0;
  let dScale = 1;
  let dRot = 0;
  let dOpacity = 1;
  const anim = clip.animation;
  if (!anim) return { dx, dy, dScale, dRot, dOpacity };

  const inDur = Math.max(80_000, anim.inDurationUs ?? 500_000);
  if (anim.in && anim.in !== 'none' && localUs < inDur) {
    const t = Math.max(0, Math.min(1, localUs / inDur));
    const e = easeOutCubic(t);
    const inv = 1 - e;
    if (anim.in === 'fade_in') dOpacity *= e;
    else if (anim.in === 'zoom_in') {
      dScale *= 0.65 + 0.35 * e;
      dOpacity *= Math.min(1, t * 2.2);
    } else if (anim.in === 'slide_left') dx -= inv * 1.4;
    else if (anim.in === 'slide_right') dx += inv * 1.4;
    else if (anim.in === 'slide_up') dy += inv * 1.2;
    else if (anim.in === 'slide_down') dy -= inv * 1.2;
    else if (anim.in === 'shake_in') {
      dx += Math.sin(t * Math.PI * 10) * inv * 0.12;
      dy += Math.cos(t * Math.PI * 8) * inv * 0.08;
      dScale *= 1 + inv * 0.18;
    } else if (anim.in === 'bounce_in') {
      const overshoot = 1 + Math.sin(t * Math.PI * 2.5) * inv * 0.28;
      dScale *= t < 0.15 ? t / 0.15 : overshoot;
    } else if (anim.in === 'spin_in') {
      dRot -= inv * 90;
      dScale *= 0.55 + 0.45 * e;
      dOpacity *= Math.min(1, t * 2);
    }
  }

  const outDur = Math.max(80_000, anim.outDurationUs ?? 500_000);
  const remUs = durationUs - localUs;
  if (anim.out && anim.out !== 'none' && remUs >= 0 && remUs < outDur) {
    const t = Math.max(0, Math.min(1, 1 - remUs / outDur)); // 0 -> 1 at end
    const e = t * t * (3 - 2 * t);
    if (anim.out === 'fade_out') dOpacity *= 1 - e;
    else if (anim.out === 'zoom_out') {
      dScale *= 1 + e * 0.45;
      dOpacity *= 1 - e;
    } else if (anim.out === 'slide_left') dx -= e * 1.4;
    else if (anim.out === 'slide_right') dx += e * 1.4;
    else if (anim.out === 'slide_down') dy -= e * 1.2;
    else if (anim.out === 'spin_out') {
      dRot += e * 90;
      dScale *= Math.max(0.3, 1 - e * 0.5);
      dOpacity *= 1 - e;
    }
  }

  if (anim.combo && anim.combo !== 'none') {
    const sec = localUs / 1_000_000;
    if (anim.combo === 'pendulum') {
      dRot += Math.sin(sec * Math.PI * 2.2) * 6;
    } else if (anim.combo === 'wobble') {
      dx += Math.sin(sec * 8.0) * 0.035;
      dRot += Math.cos(sec * 6.0) * 3.5;
    } else if (anim.combo === 'beat_pulse') {
      const pulse = Math.pow(Math.max(0, Math.sin(sec * Math.PI * 2.0)), 6);
      dScale *= 1 + pulse * 0.12;
    } else if (anim.combo === 'zoom_bounce') {
      dScale *= 1.06 + Math.abs(Math.sin(sec * Math.PI * 2.4)) * 0.08;
    } else if (anim.combo === 'distort_swing') {
      dRot += Math.sin(sec * Math.PI * 3.0) * 8;
      dScale *= 1.04 + Math.cos(sec * Math.PI * 3.0) * 0.05;
    }
  }

  return { dx, dy, dScale, dRot, dOpacity };
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;

uniform vec2 uResolution;
uniform vec2 uSrcResolution;
uniform vec2 uTranslate;
uniform vec2 uScale;
uniform float uRotationRad;
uniform vec2 uFlip;
uniform int uFillMode;

out vec2 vUv;
out vec2 vScreenUv;

void main() {
  float aspectSrc = uSrcResolution.x / max(1.0, uSrcResolution.y);
  float aspectOut = uResolution.x / max(1.0, uResolution.y);
  vec2 fit = uFillMode == 1
    ? (aspectSrc > aspectOut ? vec2(aspectSrc / aspectOut, 1.0) : vec2(1.0, aspectOut / aspectSrc))
    : (aspectSrc > aspectOut ? vec2(1.0, aspectOut / aspectSrc) : vec2(aspectSrc / aspectOut, 1.0));

  vec2 local = aPos * fit * uScale * uFlip;
  float c = cos(uRotationRad);
  float s = sin(uRotationRad);
  vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 pos = rotated + vec2(uTranslate.x, -uTranslate.y);
  gl_Position = vec4(pos, 0.0, 1.0);
  vUv = aUv;
  vScreenUv = pos * 0.5 + 0.5;
}`;

const BLIT_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  vUv = vec2(aUv.x, 1.0 - aUv.y);
}`;

const MAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
in vec2 vScreenUv;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform sampler2D uMaskTexture;
uniform sampler2D uLutTexture;
uniform sampler2D uBackBuffer;
uniform sampler2D uCurvesTexture;

uniform int uHasMattingMask;
uniform int uHasLut;
uniform float uLutSize;
uniform float uLutIntensity;
uniform int uHasCurves;

uniform float uOpacity;
uniform vec4 uCrop;
uniform int uBlendMode;

uniform float uExposure;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform float uTemperature;
uniform float uTint;
uniform float uVignette;
uniform float uSharpness;
uniform vec2 uSrcTexel;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;

uniform vec3 uHsl[8];
uniform int uHasHsl;

uniform int uChromaEnabled;
uniform vec3 uChromaColor;
uniform float uChromaSimilarity;
uniform float uChromaSmoothness;
uniform float uChromaSpill;

uniform int uMaskShape;
uniform vec2 uMaskCenter;
uniform vec2 uMaskSize;
uniform float uMaskRotation;
uniform float uMaskFeather;
uniform int uMaskInverted;

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return vec3(0.0, 0.0, l);
  float d = mx - mn;
  float s = l > 0.5 ? d / max(0.0001, 2.0 - mx - mn) : d / max(0.0001, mx + mn);
  float h = 0.0;
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return vec3(h / 6.0, s, l);
}

float hue2rgb(float p, float q, float t) {
  float tt = fract(t);
  if (tt < 1.0 / 6.0) return p + (q - p) * 6.0 * tt;
  if (tt < 0.5) return q;
  if (tt < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - tt) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y <= 0.0001) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0 / 3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

vec3 applyLut3D(vec3 col, float size) {
  vec3 c = clamp(col, 0.0, 1.0);
  float N = max(2.0, size);
  float sliceSize = 1.0 / N;
  float slicePixelSize = sliceSize / N;
  float sliceInnerSize = slicePixelSize * (N - 1.0);
  float zSlice0 = min(floor(c.b * (N - 1.0)), N - 1.0);
  float zSlice1 = min(zSlice0 + 1.0, N - 1.0);
  float xOffset = slicePixelSize * 0.5 + c.r * sliceInnerSize;
  float s0 = xOffset + zSlice0 * sliceSize;
  float s1 = xOffset + zSlice1 * sliceSize;
  float y = (0.5 + c.g * (N - 1.0)) / N;
  vec3 col0 = texture(uLutTexture, vec2(s0, y)).rgb;
  vec3 col1 = texture(uLutTexture, vec2(s1, y)).rgb;
  return mix(col0, col1, fract(c.b * (N - 1.0)));
}

float sdCircle(vec2 p, vec2 r) {
  return length(p / max(vec2(0.001), r)) - 1.0;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdHeart(vec2 p) {
  vec2 q = vec2(abs(p.x), -p.y + 0.5);
  if (q.y + q.x > 1.0) {
    vec2 d = q - vec2(0.25, 0.75);
    return sqrt(dot(d, d)) - 0.35355;
  }
  vec2 d1 = q - vec2(0.0, 1.0);
  vec2 d2 = q - 0.5 * max(q.x + q.y, 0.0);
  return sqrt(min(dot(d1, d1), dot(d2, d2))) * sign(q.x - q.y);
}

float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

vec3 blendRgb(vec3 base, vec3 src, int mode) {
  if (mode == 1) return base * src;
  if (mode == 2) return 1.0 - (1.0 - base) * (1.0 - src);
  if (mode == 3) return mix(2.0 * base * src, 1.0 - 2.0 * (1.0 - base) * (1.0 - src), step(0.5, base));
  if (mode == 4) return mix(2.0 * base * src + base * base * (1.0 - 2.0 * src), sqrt(max(base, 0.0)) * (2.0 * src - 1.0) + 2.0 * base * (1.0 - src), step(0.5, src));
  if (mode == 5) return mix(2.0 * base * src, 1.0 - 2.0 * (1.0 - base) * (1.0 - src), step(0.5, src));
  if (mode == 6) return min(vec3(1.0), base / max(vec3(0.001), 1.0 - src));
  if (mode == 7) return min(base, src);
  if (mode == 8) return max(base, src);
  if (mode == 9) return abs(base - src);
  if (mode == 10) return min(vec3(1.0), base + src);
  if (mode == 11) return base + src - 2.0 * base * src;
  return src;
}

void main() {
  if (vUv.x < uCrop.x || vUv.x > 1.0 - uCrop.y || vUv.y < uCrop.z || vUv.y > 1.0 - uCrop.w) {
    discard;
  }

  vec2 uv = vUv;
  vec4 texel = texture(uTexture, uv);
  vec3 col = texel.rgb;
  float alpha = texel.a * uOpacity;

  if (uSharpness > 0.005) {
    vec3 blur = (
      texture(uTexture, uv + vec2(uSrcTexel.x, 0.0)).rgb +
      texture(uTexture, uv - vec2(uSrcTexel.x, 0.0)).rgb +
      texture(uTexture, uv + vec2(0.0, uSrcTexel.y)).rgb +
      texture(uTexture, uv - vec2(0.0, uSrcTexel.y)).rgb
    ) * 0.25;
    col = col + (col - blur) * (uSharpness * 1.6);
  }

  if (uChromaEnabled == 1) {
    float dist = distance(col, uChromaColor);
    float keyAlpha = smoothstep(uChromaSimilarity * 0.55, uChromaSimilarity * 0.55 + max(0.01, uChromaSmoothness * 0.45), dist);
    alpha *= keyAlpha;
    if (uChromaSpill > 0.01) {
      float rbMax = max(col.r, col.b);
      if (col.g > rbMax) col.g = mix(col.g, rbMax, uChromaSpill * 0.85);
    }
  }

  if (uHasMattingMask == 1) {
    float maskVal = texture(uMaskTexture, clamp(uv, 0.0, 1.0)).r;
    alpha *= smoothstep(0.15, 0.85, maskVal);
  }

  if (uMaskShape > 0) {
    vec2 p = uv - 0.5 - uMaskCenter;
    float cs = cos(-uMaskRotation);
    float sn = sin(-uMaskRotation);
    p = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
    float d = 1.0;
    if (uMaskShape == 1) d = p.y;
    else if (uMaskShape == 2) d = abs(p.y) - uMaskSize.y * 0.5;
    else if (uMaskShape == 3) d = sdCircle(p, uMaskSize * 0.5);
    else if (uMaskShape == 4) d = sdBox(p, uMaskSize * 0.5);
    else if (uMaskShape == 5) d = sdHeart(p / max(vec2(0.05), uMaskSize) * 1.25);
    else d = sdStar5(p / max(vec2(0.05), uMaskSize) * 1.4, 0.65, 0.45);
    float m = 1.0 - smoothstep(-max(0.002, uMaskFeather), max(0.002, uMaskFeather), d);
    if (uMaskInverted == 1) m = 1.0 - m;
    alpha *= m;
  }

  col *= pow(2.0, uExposure);
  col += uBrightness;
  col = (col - 0.5) * (1.0 + uContrast) + 0.5;
  col += vec3(uTemperature * 0.12, uTint * 0.08, -uTemperature * 0.12);

  col = col + uLift * (1.0 - col) * 0.5;
  col = pow(max(col, vec3(0.0)), 1.0 / max(vec3(0.2), vec3(1.0) + uGamma));
  col *= (vec3(1.0) + uGain * 0.5);

  if (uHasCurves == 1) {
    col.r = texture(uCurvesTexture, vec2(clamp(col.r, 0.0, 1.0), 0.5)).r;
    col.g = texture(uCurvesTexture, vec2(clamp(col.g, 0.0, 1.0), 0.5)).g;
    col.b = texture(uCurvesTexture, vec2(clamp(col.b, 0.0, 1.0), 0.5)).b;
  }

  if (uHasHsl == 1) {
    vec3 hsl = rgb2hsl(clamp(col, 0.0, 1.0));
    if (hsl.y > 0.04) {
      float centers[8] = float[8](0.0, 0.083, 0.166, 0.333, 0.5, 0.666, 0.79, 0.91);
      for (int i = 0; i < 8; i++) {
        float dh = abs(hsl.x - centers[i]);
        dh = min(dh, 1.0 - dh);
        float weight = max(0.0, 1.0 - dh * 9.5);
        if (weight > 0.001) {
          hsl.x = fract(hsl.x + uHsl[i].x * 0.12 * weight);
          hsl.y = clamp(hsl.y * (1.0 + uHsl[i].y * weight), 0.0, 1.0);
          hsl.z = clamp(hsl.z + uHsl[i].z * 0.35 * weight, 0.0, 1.0);
        }
      }
      col = hsl2rgb(hsl);
    }
  }

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, max(0.0, 1.0 + uSaturation));
  float maxC = max(col.r, max(col.g, col.b));
  float minC = min(col.r, min(col.g, col.b));
  col = mix(vec3(luma), col, 1.0 + uVibrance * (1.0 - (maxC - minC)));

  if (uHasLut == 1) {
    vec3 lutCol = applyLut3D(col, uLutSize);
    col = mix(col, lutCol, uLutIntensity);
  }

  if (uVignette > 0.001) {
    float vig = smoothstep(0.95, 0.25, length(uv - 0.5));
    col *= mix(1.0 - uVignette * 0.85, 1.0, vig);
  }

  col = clamp(col, 0.0, 1.0);

  if (uBlendMode != 0) {
    vec3 bg = texture(uBackBuffer, vScreenUv).rgb;
    col = blendRgb(bg, col, uBlendMode);
  }

  fragColor = vec4(col, alpha);
}`;

// Dedicated Multi-Pass 36-Shader GPU VFX Program (runs iteratively across Ping-Pong FBOs)
const VFX_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform int uVfxType;
uniform float uIntensity;
uniform float uSpeed;
uniform float uScale;
uniform float uTimeSec;
uniform vec2 uResolution;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = vUv;
  float inten = clamp(uIntensity, 0.0, 1.5);
  float t = uTimeSec * max(0.1, uSpeed);
  float sc = max(0.25, uScale);
  vec2 texel = 1.0 / max(vec2(1.0), uResolution);
  vec4 base = texture(uTexture, uv);
  vec3 col = base.rgb;
  float alpha = base.a;

  if (uVfxType <= 0 || inten <= 0.001) {
    fragColor = base;
    return;
  }

  // --- RETRO & FILM (1..6) ---
  if (uVfxType == 1) { // vhs
    float band = smoothstep(0.0, 0.12, abs(fract(t * 0.22) - uv.y));
    float jitter = (1.0 - band) * 0.015 * inten * sin(uv.y * 80.0 + t * 40.0);
    float scan = sin(uv.y * uResolution.y * 0.55) * 0.06 * inten;
    float shift = (0.006 + jitter) * inten;
    col = vec3(
      texture(uTexture, clamp(uv + vec2(shift, 0.0), 0.0, 1.0)).r,
      texture(uTexture, clamp(uv + vec2(jitter, 0.0), 0.0, 1.0)).g,
      texture(uTexture, clamp(uv - vec2(shift, 0.0), 0.0, 1.0)).b
    ) - scan + (hash21(uv * 200.0 + t) - 0.5) * 0.07 * inten;
  } else if (uVfxType == 2) { // super8_grain
    vec2 weave = vec2(sin(t * 17.0) * 0.0018, cos(t * 23.0) * 0.0022) * inten;
    vec3 s = texture(uTexture, clamp(uv + weave, 0.0, 1.0)).rgb;
    float grain = (hash21(floor(uv * uResolution * 0.5) + floor(t * 24.0)) - 0.5) * 0.16 * inten;
    float vig = smoothstep(0.95, 0.35, length(uv - 0.5));
    col = mix(s, s * vec3(1.06, 0.99, 0.88), inten * 0.55) + grain;
    col *= mix(1.0 - 0.4 * inten, 1.0, vig);
  } else if (uVfxType == 3) { // halation
    vec3 glow = vec3(0.0);
    for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
        vec3 s = texture(uTexture, clamp(uv + vec2(float(i), float(j)) * texel * 5.0 * sc, 0.0, 1.0)).rgb;
        float hi = smoothstep(0.62, 0.98, dot(s, vec3(0.3, 0.6, 0.1)));
        glow += s * hi;
      }
    }
    glow /= 25.0;
    col += glow * vec3(1.4, 0.35, 0.12) * inten * 1.3;
  } else if (uVfxType == 4) { // crt_scan
    vec2 cc = uv - 0.5;
    vec2 warp = uv + cc * dot(cc, cc) * 0.28 * inten;
    if (warp.x < 0.0 || warp.x > 1.0 || warp.y < 0.0 || warp.y > 1.0) {
      col = vec3(0.0);
    } else {
      vec3 c = texture(uTexture, warp).rgb;
      float grille = 0.82 + 0.18 * sin(warp.y * uResolution.y * 0.9);
      float maskX = 0.88 + 0.12 * sin(warp.x * uResolution.x * 1.4);
      col = mix(c, c * grille * maskX, inten);
    }
  } else if (uVfxType == 5) { // cinema_flicker
    float pulse = 1.0 + sin(t * 28.0) * 0.09 * inten + (hash21(vec2(floor(t * 24.0), 1.0)) - 0.5) * 0.08 * inten;
    float scratch = smoothstep(0.995, 1.0, sin(uv.x * 90.0 + floor(t * 14.0) * 7.3)) * 0.35 * inten;
    col = col * pulse + vec3(scratch);
  } else if (uVfxType == 6) { // polaroid_frame
    vec2 border = abs(uv - 0.5);
    float outMask = step(0.42, border.x) + step(0.41, uv.y - 0.5 + 0.04) + step(0.45, 0.5 - uv.y);
    vec3 cream = vec3(0.95, 0.93, 0.88);
    vec3 warmImg = mix(col, col * vec3(1.04, 1.0, 0.92) + vec3(0.03, 0.02, 0.01), inten * 0.7);
    col = outMask > 0.5 ? mix(col, cream, clamp(inten, 0.0, 1.0)) : warmImg;
  }

  // --- LIGHT & GLOW (7..12) ---
  else if (uVfxType == 7) { // anamorphic_flare
    vec3 streak = vec3(0.0);
    for (int i = -6; i <= 6; i++) {
      vec3 s = texture(uTexture, clamp(uv + vec2(float(i) * texel.x * 11.0 * sc, 0.0), 0.0, 1.0)).rgb;
      float lum = dot(s, vec3(0.25, 0.65, 0.1));
      streak += s * smoothstep(0.68, 1.0, lum) * (1.0 - abs(float(i)) / 7.0);
    }
    col += streak * vec3(0.25, 0.65, 1.45) * 0.24 * inten;
  } else if (uVfxType == 8) { // prism_rainbow
    vec2 d = (uv - 0.5);
    float rDist = length(d);
    vec2 dir = rDist > 0.001 ? normalize(d) : vec2(0.0);
    float sp = 0.028 * inten * rDist * sc;
    col = vec3(
      texture(uTexture, clamp(uv + dir * sp, 0.0, 1.0)).r,
      texture(uTexture, uv).g,
      texture(uTexture, clamp(uv - dir * sp, 0.0, 1.0)).b
    );
  } else if (uVfxType == 9) { // light_leak
    float w1 = sin(uv.x * 3.1 - t * 1.4) * 0.5 + 0.5;
    float w2 = cos(uv.y * 2.4 + t * 1.1) * 0.5 + 0.5;
    vec3 leak = mix(vec3(1.0, 0.42, 0.08), vec3(0.95, 0.18, 0.58), w2) * pow(w1 * w2, 1.6);
    col = 1.0 - (1.0 - col) * (1.0 - leak * inten * 0.85);
  } else if (uVfxType == 10) { // god_rays
    vec2 origin = vec2(0.5 + sin(t * 0.5) * 0.12, 0.88);
    vec2 delta = (uv - origin) * 0.075 * sc;
    vec3 rays = vec3(0.0);
    vec2 sampUv = uv;
    for (int i = 0; i < 8; i++) {
      sampUv -= delta;
      vec3 s = texture(uTexture, clamp(sampUv, 0.0, 1.0)).rgb;
      float lum = smoothstep(0.55, 0.98, dot(s, vec3(0.3, 0.6, 0.1)));
      rays += s * lum * (1.0 - float(i) / 8.0);
    }
    col += rays * 0.22 * inten;
  } else if (uVfxType == 11) { // dreamy
    vec3 bloom = vec3(0.0);
    for (int x = -2; x <= 2; x++) {
      for (int y = -2; y <= 2; y++) {
        bloom += texture(uTexture, clamp(uv + vec2(float(x), float(y)) * texel * 4.5 * sc, 0.0, 1.0)).rgb;
      }
    }
    bloom /= 25.0;
    col = mix(col, 1.0 - (1.0 - col) * (1.0 - bloom * 0.85), clamp(inten * 0.8, 0.0, 1.0));
  } else if (uVfxType == 12) { // film_burn
    float edge = smoothstep(0.38, 0.78, length(uv - vec2(0.15, 0.85)) + noise2d(uv * 5.0 * sc + t * 0.9) * 0.35);
    float pulse = 0.5 + 0.5 * sin(t * 2.2);
    vec3 fire = mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.78, 0.2), edge) * (1.0 - edge * 0.45) * (0.65 + 0.35 * pulse);
    col = min(vec3(1.0), col + fire * inten * 0.75 * (1.0 - smoothstep(0.0, 0.75, length(uv - 0.5))));
  }

  // --- GLITCH & CYBER (13..18) ---
  else if (uVfxType == 13) { // glitch
    float row = floor(uv.y * 24.0 * sc);
    float n = hash21(vec2(row, floor(t * 18.0)));
    float slice = (n > 0.65 ? (n - 0.5) * 0.09 : 0.0) * inten;
    float rgbOff = 0.015 * inten;
    col = vec3(
      texture(uTexture, clamp(uv + vec2(slice + rgbOff, 0.0), 0.0, 1.0)).r,
      texture(uTexture, clamp(uv + vec2(slice, 0.0), 0.0, 1.0)).g,
      texture(uTexture, clamp(uv + vec2(slice - rgbOff, 0.0), 0.0, 1.0)).b
    );
  } else if (uVfxType == 14) { // datamosh_block
    float blk = max(6.0, 28.0 / sc);
    vec2 cell = floor(uv * blk) / blk;
    float trigger = step(0.55, hash21(cell + floor(t * 8.0)));
    vec2 disp = trigger * vec2(sin(t * 5.0) * 0.08, cos(t * 7.0) * 0.06) * inten;
    col = texture(uTexture, clamp(uv + disp, 0.0, 1.0)).rgb;
    if (trigger > 0.5) col.rg = col.gr;
  } else if (uVfxType == 15) { // pixel_sort
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    float sortMask = smoothstep(0.35, 0.8, lum);
    vec2 streakUv = clamp(vec2(uv.x, uv.y + sortMask * (hash21(vec2(floor(uv.x * 160.0), floor(t * 10.0))) - 0.25) * 0.12 * inten), 0.0, 1.0);
    col = mix(col, texture(uTexture, streakUv).rgb, sortMask * inten * 0.9);
  } else if (uVfxType == 16) { // hologram_scan
    float scan = 0.65 + 0.35 * sin(uv.y * 190.0 * sc + t * 14.0);
    float flk = 0.88 + 0.12 * hash21(vec2(floor(t * 25.0), 2.0));
    float lum = dot(col, vec3(0.25, 0.6, 0.15));
    vec3 holo = mix(vec3(0.02, 0.25, 0.45), vec3(0.15, 0.95, 1.0), lum) * scan * flk;
    col = mix(col, holo, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 17) { // neon_edge
    vec3 sx = texture(uTexture, clamp(uv + vec2(texel.x * 2.0, 0.0), 0.0, 1.0)).rgb - texture(uTexture, clamp(uv - vec2(texel.x * 2.0, 0.0), 0.0, 1.0)).rgb;
    vec3 sy = texture(uTexture, clamp(uv + vec2(0.0, texel.y * 2.0), 0.0, 1.0)).rgb - texture(uTexture, clamp(uv - vec2(0.0, texel.y * 2.0), 0.0, 1.0)).rgb;
    float edge = clamp(length(sx) + length(sy), 0.0, 1.5);
    vec3 neon = hsv2rgb(vec3(fract(t * 0.25 + uv.x * 0.3), 0.95, 1.0)) * edge * 2.4;
    col = mix(col, col * 0.35 + neon, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 18) { // cyber_grid
    vec2 g = abs(fract(uv * vec2(12.0, 20.0) * sc - vec2(0.0, t * 0.6)) - 0.5);
    float line = smoothstep(0.05, 0.015, min(g.x, g.y));
    vec3 gridCol = mix(vec3(0.0, 0.96, 0.95), vec3(0.95, 0.12, 0.72), uv.y);
    col = mix(col, col * 0.8 + gridCol * line * 1.4, inten * 0.7);
  }

  // --- CAMERA & MOTION (19..24) ---
  else if (uVfxType == 19) { // camera_shake
    vec2 off = vec2(sin(t * 11.3) + cos(t * 23.1) * 0.5, cos(t * 13.7) + sin(t * 19.4) * 0.5) * 0.014 * inten;
    vec2 suv = (uv - 0.5) * (1.0 - 0.08 * inten) + 0.5 + off;
    col = texture(uTexture, clamp(suv, 0.0, 1.0)).rgb;
  } else if (uVfxType == 20) { // beat_pulse
    float pulse = pow(abs(sin(t * 6.28318)), 3.0) * 0.09 * inten;
    vec2 puv = (uv - 0.5) * (1.0 - pulse) + 0.5;
    col = texture(uTexture, clamp(puv, 0.0, 1.0)).rgb * (1.0 + pulse * 1.8);
  } else if (uVfxType == 21) { // zoom_blur
    vec2 dir = (uv - 0.5) * 0.065 * inten * sc;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      acc += texture(uTexture, clamp(uv - dir * (float(i) / 7.0), 0.0, 1.0)).rgb;
    }
    col = acc / 8.0;
  } else if (uVfxType == 22) { // motion_blur
    vec2 dir = vec2(cos(t * 0.4), sin(t * 0.4) * 0.25) * 0.045 * inten * sc;
    vec3 acc = vec3(0.0);
    for (int i = -3; i <= 3; i++) {
      acc += texture(uTexture, clamp(uv + dir * float(i) / 3.0, 0.0, 1.0)).rgb;
    }
    col = acc / 7.0;
  } else if (uVfxType == 23) { // fisheye
    vec2 c = uv - 0.5;
    float r = length(c);
    float k = 1.0 + 1.45 * inten * sc * r * r;
    vec2 fuv = c / max(0.35, k) + 0.5;
    col = texture(uTexture, clamp(fuv, 0.0, 1.0)).rgb;
  } else if (uVfxType == 24) { // kaleidoscope
    vec2 p = uv - 0.5;
    float r = length(p);
    float seg = max(3.0, floor(4.0 + 4.0 * sc));
    float ang = atan(p.y, p.x) + t * 0.2;
    float slice = 6.28318 / seg;
    ang = mod(ang, slice);
    ang = abs(ang - slice * 0.5);
    vec2 kuv = vec2(cos(ang), sin(ang)) * r + 0.5;
    col = mix(col, texture(uTexture, clamp(kuv, 0.0, 1.0)).rgb, clamp(inten, 0.0, 1.0));
  }

  // --- BLUR & LENS (25..30) ---
  else if (uVfxType == 25 || uVfxType == 26 || uVfxType == 27 || uVfxType == 29) {
    float maskAmt = 1.0;
    if (uVfxType == 26) { // tilt_shift
      maskAmt = smoothstep(0.14, 0.38, abs(uv.y - 0.5));
    } else if (uVfxType == 27) { // radial_focus
      maskAmt = smoothstep(0.18, 0.48, length(uv - 0.5));
    }
    float radius = 6.5 * inten * sc * maskAmt;
    vec2 j = uVfxType == 29 ? (vec2(hash21(uv * 300.0), hash21(uv * 300.0 + 7.1)) - 0.5) * 0.03 * inten : vec2(0.0);
    vec3 acc = vec3(0.0);
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        acc += texture(uTexture, clamp(uv + j + vec2(float(x), float(y)) * texel * radius, 0.0, 1.0)).rgb;
      }
    }
    col = acc / 9.0;
    if (uVfxType == 26) {
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, 1.0 + 0.35 * inten);
    }
  } else if (uVfxType == 28) { // pixel_mosaic
    float grid = max(8.0, mix(220.0, 16.0, clamp(inten, 0.0, 1.0)) / sc);
    vec2 puv = (floor(uv * grid) + 0.5) / grid;
    col = texture(uTexture, clamp(puv, 0.0, 1.0)).rgb;
  } else if (uVfxType == 30) { // chromatic
    vec2 d = (uv - 0.5) * 0.032 * inten * sc;
    col = vec3(
      texture(uTexture, clamp(uv + d, 0.0, 1.0)).r,
      col.g,
      texture(uTexture, clamp(uv - d, 0.0, 1.0)).b
    );
  }

  // --- STYLIZE & ARTISTIC (31..36) ---
  else if (uVfxType == 31) { // halftone
    float dots = 55.0 / sc;
    vec2 gv = fract(uv * vec2(dots, dots * uResolution.y / max(1.0, uResolution.x))) - 0.5;
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    float dMask = smoothstep(lum * 0.65, lum * 0.65 + 0.1, length(gv));
    col = mix(col, col * (0.25 + 0.75 * (1.0 - dMask)), clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 32) { // oil_paint
    vec3 m0 = vec3(0.0);
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        m0 += texture(uTexture, clamp(uv + vec2(float(i), float(j)) * texel * 3.5 * sc, 0.0, 1.0)).rgb;
      }
    }
    vec3 smoothCol = floor((m0 / 9.0) * 10.0) / 10.0;
    col = mix(col, smoothCol, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 33) { // duotone
    float lum = smoothstep(0.1, 0.9, dot(col, vec3(0.3, 0.59, 0.11)));
    vec3 duo = mix(vec3(0.08, 0.05, 0.38), vec3(0.05, 0.94, 0.85), lum);
    col = mix(col, duo, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 34) { // thermal
    float lum = clamp(dot(col, vec3(0.3, 0.59, 0.11)), 0.0, 1.0);
    vec3 therm = lum < 0.33
      ? mix(vec3(0.05, 0.02, 0.35), vec3(0.62, 0.06, 0.56), lum * 3.0)
      : lum < 0.68
        ? mix(vec3(0.62, 0.06, 0.56), vec3(0.98, 0.45, 0.04), (lum - 0.33) / 0.35)
        : mix(vec3(0.98, 0.45, 0.04), vec3(1.0, 0.98, 0.68), (lum - 0.68) / 0.32);
    col = mix(col, therm, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 35) { // night_vision
    float lum = dot(col, vec3(0.25, 0.65, 0.1));
    float grain = (hash21(uv * 220.0 + t * 19.0) - 0.5) * 0.14;
    float scope = smoothstep(0.9, 0.35, length(uv - 0.5));
    vec3 nv = vec3(0.12, 0.98, 0.32) * clamp(lum * 1.45 + grain, 0.0, 1.0) * scope;
    col = mix(col, nv, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 36) { // sketch_outline
    vec3 sx = texture(uTexture, clamp(uv + vec2(texel.x * 1.5, 0.0), 0.0, 1.0)).rgb - texture(uTexture, clamp(uv - vec2(texel.x * 1.5, 0.0), 0.0, 1.0)).rgb;
    vec3 sy = texture(uTexture, clamp(uv + vec2(0.0, texel.y * 1.5), 0.0, 1.0)).rgb - texture(uTexture, clamp(uv - vec2(0.0, texel.y * 1.5), 0.0, 1.0)).rgb;
    float edge = clamp((length(sx) + length(sy)) * 2.5, 0.0, 1.0);
    vec3 ink = mix(vec3(0.96, 0.95, 0.92), vec3(0.1, 0.11, 0.14), edge);
    col = mix(col, ink, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 37) { // perlin_shake
    float nX = (noise2d(vec2(t * 4.2, 1.3)) - 0.5) * 0.045 * inten;
    float nY = (noise2d(vec2(3.7, t * 4.6)) - 0.5) * 0.045 * inten;
    float ang = (noise2d(vec2(t * 2.5, 8.1)) - 0.5) * 0.03 * inten;
    vec2 d = (uv - 0.5) * (1.0 - 0.09 * inten);
    vec2 ruv = vec2(d.x * cos(ang) - d.y * sin(ang), d.x * sin(ang) + d.y * cos(ang)) + 0.5 + vec2(nX, nY);
    col = (texture(uTexture, clamp(ruv, 0.0, 1.0)).rgb + texture(uTexture, clamp(ruv - vec2(nX, nY) * 0.35, 0.0, 1.0)).rgb) * 0.5;
  } else if (uVfxType == 38) { // skin_beauty (Bilateral Smoothing)
    vec3 center = col;
    vec3 acc = center;
    float wSum = 1.0;
    for (int xi = -2; xi <= 2; xi++) {
      for (int yi = -2; yi <= 2; yi++) {
        if (xi == 0 && yi == 0) continue;
        vec3 s = texture(uTexture, clamp(uv + vec2(float(xi), float(yi)) * texel * 2.8 * sc, 0.0, 1.0)).rgb;
        float diff = dot(s - center, s - center);
        float w = exp(-diff * 36.0);
        acc += s * w;
        wSum += w;
      }
    }
    col = mix(center, acc / wSum, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 39) { // radial_zoom_fast
    float beat = pow(abs(sin(t * 5.4)), 2.5);
    vec2 dir = (uv - 0.5) * (0.04 + 0.06 * beat) * inten * sc;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      acc += texture(uTexture, clamp(uv - dir * (float(i) / 7.0), 0.0, 1.0)).rgb;
    }
    col = acc / 8.0;
  } else if (uVfxType == 40) { // beat_rgb_split
    float beat = pow(abs(sin(t * 6.283)), 4.0) * 0.036 * inten * sc;
    col = vec3(
      texture(uTexture, clamp(uv + vec2(beat, beat * 0.3), 0.0, 1.0)).r,
      col.g,
      texture(uTexture, clamp(uv - vec2(beat, beat * 0.3), 0.0, 1.0)).b
    );
  } else if (uVfxType == 41) { // crt_curved
    vec2 cc = uv - 0.5;
    vec2 warp = uv + cc * dot(cc, cc) * 0.36 * inten;
    if (warp.x < 0.0 || warp.x > 1.0 || warp.y < 0.0 || warp.y > 1.0) {
      col = vec3(0.01);
    } else {
      vec3 c = texture(uTexture, warp).rgb;
      float ph = 0.78 + 0.22 * sin(warp.y * uResolution.y * 1.15);
      col = c * ph + vec3(0.0, 0.03, 0.04) * inten;
    }
  } else if (uVfxType == 42) { // rain_lens
    vec2 grid = vec2(22.0, 12.0) * sc;
    vec2 gv = fract(uv * grid + vec2(0.0, t * 0.85)) - 0.5;
    float drop = smoothstep(0.32, 0.08, length(gv * vec2(1.0, 0.65))) * step(0.6, hash21(floor(uv * grid + vec2(0.0, floor(t * 0.85)))));
    vec2 refractUv = clamp(uv - gv * drop * 0.06 * inten, 0.0, 1.0);
    col = texture(uTexture, refractUv).rgb + vec3(0.18, 0.25, 0.35) * drop * inten * 0.4;
  } else if (uVfxType == 43) { // subject_neon_glow
    vec3 sx = texture(uTexture, clamp(uv + vec2(texel.x * 2.5, 0.0), 0.0, 1.0)).rgb - texture(uTexture, clamp(uv - vec2(texel.x * 2.5, 0.0), 0.0, 1.0)).rgb;
    vec3 sy = texture(uTexture, clamp(uv + vec2(0.0, texel.y * 2.5), 0.0, 1.0)).rgb - texture(uTexture, clamp(uv - vec2(0.0, texel.y * 2.5), 0.0, 1.0)).rgb;
    float edge = smoothstep(0.18, 0.72, length(sx) + length(sy));
    vec3 halo = hsv2rgb(vec3(fract(t * 0.18 + uv.y * 0.4), 0.9, 1.0)) * edge * 1.9;
    col = min(vec3(1.0), col + halo * inten);
  } else if (uVfxType == 44) { // miniature_tilt
    float amt = smoothstep(0.12, 0.35, abs(uv.y - 0.5));
    vec3 acc = vec3(0.0);
    float rad = 7.5 * inten * amt * sc;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        acc += texture(uTexture, clamp(uv + vec2(float(x), float(y)) * texel * rad, 0.0, 1.0)).rgb;
      }
    }
    vec3 satCol = acc / 9.0;
    float lum = dot(satCol, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), satCol, 1.0 + 0.5 * inten);
  } else if (uVfxType == 45) { // cine_halation_pro
    vec3 bloom = vec3(0.0);
    for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
        vec3 s = texture(uTexture, clamp(uv + vec2(float(i), float(j)) * texel * 6.0 * sc, 0.0, 1.0)).rgb;
        bloom += s * smoothstep(0.58, 0.95, dot(s, vec3(0.3, 0.6, 0.1)));
      }
    }
    float grain = (hash21(uv * 320.0 + floor(t * 24.0)) - 0.5) * 0.09 * inten;
    col = col + (bloom / 25.0) * vec3(1.5, 0.28, 0.1) * inten + grain;
  } else if (uVfxType == 46) { // speed_lines
    vec2 d = uv - 0.5;
    float ang = atan(d.y, d.x);
    float ray = pow(abs(sin(ang * 42.0 * sc + floor(t * 16.0) * 3.1)), 14.0);
    float edgeMask = smoothstep(0.24, 0.55, length(d));
    col = mix(col, vec3(1.0), ray * edgeMask * 0.75 * inten);
  } else if (uVfxType == 47) { // thermal_plasma
    float lum = clamp(dot(col, vec3(0.3, 0.59, 0.11)), 0.0, 1.0);
    vec3 plasma = mix(vec3(0.08, 0.02, 0.25), mix(vec3(0.8, 0.12, 0.55), vec3(0.99, 0.85, 0.18), lum), smoothstep(0.15, 0.95, lum));
    col = mix(col, plasma, clamp(inten, 0.0, 1.0));
  } else if (uVfxType == 48) { // glass_refract
    vec2 wave = vec2(sin(uv.y * 22.0 + t * 2.8), cos(uv.x * 18.0 - t * 2.2)) * 0.015 * inten * sc;
    col = texture(uTexture, clamp(uv + wave, 0.0, 1.0)).rgb + vec3(0.04, 0.09, 0.12) * inten;
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}`;

// Dedicated Dual-Texture Transition Pass (Outgoing A in uTexFrom -> Incoming B in uTexTo, p: 0 -> 1)
const TRANSITION_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTexFrom;
uniform sampler2D uTexTo;
uniform int uTransType;
uniform float uProgress;
uniform vec2 uResolution;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  float p = clamp(uProgress, 0.0, 1.0);
  // Smooth cubic ease in-out
  float e = p * p * (3.0 - 2.0 * p);

  vec4 fromCol = texture(uTexFrom, uv);
  vec4 toCol = texture(uTexTo, uv);

  // 1..4: Whip Directional Pans
  if (uTransType == 1) { // whip_left
    float blurAmt = sin(p * 3.14159) * 0.03;
    vec2 fUv = vec2(uv.x + e, uv.y);
    vec2 tUv = vec2(uv.x - (1.0 - e), uv.y);
    vec4 s = fUv.x <= 1.0 ? texture(uTexFrom, clamp(fUv - vec2(blurAmt, 0.0), 0.0, 1.0)) : texture(uTexTo, clamp(tUv + vec2(blurAmt, 0.0), 0.0, 1.0));
    fragColor = s; return;
  }
  if (uTransType == 2) { // whip_right
    vec2 fUv = vec2(uv.x - e, uv.y);
    vec2 tUv = vec2(uv.x + (1.0 - e), uv.y);
    fragColor = fUv.x >= 0.0 ? texture(uTexFrom, fUv) : texture(uTexTo, tUv); return;
  }
  if (uTransType == 3) { // whip_up
    vec2 fUv = vec2(uv.x, uv.y + e);
    vec2 tUv = vec2(uv.x, uv.y - (1.0 - e));
    fragColor = fUv.y <= 1.0 ? texture(uTexFrom, fUv) : texture(uTexTo, tUv); return;
  }
  if (uTransType == 4) { // whip_down
    vec2 fUv = vec2(uv.x, uv.y - e);
    vec2 tUv = vec2(uv.x, uv.y + (1.0 - e));
    fragColor = fUv.y >= 0.0 ? texture(uTexFrom, fUv) : texture(uTexTo, tUv); return;
  }

  // 5..7: Camera Zoom / Spin
  if (uTransType == 5) { // zoom_in
    vec2 uA = (uv - 0.5) * mix(1.0, 0.45, e) + 0.5;
    vec2 uB = (uv - 0.5) * mix(1.85, 1.0, e) + 0.5;
    fragColor = mix(texture(uTexFrom, clamp(uA, 0.0, 1.0)), texture(uTexTo, clamp(uB, 0.0, 1.0)), e); return;
  }
  if (uTransType == 6) { // zoom_out
    vec2 uA = (uv - 0.5) * mix(1.0, 1.9, e) + 0.5;
    vec2 uB = (uv - 0.5) * mix(0.45, 1.0, e) + 0.5;
    fragColor = mix(texture(uTexFrom, clamp(uA, 0.0, 1.0)), texture(uTexTo, clamp(uB, 0.0, 1.0)), e); return;
  }
  if (uTransType == 7) { // spin
    float ang = sin(p * 3.14159) * 2.2;
    float cs = cos(ang); float sn = sin(ang);
    vec2 d = uv - 0.5;
    vec2 suv = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs) * (1.0 - 0.25 * sin(p * 3.14159)) + 0.5;
    fragColor = mix(texture(uTexFrom, clamp(suv, 0.0, 1.0)), texture(uTexTo, clamp(suv, 0.0, 1.0)), e); return;
  }

  // 8..12: Light & Film
  if (uTransType == 8) { // dissolve
    fragColor = mix(fromCol, toCol, e); return;
  }
  if (uTransType == 9) { // dip_black
    float w = p < 0.5 ? (1.0 - p * 2.0) : ((p - 0.5) * 2.0);
    vec4 src = p < 0.5 ? fromCol : toCol;
    fragColor = vec4(src.rgb * w, 1.0); return;
  }
  if (uTransType == 10) { // flash_white
    float flash = pow(sin(p * 3.14159), 2.0);
    vec4 blended = mix(fromCol, toCol, step(0.5, p));
    fragColor = vec4(mix(blended.rgb, vec3(1.0), flash * 0.92), 1.0); return;
  }
  if (uTransType == 11) { // film_burn
    float flare = pow(sin(p * 3.14159), 1.4);
    vec3 fire = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.85, 0.35), uv.x);
    vec4 baseMix = mix(fromCol, toCol, e);
    fragColor = vec4(clamp(baseMix.rgb + fire * flare * 0.9, 0.0, 1.0), 1.0); return;
  }
  if (uTransType == 12) { // light_leak
    float leak = sin(p * 3.14159);
    vec3 wash = mix(vec3(1.0, 0.65, 0.2), vec3(0.95, 0.3, 0.7), uv.y);
    fragColor = vec4(clamp(mix(fromCol.rgb, toCol.rgb, e) + wash * leak * 0.65, 0.0, 1.0), 1.0); return;
  }

  // 13..18: Geometric Wipes
  if (uTransType == 13) { // wipe_left
    float m = smoothstep(e - 0.04, e + 0.04, uv.x);
    fragColor = mix(toCol, fromCol, m); return;
  }
  if (uTransType == 14) { // wipe_right
    float m = smoothstep(e - 0.04, e + 0.04, 1.0 - uv.x);
    fragColor = mix(toCol, fromCol, m); return;
  }
  if (uTransType == 15) { // iris_circle
    float d = length(uv - 0.5) / 0.75;
    float m = smoothstep(e - 0.04, e + 0.04, d);
    fragColor = mix(toCol, fromCol, m); return;
  }
  if (uTransType == 16) { // split_curtains
    float d = abs(uv.x - 0.5) * 2.0;
    float m = smoothstep(e - 0.04, e + 0.04, d);
    fragColor = mix(toCol, fromCol, m); return;
  }
  if (uTransType == 17) { // clock_wipe
    vec2 d = uv - 0.5;
    float a = (atan(d.y, d.x) + 3.14159265) / 6.2831853;
    float m = smoothstep(e - 0.03, e + 0.03, a);
    fragColor = mix(toCol, fromCol, m); return;
  }
  if (uTransType == 18) { // diagonal_slash
    float diag = (uv.x + uv.y) * 0.5;
    float m = smoothstep(e - 0.04, e + 0.04, diag);
    float slash = smoothstep(0.04, 0.0, abs(diag - e)) * sin(p * 3.14159);
    vec4 mixed = mix(toCol, fromCol, m);
    fragColor = vec4(clamp(mixed.rgb + vec3(1.0) * slash * 0.7, 0.0, 1.0), 1.0); return;
  }

  // 19..24: Glitch & Distortion
  if (uTransType == 19) { // glitch
    float slice = floor(uv.y * 22.0);
    float pick = step(hash21(vec2(slice, floor(p * 12.0))), e);
    float off = sin(p * 3.14159) * (hash21(vec2(slice, 3.0)) - 0.5) * 0.09;
    vec4 src = pick > 0.5 ? texture(uTexTo, clamp(uv + vec2(off, 0.0), 0.0, 1.0)) : texture(uTexFrom, clamp(uv - vec2(off, 0.0), 0.0, 1.0));
    fragColor = src; return;
  }
  if (uTransType == 20) { // chromatic
    float sp = sin(p * 3.14159) * 0.045;
    vec3 cA = vec3(texture(uTexFrom, clamp(uv + vec2(sp, 0.0), 0.0, 1.0)).r, fromCol.g, texture(uTexFrom, clamp(uv - vec2(sp, 0.0), 0.0, 1.0)).b);
    vec3 cB = vec3(texture(uTexTo, clamp(uv + vec2(sp, 0.0), 0.0, 1.0)).r, toCol.g, texture(uTexTo, clamp(uv - vec2(sp, 0.0), 0.0, 1.0)).b);
    fragColor = vec4(mix(cA, cB, e), 1.0); return;
  }
  if (uTransType == 21) { // pixel_morph
    float peak = sin(p * 3.14159);
    float g = mix(300.0, 18.0, peak);
    vec2 puv = (floor(uv * g) + 0.5) / g;
    fragColor = mix(texture(uTexFrom, puv), texture(uTexTo, puv), e); return;
  }
  if (uTransType == 22) { // water_ripple
    vec2 d = uv - 0.5;
    float r = length(d);
    vec2 offset = normalize(d + 0.0001) * sin(r * 36.0 - p * 14.0) * 0.03 * sin(p * 3.14159);
    fragColor = mix(texture(uTexFrom, clamp(uv + offset, 0.0, 1.0)), texture(uTexTo, clamp(uv + offset, 0.0, 1.0)), e); return;
  }
  if (uTransType == 23) { // swirl_blur
    vec2 d = uv - 0.5;
    float r = length(d);
    float ang = (1.0 - r) * sin(p * 3.14159) * 3.8;
    float cs = cos(ang); float sn = sin(ang);
    vec2 suv = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs) + 0.5;
    fragColor = mix(texture(uTexFrom, clamp(suv, 0.0, 1.0)), texture(uTexTo, clamp(suv, 0.0, 1.0)), e); return;
  }

  // 25..32: 3D Cube, Flip, Page Peel, Matte & Hyper Transitions
  if (uTransType == 25) { // cube_turn
    if (uv.x < 1.0 - e) {
      float fx = uv.x / max(0.001, 1.0 - e);
      float yScale = mix(1.0, 0.85, e);
      vec2 suv = vec2(fx, (uv.y - 0.5) / yScale + 0.5);
      fragColor = suv.y >= 0.0 && suv.y <= 1.0 ? texture(uTexFrom, suv) * (1.0 - e * 0.35) : vec4(0.02, 0.03, 0.05, 1.0);
    } else {
      float tx = (uv.x - (1.0 - e)) / max(0.001, e);
      float yScale = mix(0.85, 1.0, e);
      vec2 suv = vec2(tx, (uv.y - 0.5) / yScale + 0.5);
      fragColor = suv.y >= 0.0 && suv.y <= 1.0 ? texture(uTexTo, suv) * (0.65 + e * 0.35) : vec4(0.02, 0.03, 0.05, 1.0);
    }
    return;
  }
  if (uTransType == 26) { // card_flip
    float scaleX = abs(cos(e * 3.14159));
    vec2 suv = vec2((uv.x - 0.5) / max(0.02, scaleX) + 0.5, uv.y);
    if (suv.x < 0.0 || suv.x > 1.0) { fragColor = vec4(0.02, 0.03, 0.06, 1.0); return; }
    fragColor = e < 0.5 ? texture(uTexFrom, suv) : texture(uTexTo, suv); return;
  }
  if (uTransType == 27) { // page_peel
    float diag = uv.x * 0.65 + (1.0 - uv.y) * 0.35;
    float edge = 1.0 - e * 1.1;
    if (diag > edge + 0.06) { fragColor = toCol; return; }
    if (diag > edge - 0.04) { fragColor = vec4(mix(fromCol.rgb, vec3(0.95), 0.45), 1.0); return; }
    fragColor = fromCol; return;
  }
  if (uTransType == 28) { // luma_fade
    float lum = dot(fromCol.rgb, vec3(0.299, 0.587, 0.114));
    float m = smoothstep(e - 0.12, e + 0.12, lum * 0.85 + 0.075);
    fragColor = mix(toCol, fromCol, m); return;
  }
  if (uTransType == 29) { // whip_zoom_blur
    float z = sin(p * 3.14159) * 0.45;
    vec2 uA = (uv - 0.5) * (1.0 - z) + 0.5;
    vec2 uB = (uv - 0.5) * (1.0 + z * 0.7) + 0.5;
    fragColor = mix(texture(uTexFrom, clamp(uA, 0.0, 1.0)), texture(uTexTo, clamp(uB, 0.0, 1.0)), e); return;
  }
  if (uTransType == 30) { // morph_dissolve
    vec2 shift = (toCol.rg - fromCol.rg) * sin(p * 3.14159) * 0.025;
    fragColor = mix(texture(uTexFrom, clamp(uv + shift, 0.0, 1.0)), texture(uTexTo, clamp(uv - shift, 0.0, 1.0)), e); return;
  }
  if (uTransType == 31) { // mosaic_tiles
    vec2 cell = fract(uv * 6.0) - 0.5;
    float tileDelay = hash21(floor(uv * 6.0)) * 0.45;
    float tp = clamp((e - tileDelay) / 0.55, 0.0, 1.0);
    fragColor = tp > 0.5 ? texture(uTexTo, clamp(uv + cell * (1.0 - tp) * 0.08, 0.0, 1.0)) : fromCol; return;
  }
  if (uTransType == 32) { // radial_rgb_flash
    float peak = sin(p * 3.14159);
    vec2 d = (uv - 0.5) * 0.06 * peak;
    vec4 base = mix(fromCol, toCol, step(0.5, p));
    float rCh = p < 0.5 ? texture(uTexFrom, clamp(uv + d, 0.0, 1.0)).r : texture(uTexTo, clamp(uv + d, 0.0, 1.0)).r;
    float bCh = p < 0.5 ? texture(uTexFrom, clamp(uv - d, 0.0, 1.0)).b : texture(uTexTo, clamp(uv - d, 0.0, 1.0)).b;
    fragColor = vec4(
      rCh + peak * 0.4,
      base.g + peak * 0.35,
      bCh + peak * 0.4,
      1.0
    );
    return;
  }

  // 24: shake_cut
  float amp = sin(p * 3.14159) * 0.03;
  vec2 sh = vec2(sin(p * 48.0), cos(p * 37.0)) * amp;
  fragColor = mix(texture(uTexFrom, clamp(uv + sh, 0.0, 1.0)), texture(uTexTo, clamp(uv - sh, 0.0, 1.0)), e);
}`;

const BLEND_MODE_INDEX: Record<BlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  soft_light: 4,
  hard_light: 5,
  color_dodge: 6,
  darken: 7,
  lighten: 8,
  difference: 9,
  add: 10,
  exclusion: 11,
};

const MASK_SHAPE_INDEX: Record<Clip['mask']['shape'], number> = {
  none: 0,
  linear: 1,
  mirror: 2,
  circle: 3,
  rectangle: 4,
  heart: 5,
  star: 6,
};

const HSL_KEYS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;

const MAIN_UNIFORM_NAMES = [
  'uTexture',
  'uMaskTexture',
  'uLutTexture',
  'uBackBuffer',
  'uCurvesTexture',
  'uHasMattingMask',
  'uHasLut',
  'uLutSize',
  'uLutIntensity',
  'uHasCurves',
  'uOpacity',
  'uCrop',
  'uBlendMode',
  'uExposure',
  'uBrightness',
  'uContrast',
  'uSaturation',
  'uVibrance',
  'uTemperature',
  'uTint',
  'uVignette',
  'uSharpness',
  'uSrcTexel',
  'uLift',
  'uGamma',
  'uGain',
  'uHsl[0]',
  'uHasHsl',
  'uChromaEnabled',
  'uChromaColor',
  'uChromaSimilarity',
  'uChromaSmoothness',
  'uChromaSpill',
  'uMaskShape',
  'uMaskCenter',
  'uMaskSize',
  'uMaskRotation',
  'uMaskFeather',
  'uMaskInverted',
  'uResolution',
  'uSrcResolution',
  'uTranslate',
  'uScale',
  'uRotationRad',
  'uFlip',
  'uFillMode',
] as const;

function hexToRgbNorm(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  if (c.length < 6) return [0, 1, 0];
  return [
    Number.parseInt(c.slice(0, 2), 16) / 255,
    Number.parseInt(c.slice(2, 4), 16) / 255,
    Number.parseInt(c.slice(4, 6), 16) / 255,
  ];
}

function sampleSortedCurve(sorted: [number, number][], x: number): number {
  if (!sorted || sorted.length === 0) return x;
  if (x <= sorted[0][0]) return sorted[0][1];
  if (x >= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [x0, y0] = sorted[i];
    const [x1, y1] = sorted[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / Math.max(1e-5, x1 - x0);
      const smooth = t * t * (3 - 2 * t);
      return y0 + (y1 - y0) * smooth;
    }
  }
  return x;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader error: ${log}`);
  }
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export class WebGLCompositor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vfxProgram: WebGLProgram;
  private transitionProgram: WebGLProgram;
  private uLoc: Record<string, WebGLUniformLocation | null> = {};
  private vfxLoc: Record<string, WebGLUniformLocation | null> = {};
  private transLoc: Record<string, WebGLUniformLocation | null> = {};
  private customPrograms = new Map<
    string,
    { src: string; program: WebGLProgram; uTex: WebGLUniformLocation | null; uTime: WebGLUniformLocation | null; uInt: WebGLUniformLocation | null }
  >();
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private clipTextures = new Map<string, WebGLTexture>();
  private lastVideoTimes = new Map<string, number>();
  private lutTextures = new Map<string, { tex: WebGLTexture; size: number }>();
  private curvesTexture: WebGLTexture;
  private behindOverlayTex: WebGLTexture | null = null;
  private hslScratch = new Float32Array(24);
  private lastCurvesSig = '';
  private lastCurvesActive = false;

  private backTexture: WebGLTexture;
  private backFbo: WebGLFramebuffer;
  private fxTexA: WebGLTexture;
  private fxFboA: WebGLFramebuffer;
  private fxTexB: WebGLTexture;
  private fxFboB: WebGLFramebuffer;
  private transFromTex: WebGLTexture;
  private transFromFbo: WebGLFramebuffer;
  private glowTexture: WebGLTexture;
  private glowFbo: WebGLFramebuffer;

  private fboW = 0;
  private fboH = 0;
  private glowProbe = new Uint8Array(16 * 4);
  private lastGlowSampleAt = 0;
  private cachedGlowCss: string | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error('WebGL2 unavailable on this device');
    }
    this.gl = gl;

    this.program = linkProgram(gl, VERTEX_SHADER, MAIN_FRAGMENT_SHADER);
    for (const name of MAIN_UNIFORM_NAMES) {
      this.uLoc[name] = gl.getUniformLocation(this.program, name);
    }

    this.vfxProgram = linkProgram(gl, BLIT_VERTEX_SHADER, VFX_FRAGMENT_SHADER);
    for (const name of ['uTexture', 'uVfxType', 'uIntensity', 'uSpeed', 'uScale', 'uTimeSec', 'uResolution']) {
      this.vfxLoc[name] = gl.getUniformLocation(this.vfxProgram, name);
    }

    this.transitionProgram = linkProgram(gl, BLIT_VERTEX_SHADER, TRANSITION_FRAGMENT_SHADER);
    for (const name of ['uTexFrom', 'uTexTo', 'uTransType', 'uProgress', 'uResolution']) {
      this.transLoc[name] = gl.getUniformLocation(this.transitionProgram, name);
    }

    const quad = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    this.curvesTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.curvesTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.backTexture = gl.createTexture()!;
    this.backFbo = gl.createFramebuffer()!;
    this.fxTexA = gl.createTexture()!;
    this.fxFboA = gl.createFramebuffer()!;
    this.fxTexB = gl.createTexture()!;
    this.fxFboB = gl.createFramebuffer()!;
    this.transFromTex = gl.createTexture()!;
    this.transFromFbo = gl.createFramebuffer()!;

    this.glowTexture = gl.createTexture()!;
    this.glowFbo = gl.createFramebuffer()!;
    gl.bindTexture(gl.TEXTURE_2D, this.glowTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.glowTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private getOrCompileCustomProgram(id: string, bodyGlsl: string) {
    const cached = this.customPrograms.get(id);
    if (cached && cached.src === bodyGlsl) return cached;
    const gl = this.gl;
    const wrappedFs = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float uTimeSec;
uniform float uEffectIntensity;
${bodyGlsl}
void main() {
  fragColor = effectMain(uTexture, vUv, uTimeSec, uEffectIntensity);
}`;
    try {
      const prog = linkProgram(gl, BLIT_VERTEX_SHADER, wrappedFs);
      const entry = {
        src: bodyGlsl,
        program: prog,
        uTex: gl.getUniformLocation(prog, 'uTexture'),
        uTime: gl.getUniformLocation(prog, 'uTimeSec'),
        uInt: gl.getUniformLocation(prog, 'uEffectIntensity'),
      };
      this.customPrograms.set(id, entry);
      return entry;
    } catch {
      return null;
    }
  }

  private ensureFbos(w: number, h: number): void {
    const gl = this.gl;
    if (this.fboW === w && this.fboH === h) return;
    this.fboW = w;
    this.fboH = h;

    const alloc = (tex: WebGLTexture, fbo: WebGLFramebuffer) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    };

    alloc(this.backTexture, this.backFbo);
    alloc(this.fxTexA, this.fxFboA);
    alloc(this.fxTexB, this.fxFboB);
    alloc(this.transFromTex, this.transFromFbo);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private uploadCurves(curves: ColorGradeState['curves']): boolean {
    const isIdentity = (pts: [number, number][]) =>
      pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1;
    if (isIdentity(curves.master) && isIdentity(curves.red) && isIdentity(curves.green) && isIdentity(curves.blue)) {
      return false;
    }

    const sig = JSON.stringify(curves);
    if (sig === this.lastCurvesSig) return this.lastCurvesActive;
    this.lastCurvesSig = sig;
    this.lastCurvesActive = true;

    const mSorted = [...curves.master].sort((a, b) => a[0] - b[0]);
    const rSorted = [...curves.red].sort((a, b) => a[0] - b[0]);
    const gSorted = [...curves.green].sort((a, b) => a[0] - b[0]);
    const bSorted = [...curves.blue].sort((a, b) => a[0] - b[0]);

    const row = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      const m = sampleSortedCurve(mSorted, x);
      row[i * 4] = Math.round(Math.min(1, Math.max(0, sampleSortedCurve(rSorted, m))) * 255);
      row[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, sampleSortedCurve(gSorted, m))) * 255);
      row[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, sampleSortedCurve(bSorted, m))) * 255);
      row[i * 4 + 3] = 255;
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.curvesTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, row);
    return true;
  }

  uploadLut(lut: LoadedLutTexture): void {
    const gl = this.gl;
    const prev = this.lutTextures.get(lut.id);
    if (prev) gl.deleteTexture(prev.tex);
    const N = lut.size;
    const width = N * N;
    const height = N;
    const rgba = new Uint8Array(width * height * 4);
    for (let z = 0; z < N; z++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const srcIdx = ((z * N + y) * N + x) * 3;
          const dstX = z * N + x;
          const dstIdx = (y * width + dstX) * 4;
          rgba[dstIdx] = Math.round(Math.min(1, Math.max(0, lut.data[srcIdx])) * 255);
          rgba[dstIdx + 1] = Math.round(Math.min(1, Math.max(0, lut.data[srcIdx + 1])) * 255);
          rgba[dstIdx + 2] = Math.round(Math.min(1, Math.max(0, lut.data[srcIdx + 2])) * 255);
          rgba[dstIdx + 3] = 255;
        }
      }
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.lutTextures.set(lut.id, { tex, size: N });
  }

  private getOrUpdateTexture(key: string, source: HTMLVideoElement | HTMLImageElement, forceUpload = false): WebGLTexture {
    const gl = this.gl;
    let tex = this.clipTextures.get(key);
    const isNew = !tex;
    if (!tex) {
      if (this.clipTextures.size > 32) {
        const oldestKey = this.clipTextures.keys().next().value;
        if (oldestKey) {
          const oldTex = this.clipTextures.get(oldestKey);
          if (oldTex) gl.deleteTexture(oldTex);
          this.clipTextures.delete(oldestKey);
          this.lastVideoTimes.delete(oldestKey);
        }
      }
      tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.clipTextures.set(key, tex);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    if (source instanceof HTMLVideoElement) {
      if (source.readyState < 2) return tex;
      const prevTime = this.lastVideoTimes.get(key);
      if (isNew || forceUpload || prevTime === undefined || Math.abs(source.currentTime - prevTime) > 1e-4 || !source.paused) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        this.lastVideoTimes.set(key, source.currentTime);
      }
    } else if (isNew || forceUpload || source.complete) {
      if (source.complete && source.naturalWidth > 0) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      }
    }
    return tex;
  }

  /** Draw a single base visual clip with Transform + Color Grading + LUT3D + Chroma Key + SDF Mask */
  private drawGradedBaseClip(
    clip: Clip,
    localUs: Microseconds,
    w: number,
    h: number,
    mediaElements: Map<string, HTMLVideoElement | HTMLImageElement>,
    maskElements: Map<string, HTMLVideoElement>,
    adj?: ColorGradeState,
    targetFbo: WebGLFramebuffer | null = null,
    forceUpload = false,
    bypassGrade = false,
    ignoreMattingMask = false
  ): boolean {
    if (!clip.assetId) return false;
    const el = mediaElements.get(clip.id) ?? mediaElements.get(clip.assetId);
    if (!el) return false;
    const srcW = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const srcH = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!srcW || !srcH) return false;

    const gl = this.gl;
    const tex = this.getOrUpdateTexture(clip.id, el, forceUpload);

    if (clip.transform.blendMode !== 'normal' && targetFbo === null) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.backFbo);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    if (targetFbo !== null) {
      gl.clearColor(0.02, 0.025, 0.04, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uLoc.uTexture, 0);

    const maskEl = !ignoreMattingMask && clip.aiMattingEnabled ? (maskElements.get(clip.id) ?? maskElements.get(clip.assetId)) : undefined;
    if (maskEl && maskEl.videoWidth > 0) {
      const mTex = this.getOrUpdateTexture(`${clip.id}_mask`, maskEl, forceUpload);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mTex);
      gl.uniform1i(this.uLoc.uMaskTexture, 1);
      gl.uniform1i(this.uLoc.uHasMattingMask, 1);
    } else {
      gl.uniform1i(this.uLoc.uHasMattingMask, 0);
    }

    const effectiveLutId = !bypassGrade ? (clip.colorGrade.lutId || adj?.lutId) : undefined;
    const effectiveLutIntensity = clip.colorGrade.lutId ? clip.colorGrade.lutIntensity : (adj?.lutIntensity ?? 1);
    const lutEntry = effectiveLutId ? this.lutTextures.get(effectiveLutId) : undefined;
    if (lutEntry) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, lutEntry.tex);
      gl.uniform1i(this.uLoc.uLutTexture, 2);
      gl.uniform1i(this.uLoc.uHasLut, 1);
      gl.uniform1f(this.uLoc.uLutSize, lutEntry.size);
      gl.uniform1f(this.uLoc.uLutIntensity, effectiveLutIntensity);
    } else {
      gl.uniform1i(this.uLoc.uHasLut, 0);
    }

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.backTexture);
    gl.uniform1i(this.uLoc.uBackBuffer, 3);

    const hasCurves = bypassGrade ? false : this.uploadCurves(clip.colorGrade.curves);
    gl.uniform1i(this.uLoc.uCurvesTexture, 4);
    gl.uniform1i(this.uLoc.uHasCurves, hasCurves ? 1 : 0);

    const animDelta = evaluateClipAnimation(clip, localUs, clip.durationUs);
    const x = getClipPropertyAtTime(clip, 'x', localUs) + animDelta.dx;
    const y = getClipPropertyAtTime(clip, 'y', localUs) + animDelta.dy;
    const scaleX = getClipPropertyAtTime(clip, 'scaleX', localUs) * animDelta.dScale;
    const scaleY = getClipPropertyAtTime(clip, 'scaleY', localUs) * animDelta.dScale;
    const rot = getClipPropertyAtTime(clip, 'rotation', localUs) + animDelta.dRot;
    const opacity = getClipPropertyAtTime(clip, 'opacity', localUs) * animDelta.dOpacity;

    gl.uniform2f(this.uLoc.uResolution, w, h);
    gl.uniform2f(this.uLoc.uSrcResolution, srcW, srcH);
    gl.uniform2f(this.uLoc.uSrcTexel, 1 / srcW, 1 / srcH);
    gl.uniform2f(this.uLoc.uTranslate, x, y);
    gl.uniform2f(this.uLoc.uScale, scaleX, scaleY);
    gl.uniform1f(this.uLoc.uRotationRad, (rot * Math.PI) / 180);
    gl.uniform2f(this.uLoc.uFlip, clip.transform.flipH ? -1 : 1, clip.transform.flipV ? -1 : 1);
    gl.uniform1i(this.uLoc.uFillMode, clip.transform.fillMode === 'cover' ? 1 : 0);
    gl.uniform1f(this.uLoc.uOpacity, opacity);
    gl.uniform4f(
      this.uLoc.uCrop,
      clip.transform.cropLeft,
      clip.transform.cropRight,
      clip.transform.cropTop,
      clip.transform.cropBottom
    );
    gl.uniform1i(this.uLoc.uBlendMode, targetFbo === null ? BLEND_MODE_INDEX[clip.transform.blendMode] ?? 0 : 0);

    const cg = clip.colorGrade;
    if (bypassGrade) {
      gl.uniform1f(this.uLoc.uExposure, 0);
      gl.uniform1f(this.uLoc.uBrightness, 0);
      gl.uniform1f(this.uLoc.uContrast, 0);
      gl.uniform1f(this.uLoc.uSaturation, 0);
      gl.uniform1f(this.uLoc.uVibrance, 0);
      gl.uniform1f(this.uLoc.uTemperature, 0);
      gl.uniform1f(this.uLoc.uTint, 0);
      gl.uniform1f(this.uLoc.uVignette, 0);
      gl.uniform1f(this.uLoc.uSharpness, 0);
      gl.uniform3fv(this.uLoc.uLift, [0, 0, 0]);
      gl.uniform3fv(this.uLoc.uGamma, [0, 0, 0]);
      gl.uniform3fv(this.uLoc.uGain, [0, 0, 0]);
      gl.uniform1i(this.uLoc.uHasHsl, 0);
    } else {
      const retouchBright = (clip.retouch?.brighten ?? 0) * 0.16 + (clip.retouch?.glow ?? 0) * 0.1;
      const retouchWarm = (clip.retouch?.smoothSkin ?? 0) * 0.08;
      gl.uniform1f(this.uLoc.uExposure, cg.exposure + (adj?.exposure ?? 0) + (clip.retouch?.glow ?? 0) * 0.08);
      gl.uniform1f(this.uLoc.uBrightness, getClipPropertyAtTime(clip, 'brightness', localUs) + (adj?.brightness ?? 0) + retouchBright);
      gl.uniform1f(this.uLoc.uContrast, getClipPropertyAtTime(clip, 'contrast', localUs) + (adj?.contrast ?? 0) - (clip.retouch?.smoothSkin ?? 0) * 0.06);
      gl.uniform1f(this.uLoc.uSaturation, getClipPropertyAtTime(clip, 'saturation', localUs) + (adj?.saturation ?? 0));
      gl.uniform1f(this.uLoc.uVibrance, cg.vibrance + (adj?.vibrance ?? 0) + (clip.retouch?.smoothSkin ?? 0) * 0.08);
      gl.uniform1f(this.uLoc.uTemperature, cg.temperature + (adj?.temperature ?? 0) + retouchWarm);
      gl.uniform1f(this.uLoc.uTint, cg.tint + (adj?.tint ?? 0));
      gl.uniform1f(this.uLoc.uVignette, Math.max(cg.vignette, adj?.vignette ?? 0));
      gl.uniform1f(this.uLoc.uSharpness, Math.max(cg.sharpness, adj?.sharpness ?? 0));
      gl.uniform3fv(this.uLoc.uLift, cg.wheels.lift);
      gl.uniform3fv(this.uLoc.uGamma, cg.wheels.gamma);
      gl.uniform3fv(this.uLoc.uGain, cg.wheels.gain);

      const hslArr = this.hslScratch;
      let anyHsl = false;
      HSL_KEYS.forEach((k, idx) => {
        const entry = cg.hsl[k];
        if (entry && (entry.hue !== 0 || entry.sat !== 0 || entry.lum !== 0)) anyHsl = true;
        hslArr[idx * 3] = entry?.hue ?? 0;
        hslArr[idx * 3 + 1] = entry?.sat ?? 0;
        hslArr[idx * 3 + 2] = entry?.lum ?? 0;
      });
      gl.uniform1i(this.uLoc.uHasHsl, anyHsl ? 1 : 0);
      gl.uniform3fv(this.uLoc['uHsl[0]'], hslArr);
    }

    gl.uniform1i(this.uLoc.uChromaEnabled, clip.chromaKey.enabled ? 1 : 0);
    const ckRgb = hexToRgbNorm(clip.chromaKey.colorHex);
    gl.uniform3f(this.uLoc.uChromaColor, ckRgb[0], ckRgb[1], ckRgb[2]);
    gl.uniform1f(this.uLoc.uChromaSimilarity, clip.chromaKey.similarity);
    gl.uniform1f(this.uLoc.uChromaSmoothness, clip.chromaKey.smoothness);
    gl.uniform1f(this.uLoc.uChromaSpill, clip.chromaKey.spillSuppression);

    gl.uniform1i(this.uLoc.uMaskShape, MASK_SHAPE_INDEX[clip.mask.shape] ?? 0);
    gl.uniform2f(this.uLoc.uMaskCenter, clip.mask.centerX, clip.mask.centerY);
    gl.uniform2f(this.uLoc.uMaskSize, clip.mask.width, clip.mask.height);
    gl.uniform1f(this.uLoc.uMaskRotation, clip.mask.rotation);
    gl.uniform1f(this.uLoc.uMaskFeather, clip.mask.feather);
    gl.uniform1i(this.uLoc.uMaskInverted, clip.mask.inverted ? 1 : 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  /** Run a sequence of VFX effects using Ping-Pong FBOs from fxTexA, returning final texture containing rendered result */
  private runVfxStack(
    effects: ShaderEffectInstance[],
    timeSec: number,
    w: number,
    h: number
  ): WebGLTexture {
    const gl = this.gl;
    let readTex = this.fxTexA;
    let writeFbo = this.fxFboB;
    let writeTex = this.fxTexB;

    for (const fx of effects) {
      if (fx.enabled === false) continue;

      if (fx.customFragmentGlsl) {
        const customEntry = this.getOrCompileCustomProgram(fx.id, fx.customFragmentGlsl);
        if (!customEntry) continue;
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
        gl.viewport(0, 0, w, h);
        gl.useProgram(customEntry.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1i(customEntry.uTex, 0);
        gl.uniform1f(customEntry.uTime, timeSec * (fx.speed || 1));
        gl.uniform1f(customEntry.uInt, fx.intensity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        const vfxDef = VFX_BY_ID[fx.shaderId];
        if (!vfxDef) continue;
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.vfxProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1i(this.vfxLoc.uTexture, 0);
        gl.uniform1i(this.vfxLoc.uVfxType, vfxDef.shaderIndex);
        gl.uniform1f(this.vfxLoc.uIntensity, fx.intensity);
        gl.uniform1f(this.vfxLoc.uSpeed, fx.speed || 1);
        gl.uniform1f(this.vfxLoc.uScale, fx.scale ?? 1);
        gl.uniform1f(this.vfxLoc.uTimeSec, timeSec);
        gl.uniform2f(this.vfxLoc.uResolution, w, h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // Ping-pong swap
      const nextRead = writeTex;
      writeTex = readTex;
      readTex = nextRead;
      writeFbo = readTex === this.fxTexA ? this.fxFboB : this.fxFboA;
    }

    return readTex;
  }

  private blitTextureToTarget(tex: WebGLTexture, targetFbo: WebGLFramebuffer | null, w: number, h: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.vfxProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.vfxLoc.uTexture, 0);
    gl.uniform1i(this.vfxLoc.uVfxType, 0);
    gl.uniform1f(this.vfxLoc.uIntensity, 0);
    gl.uniform1f(this.vfxLoc.uSpeed, 1);
    gl.uniform1f(this.vfxLoc.uScale, 1);
    gl.uniform1f(this.vfxLoc.uTimeSec, 0);
    gl.uniform2f(this.vfxLoc.uResolution, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  renderFrame(
    project: Project,
    playheadUs: Microseconds,
    mediaElements: Map<string, HTMLVideoElement | HTMLImageElement>,
    maskElements: Map<string, HTMLVideoElement>,
    options?: {
      nestedScopeId?: string | null;
      forceUpload?: boolean;
      skipGlow?: boolean;
      compareSplitX?: number | null;
      previewScale?: number;
      behindOverlayCanvas?: HTMLCanvasElement | null;
    }
  ): string | null {
    const gl = this.gl;
    const pScale = options?.previewScale && options.previewScale > 0 && options.previewScale < 1 ? options.previewScale : 1;
    const w = Math.max(16, Math.round(project.settings.width * pScale) & ~1);
    const h = Math.max(16, Math.round(project.settings.height * pScale) & ~1);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ensureFbos(w, h);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.025, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const flatClips = resolveEffectiveClips(project, options?.nestedScopeId);
    const activeVisualClips = flatClips
      .filter((c) => {
        if (c.kind !== 'video' && c.kind !== 'image') return false;
        return playheadUs >= c.timelineStartUs && playheadUs < c.timelineStartUs + c.durationUs;
      })
      .sort((a, b) => (a.__effectiveTrackIndex ?? 0) - (b.__effectiveTrackIndex ?? 0));

    const activeEffectClips = flatClips.filter(
      (c) =>
        (c.kind === 'effect' || c.kind === 'adjustment') &&
        playheadUs >= c.timelineStartUs &&
        playheadUs < c.timelineStartUs + c.durationUs
    );
    const globalAdj = activeEffectClips.find((c) => c.kind === 'adjustment')?.colorGrade ?? activeEffectClips[0]?.colorGrade;
    const globalVfxStack = activeEffectClips.flatMap((c) => c.effects ?? []);
    const timeSec = playheadUs / 1_000_000;

    gl.bindVertexArray(this.vao);

    const splitPx =
      options?.compareSplitX != null
        ? Math.max(1, Math.min(w - 1, Math.round(options.compareSplitX * w)))
        : null;
    const hasBehindSandwich = Boolean(
      options?.behindOverlayCanvas &&
        activeVisualClips.some((c) => c.aiMattingEnabled && c.assetId && (maskElements.get(c.id) ?? maskElements.get(c.assetId)))
    );

    if (splitPx !== null) {
      // Left side: Raw Original (bypass Grade + LUT + VFX Stack)
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, splitPx, h);
      for (const clip of activeVisualClips) {
        const localUs = playheadUs - clip.timelineStartUs;
        this.drawGradedBaseClip(clip, localUs, w, h, mediaElements, maskElements, undefined, null, options?.forceUpload, true);
      }
      // Right side: Graded + LUT + Multi-FX GPU + Transitions
      gl.scissor(splitPx, 0, w - splitPx, h);
    }

    for (const clip of activeVisualClips) {
      const localUs = playheadUs - clip.timelineStartUs;
      const trans = clip.transitionIn && clip.transitionIn.type !== 'none' && localUs < clip.transitionIn.durationUs
        ? clip.transitionIn
        : null;
      const clipVfx = (clip.effects ?? []).filter((e) => e.enabled !== false);
      const needsClipOffscreen = Boolean(trans) || clipVfx.length > 0;

      if (!needsClipOffscreen) {
        if (splitPx !== null) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(splitPx, 0, w - splitPx, h);
        }
        this.drawGradedBaseClip(clip, localUs, w, h, mediaElements, maskElements, globalAdj, null, options?.forceUpload, false, hasBehindSandwich);
        continue;
      }

      // Render incoming clip into fxFboA WITHOUT scissor so edge convolutions (Blur/Halation) sample cleanly
      if (splitPx !== null) gl.disable(gl.SCISSOR_TEST);
      const drawn = this.drawGradedBaseClip(
        clip,
        localUs,
        w,
        h,
        mediaElements,
        maskElements,
        globalAdj,
        this.fxFboA,
        options?.forceUpload,
        false,
        hasBehindSandwich
      );
      if (!drawn) continue;

      const incomingTex = clipVfx.length > 0 ? this.runVfxStack(clipVfx, timeSec, w, h) : this.fxTexA;

      if (trans) {
        const outgoingClip = flatClips
          .filter(
            (other) =>
              other.id !== clip.id &&
              other.trackId === clip.trackId &&
              (other.kind === 'video' || other.kind === 'image') &&
              Math.abs(other.timelineStartUs + other.durationUs - clip.timelineStartUs) <= 80_000
          )
          .sort((a, b) => b.timelineStartUs - a.timelineStartUs)[0];

        if (outgoingClip) {
          this.drawGradedBaseClip(
            outgoingClip,
            outgoingClip.durationUs,
            w,
            h,
            mediaElements,
            maskElements,
            globalAdj,
            this.transFromFbo,
            options?.forceUpload
          );
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.transFromFbo);
          gl.viewport(0, 0, w, h);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }

        const transDef = TRANSITION_BY_ID[trans.type];
        const transIdx = transDef ? transDef.transIndex : 8;
        const progress = Math.min(1, Math.max(0, localUs / Math.max(1, trans.durationUs)));

        if (splitPx !== null) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(splitPx, 0, w - splitPx, h);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.transitionProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.transFromTex);
        gl.uniform1i(this.transLoc.uTexFrom, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, incomingTex);
        gl.uniform1i(this.transLoc.uTexTo, 1);
        gl.uniform1i(this.transLoc.uTransType, transIdx);
        gl.uniform1f(this.transLoc.uProgress, progress);
        gl.uniform2f(this.transLoc.uResolution, w, h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        if (splitPx !== null) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(splitPx, 0, w - splitPx, h);
        }
        this.blitTextureToTarget(incomingTex, null, w, h);
      }
    }

    // Apply timeline-wide Adjustment / Effect Track VFX stacks over the composited frame
    const activeGlobalVfx = globalVfxStack.filter((e) => e.enabled !== false);
    if (activeGlobalVfx.length > 0 && activeVisualClips.length > 0) {
      if (splitPx !== null) gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fxFboA);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      const finalGlobalTex = this.runVfxStack(activeGlobalVfx, timeSec, w, h);
      if (splitPx !== null) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(splitPx, 0, w - splitPx, h);
      }
      this.blitTextureToTarget(finalGlobalTex, null, w, h);
    }

    // Text-Behind-Subject Depth Sandwich: composite behind-subject texts + foreground matted subjects on top!
    if (options?.behindOverlayCanvas && activeVisualClips.some((c) => c.aiMattingEnabled && c.assetId && (maskElements.get(c.id) ?? maskElements.get(c.assetId)))) {
      if (!this.behindOverlayTex) {
        this.behindOverlayTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.behindOverlayTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.behindOverlayTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, options.behindOverlayCanvas);
      this.blitTextureToTarget(this.behindOverlayTex, null, w, h);

      for (const clip of activeVisualClips) {
        if (!clip.aiMattingEnabled) continue;
        const localUs = playheadUs - clip.timelineStartUs;
        this.drawGradedBaseClip(clip, localUs, w, h, mediaElements, maskElements, globalAdj, null, options?.forceUpload, false, false);
      }
    }

    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);

    if (!options?.skipGlow && project.settings.ambientGlow && activeVisualClips.length > 0) {
      const now = performance.now();
      if (now - this.lastGlowSampleAt >= 250) {
        this.lastGlowSampleAt = now;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.glowFbo);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, 4, 4, gl.COLOR_BUFFER_BIT, gl.LINEAR);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo);
        gl.readPixels(1, 1, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, this.glowProbe);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const r = Math.round((this.glowProbe[0] + this.glowProbe[4] + this.glowProbe[8] + this.glowProbe[12]) / 4);
        const g = Math.round((this.glowProbe[1] + this.glowProbe[5] + this.glowProbe[9] + this.glowProbe[13]) / 4);
        const b = Math.round((this.glowProbe[2] + this.glowProbe[6] + this.glowProbe[10] + this.glowProbe[14]) / 4);
        this.cachedGlowCss = `rgba(${r}, ${g}, ${b}, 0.32)`;
      }
      return this.cachedGlowCss;
    }
    return null;
  }

  samplePixelHex(normX: number, normY: number): string {
    const gl = this.gl;
    const x = Math.min(this.canvas.width - 1, Math.max(0, Math.round(normX * this.canvas.width)));
    const y = Math.min(this.canvas.height - 1, Math.max(0, Math.round((1 - normY) * this.canvas.height)));
    const px = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(px[0])}${toHex(px[1])}${toHex(px[2])}`;
  }

  dispose(): void {
    const gl = this.gl;
    this.clipTextures.forEach((t) => gl.deleteTexture(t));
    this.clipTextures.clear();
    this.lutTextures.forEach((e) => gl.deleteTexture(e.tex));
    this.lutTextures.clear();
    this.customPrograms.forEach((p) => gl.deleteProgram(p.program));
    this.customPrograms.clear();
    if (this.behindOverlayTex) gl.deleteTexture(this.behindOverlayTex);
    gl.deleteTexture(this.curvesTexture);
    gl.deleteTexture(this.backTexture);
    gl.deleteTexture(this.fxTexA);
    gl.deleteTexture(this.fxTexB);
    gl.deleteTexture(this.transFromTex);
    gl.deleteTexture(this.glowTexture);
    gl.deleteFramebuffer(this.backFbo);
    gl.deleteFramebuffer(this.fxFboA);
    gl.deleteFramebuffer(this.fxFboB);
    gl.deleteFramebuffer(this.transFromFbo);
    gl.deleteFramebuffer(this.glowFbo);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    gl.deleteProgram(this.vfxProgram);
    gl.deleteProgram(this.transitionProgram);
  }
}
