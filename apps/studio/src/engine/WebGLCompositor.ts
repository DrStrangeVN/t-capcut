import {
  getClipPropertyAtTime,
  type BlendMode,
  type Clip,
  type ColorGradeState,
  type Microseconds,
  type Project,
} from '@t-capcut/schema';

export interface LoadedLutTexture {
  id: string;
  title: string;
  size: number;
  data: Float32Array;
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

out vec2 vUv;
out vec2 vScreenUv;

void main() {
  float aspectSrc = uSrcResolution.x / max(1.0, uSrcResolution.y);
  float aspectOut = uResolution.x / max(1.0, uResolution.y);
  vec2 fit = aspectSrc > aspectOut
    ? vec2(1.0, aspectOut / aspectSrc)
    : vec2(aspectSrc / aspectOut, 1.0);

  vec2 local = aPos * fit * uScale * uFlip;
  float c = cos(uRotationRad);
  float s = sin(uRotationRad);
  vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 pos = rotated + vec2(uTranslate.x, -uTranslate.y);
  gl_Position = vec4(pos, 0.0, 1.0);
  vUv = aUv;
  vScreenUv = pos * 0.5 + 0.5;
}`;

const FRAGMENT_SHADER = `#version 300 es
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

// Color Grading
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

// 8-Channel HSL: [hue, sat, lum] for Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta
uniform vec3 uHsl[8];
uniform int uHasHsl;

// Chroma Key
uniform int uChromaEnabled;
uniform vec3 uChromaColor;
uniform float uChromaSimilarity;
uniform float uChromaSmoothness;
uniform float uChromaSpill;

// Geometric Mask
uniform int uMaskShape; // 0 none, 1 linear, 2 mirror, 3 circle, 4 rect, 5 heart, 6 star
uniform vec2 uMaskCenter;
uniform vec2 uMaskSize;
uniform float uMaskRotation;
uniform float uMaskFeather;
uniform int uMaskInverted;

// VFX / Transition: 0 none, 1 glitch, 2 chromatic, 3 vhs, 4 zoom_blur, 5 dreamy, 6 film_burn, 7 wipe_left, 8 wipe_right, 9 spin
uniform int uEffectType;
uniform float uEffectIntensity;
uniform float uTimeSec;

vec3 rgb2hsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  float s = 0.0;
  float h = 0.0;
  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
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

vec3 applyLut3D(vec3 color, float N) {
  vec3 c = clamp(color, 0.0, 1.0);
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
  float wipeAlpha = 1.0;

  if (uEffectType == 7 && uv.x < uEffectIntensity) {
    wipeAlpha = smoothstep(uEffectIntensity - 0.04, uEffectIntensity, uv.x);
  } else if (uEffectType == 8 && (1.0 - uv.x) < uEffectIntensity) {
    wipeAlpha = smoothstep(uEffectIntensity - 0.04, uEffectIntensity, 1.0 - uv.x);
  } else if (uEffectType == 9 && uEffectIntensity > 0.001) {
    vec2 d = uv - 0.5;
    float ang = uEffectIntensity * 3.14159 * 0.75;
    float cs = cos(ang);
    float sn = sin(ang);
    uv = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs) + 0.5;
  }

  vec4 texel;
  if (uEffectType == 1 && uEffectIntensity > 0.001) {
    float row = floor(uv.y * 28.0);
    float jitter = (fract(sin(row * 78.233 + floor(uTimeSec * 24.0)) * 43758.5453) - 0.5) * 0.06 * uEffectIntensity;
    float shift = 0.014 * uEffectIntensity;
    texel = vec4(
      texture(uTexture, uv + vec2(jitter + shift, 0.0)).r,
      texture(uTexture, uv + vec2(jitter, 0.0)).g,
      texture(uTexture, uv + vec2(jitter - shift, 0.0)).b,
      texture(uTexture, uv).a
    );
  } else if (uEffectType == 2 && uEffectIntensity > 0.001) {
    vec2 dir = (uv - 0.5) * 0.025 * uEffectIntensity;
    texel = vec4(
      texture(uTexture, uv + dir).r,
      texture(uTexture, uv).g,
      texture(uTexture, uv - dir).b,
      texture(uTexture, uv).a
    );
  } else if (uEffectType == 3 && uEffectIntensity > 0.001) {
    float scan = sin(uv.y * 420.0 + uTimeSec * 8.0) * 0.04 * uEffectIntensity;
    vec2 wobble = vec2(sin(uv.y * 22.0 + uTimeSec * 12.0) * 0.004 * uEffectIntensity, 0.0);
    texel = texture(uTexture, uv + wobble);
    texel.rgb -= scan;
  } else if (uEffectType == 4 && uEffectIntensity > 0.001) {
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 6; i++) {
      float f = float(i) / 5.0 * 0.04 * uEffectIntensity;
      acc += texture(uTexture, mix(uv, vec2(0.5), f));
    }
    texel = acc / 6.0;
  } else if (uEffectType == 5 && uEffectIntensity > 0.001) {
    vec4 base = texture(uTexture, uv);
    vec4 blur = (
      texture(uTexture, uv + vec2(0.006, 0.006)) +
      texture(uTexture, uv + vec2(-0.006, 0.006)) +
      texture(uTexture, uv + vec2(0.006, -0.006)) +
      texture(uTexture, uv + vec2(-0.006, -0.006))
    ) * 0.25;
    texel = vec4(mix(base.rgb, 1.0 - (1.0 - base.rgb) * (1.0 - blur.rgb), uEffectIntensity * 0.8), base.a);
  } else if (uEffectType == 6 && uEffectIntensity > 0.001) {
    texel = texture(uTexture, uv);
    float burn = smoothstep(0.2, 0.95, 1.0 - length(uv - vec2(0.2, 0.8))) * uEffectIntensity;
    texel.rgb += vec3(1.0, 0.42, 0.12) * burn * 0.85;
  } else {
    texel = texture(uTexture, uv);
  }

  vec3 col = texel.rgb;
  if (uSharpness > 0.001) {
    vec3 blurN = (
      texture(uTexture, uv + vec2(uSrcTexel.x, 0.0)).rgb +
      texture(uTexture, uv - vec2(uSrcTexel.x, 0.0)).rgb +
      texture(uTexture, uv + vec2(0.0, uSrcTexel.y)).rgb +
      texture(uTexture, uv - vec2(0.0, uSrcTexel.y)).rgb
    ) * 0.25;
    col = clamp(col + (col - blurN) * uSharpness * 1.6, 0.0, 1.0);
  }

  float alpha = texel.a * uOpacity * wipeAlpha;

  if (uHasMattingMask == 1) {
    float mAlpha = texture(uMaskTexture, uv).r;
    alpha *= smoothstep(0.15, 0.85, mAlpha);
  }

  if (uChromaEnabled == 1) {
    float dist = distance(col, uChromaColor);
    float keyAlpha = smoothstep(uChromaSimilarity, uChromaSimilarity + max(0.01, uChromaSmoothness), dist);
    alpha *= keyAlpha;
    if (uChromaSpill > 0.0) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum), (1.0 - keyAlpha) * uChromaSpill);
    }
  }

  if (uMaskShape != 0) {
    vec2 p = uv - uMaskCenter;
    float mr = radians(uMaskRotation);
    float mc = cos(mr);
    float ms = sin(mr);
    p = vec2(p.x * mc - p.y * ms, p.x * ms + p.y * mc);
    float d = 0.0;
    if (uMaskShape == 1) d = p.y;
    else if (uMaskShape == 2) d = abs(p.y) - uMaskSize.y * 0.5;
    else if (uMaskShape == 3) d = sdCircle(p, uMaskSize * 0.5);
    else d = sdBox(p, uMaskSize * 0.5);

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
      // Map hue [0..1] across 8 color centers
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

const EFFECT_INDEX: Record<string, number> = {
  none: 0,
  glitch: 1,
  chromatic: 2,
  vhs: 3,
  zoom_blur: 4,
  dreamy: 5,
  film_burn: 6,
  wipe_left: 7,
  wipe_right: 8,
  spin: 9,
};

const HSL_KEYS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;

function hexToRgbNorm(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  if (c.length < 6) return [0, 1, 0];
  return [
    Number.parseInt(c.slice(0, 2), 16) / 255,
    Number.parseInt(c.slice(2, 4), 16) / 255,
    Number.parseInt(c.slice(4, 6), 16) / 255,
  ];
}

function sampleCurvePoints(pts: [number, number][], x: number): number {
  if (!pts || pts.length === 0) return x;
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
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

export class WebGLCompositor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private customPrograms = new Map<string, { src: string; program: WebGLProgram }>();
  private vao: WebGLVertexArrayObject;
  private assetTextures = new Map<string, WebGLTexture>();
  private lutTextures = new Map<string, { tex: WebGLTexture; size: number }>();
  private curvesTexture: WebGLTexture;
  private backTexture: WebGLTexture;
  private backFbo: WebGLFramebuffer;
  private fboW = 0;
  private fboH = 0;
  private pixelProbe = new Uint8Array(4);

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error('WebGL2 unavailable on this device');
    }
    this.gl = gl;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(this.program)}`);
    }

    const quad = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
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
  }

  private getOrCompileCustomProgram(id: string, bodyGlsl: string): WebGLProgram | null {
    const cached = this.customPrograms.get(id);
    if (cached && cached.src === bodyGlsl) return cached.program;
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
      const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, wrappedFs);
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      this.customPrograms.set(id, { src: bodyGlsl, program: prog });
      return prog;
    } catch {
      return null;
    }
  }

  private ensureBackBuffer(w: number, h: number): void {
    const gl = this.gl;
    if (this.fboW === w && this.fboH === h) return;
    this.fboW = w;
    this.fboH = h;
    gl.bindTexture(gl.TEXTURE_2D, this.backTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.backFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.backTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private uploadCurves(curves: ColorGradeState['curves']): boolean {
    const isIdentity = (pts: [number, number][]) =>
      pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1;
    if (isIdentity(curves.master) && isIdentity(curves.red) && isIdentity(curves.green) && isIdentity(curves.blue)) {
      return false;
    }
    const row = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      const m = sampleCurvePoints(curves.master, x);
      row[i * 4] = Math.round(Math.min(1, Math.max(0, sampleCurvePoints(curves.red, m))) * 255);
      row[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, sampleCurvePoints(curves.green, m))) * 255);
      row[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, sampleCurvePoints(curves.blue, m))) * 255);
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

  private getOrUpdateTexture(key: string, source: HTMLVideoElement | HTMLImageElement): WebGLTexture {
    const gl = this.gl;
    let tex = this.assetTextures.get(key);
    if (!tex) {
      tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.assetTextures.set(key, tex);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return tex;
  }

  renderFrame(
    project: Project,
    playheadUs: Microseconds,
    mediaElements: Map<string, HTMLVideoElement | HTMLImageElement>,
    maskElements: Map<string, HTMLVideoElement>
  ): string | null {
    const gl = this.gl;
    const w = project.settings.width;
    const h = project.settings.height;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ensureBackBuffer(w, h);

    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.025, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const activeVisualClips = Object.values(project.clips)
      .filter((c) => {
        if (c.disabled || (c.kind !== 'video' && c.kind !== 'image')) return false;
        const track = project.tracks.find((t) => t.id === c.trackId);
        if (track?.hidden) return false;
        return playheadUs >= c.timelineStartUs && playheadUs < c.timelineStartUs + c.durationUs;
      })
      .sort((a, b) => {
        const ta = project.tracks.find((t) => t.id === a.trackId)?.index ?? 0;
        const tb = project.tracks.find((t) => t.id === b.trackId)?.index ?? 0;
        return ta - tb;
      });

    const activeEffectClip = Object.values(project.clips).find(
      (c) =>
        !c.disabled &&
        (c.kind === 'effect' || c.kind === 'adjustment') &&
        playheadUs >= c.timelineStartUs &&
        playheadUs < c.timelineStartUs + c.durationUs
    );

    gl.bindVertexArray(this.vao);

    for (const clip of activeVisualClips) {
      if (!clip.assetId) continue;
      const el = mediaElements.get(clip.assetId);
      if (!el) continue;
      const srcW = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
      const srcH = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
      if (!srcW || !srcH) continue;

      const localUs = playheadUs - clip.timelineStartUs;
      const tex = this.getOrUpdateTexture(clip.assetId, el);
      const primaryFx = clip.effects[0] ?? activeEffectClip?.effects[0];

      // Custom GLSL Plugin Path if user attached a custom shader
      if (primaryFx?.customFragmentGlsl) {
        const customProg = this.getOrCompileCustomProgram(primaryFx.id, primaryFx.customFragmentGlsl);
        if (customProg) {
          gl.useProgram(customProg);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(gl.getUniformLocation(customProg, 'uTexture'), 0);
          gl.uniform2f(gl.getUniformLocation(customProg, 'uResolution'), w, h);
          gl.uniform2f(gl.getUniformLocation(customProg, 'uSrcResolution'), srcW, srcH);
          gl.uniform2f(gl.getUniformLocation(customProg, 'uTranslate'), clip.transform.x, clip.transform.y);
          gl.uniform2f(gl.getUniformLocation(customProg, 'uScale'), clip.transform.scaleX, clip.transform.scaleY);
          gl.uniform1f(gl.getUniformLocation(customProg, 'uRotationRad'), (clip.transform.rotation * Math.PI) / 180);
          gl.uniform2f(gl.getUniformLocation(customProg, 'uFlip'), clip.transform.flipH ? -1 : 1, clip.transform.flipV ? -1 : 1);
          gl.uniform1f(gl.getUniformLocation(customProg, 'uTimeSec'), playheadUs / 1_000_000);
          gl.uniform1f(gl.getUniformLocation(customProg, 'uEffectIntensity'), primaryFx.intensity);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          continue;
        }
      }

      gl.useProgram(this.program);

      if (clip.transform.blendMode !== 'normal') {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.backFbo);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(this.program, 'uTexture'), 0);

      const maskEl = clip.aiMattingEnabled ? maskElements.get(clip.assetId) : undefined;
      if (maskEl && maskEl.videoWidth > 0) {
        const mTex = this.getOrUpdateTexture(`${clip.assetId}_mask`, maskEl);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mTex);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uMaskTexture'), 1);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uHasMattingMask'), 1);
      } else {
        gl.uniform1i(gl.getUniformLocation(this.program, 'uHasMattingMask'), 0);
      }

      const lutEntry = clip.colorGrade.lutId ? this.lutTextures.get(clip.colorGrade.lutId) : undefined;
      if (lutEntry) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, lutEntry.tex);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uLutTexture'), 2);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uHasLut'), 1);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uLutSize'), lutEntry.size);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uLutIntensity'), clip.colorGrade.lutIntensity);
      } else {
        gl.uniform1i(gl.getUniformLocation(this.program, 'uHasLut'), 0);
      }

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.backTexture);
      gl.uniform1i(gl.getUniformLocation(this.program, 'uBackBuffer'), 3);

      const hasCurves = this.uploadCurves(clip.colorGrade.curves);
      gl.uniform1i(gl.getUniformLocation(this.program, 'uCurvesTexture'), 4);
      gl.uniform1i(gl.getUniformLocation(this.program, 'uHasCurves'), hasCurves ? 1 : 0);

      const x = getClipPropertyAtTime(clip, 'x', localUs);
      const y = getClipPropertyAtTime(clip, 'y', localUs);
      const scaleX = getClipPropertyAtTime(clip, 'scaleX', localUs);
      const scaleY = getClipPropertyAtTime(clip, 'scaleY', localUs);
      const rot = getClipPropertyAtTime(clip, 'rotation', localUs);
      let opacity = getClipPropertyAtTime(clip, 'opacity', localUs);

      if (clip.transitionIn && clip.transitionIn.type === 'dissolve' && localUs < clip.transitionIn.durationUs) {
        opacity *= localUs / Math.max(1, clip.transitionIn.durationUs);
      }

      gl.uniform2f(gl.getUniformLocation(this.program, 'uResolution'), w, h);
      gl.uniform2f(gl.getUniformLocation(this.program, 'uSrcResolution'), srcW, srcH);
      gl.uniform2f(gl.getUniformLocation(this.program, 'uSrcTexel'), 1 / srcW, 1 / srcH);
      gl.uniform2f(gl.getUniformLocation(this.program, 'uTranslate'), x, y);
      gl.uniform2f(gl.getUniformLocation(this.program, 'uScale'), scaleX, scaleY);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uRotationRad'), (rot * Math.PI) / 180);
      gl.uniform2f(
        gl.getUniformLocation(this.program, 'uFlip'),
        clip.transform.flipH ? -1 : 1,
        clip.transform.flipV ? -1 : 1
      );
      gl.uniform1f(gl.getUniformLocation(this.program, 'uOpacity'), opacity);
      gl.uniform4f(
        gl.getUniformLocation(this.program, 'uCrop'),
        clip.transform.cropLeft,
        clip.transform.cropRight,
        clip.transform.cropTop,
        clip.transform.cropBottom
      );
      gl.uniform1i(
        gl.getUniformLocation(this.program, 'uBlendMode'),
        BLEND_MODE_INDEX[clip.transform.blendMode] ?? 0
      );

      const adj = activeEffectClip?.colorGrade;
      const cg = clip.colorGrade;
      gl.uniform1f(gl.getUniformLocation(this.program, 'uExposure'), cg.exposure + (adj?.exposure ?? 0));
      gl.uniform1f(
        gl.getUniformLocation(this.program, 'uBrightness'),
        getClipPropertyAtTime(clip, 'brightness', localUs) + (adj?.brightness ?? 0)
      );
      gl.uniform1f(
        gl.getUniformLocation(this.program, 'uContrast'),
        getClipPropertyAtTime(clip, 'contrast', localUs) + (adj?.contrast ?? 0)
      );
      gl.uniform1f(
        gl.getUniformLocation(this.program, 'uSaturation'),
        getClipPropertyAtTime(clip, 'saturation', localUs) + (adj?.saturation ?? 0)
      );
      gl.uniform1f(gl.getUniformLocation(this.program, 'uVibrance'), cg.vibrance + (adj?.vibrance ?? 0));
      gl.uniform1f(gl.getUniformLocation(this.program, 'uTemperature'), cg.temperature + (adj?.temperature ?? 0));
      gl.uniform1f(gl.getUniformLocation(this.program, 'uTint'), cg.tint + (adj?.tint ?? 0));
      gl.uniform1f(gl.getUniformLocation(this.program, 'uVignette'), Math.max(cg.vignette, adj?.vignette ?? 0));
      gl.uniform1f(gl.getUniformLocation(this.program, 'uSharpness'), Math.max(cg.sharpness, adj?.sharpness ?? 0));
      gl.uniform3fv(gl.getUniformLocation(this.program, 'uLift'), cg.wheels.lift);
      gl.uniform3fv(gl.getUniformLocation(this.program, 'uGamma'), cg.wheels.gamma);
      gl.uniform3fv(gl.getUniformLocation(this.program, 'uGain'), cg.wheels.gain);

      // 8-Channel HSL
      const hslArr = new Float32Array(24);
      let anyHsl = false;
      HSL_KEYS.forEach((k, idx) => {
        const entry = cg.hsl[k];
        if (entry && (entry.hue !== 0 || entry.sat !== 0 || entry.lum !== 0)) anyHsl = true;
        hslArr[idx * 3] = entry?.hue ?? 0;
        hslArr[idx * 3 + 1] = entry?.sat ?? 0;
        hslArr[idx * 3 + 2] = entry?.lum ?? 0;
      });
      gl.uniform1i(gl.getUniformLocation(this.program, 'uHasHsl'), anyHsl ? 1 : 0);
      gl.uniform3fv(gl.getUniformLocation(this.program, 'uHsl[0]'), hslArr);

      // Chroma key
      gl.uniform1i(gl.getUniformLocation(this.program, 'uChromaEnabled'), clip.chromaKey.enabled ? 1 : 0);
      const ckRgb = hexToRgbNorm(clip.chromaKey.colorHex);
      gl.uniform3f(gl.getUniformLocation(this.program, 'uChromaColor'), ckRgb[0], ckRgb[1], ckRgb[2]);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uChromaSimilarity'), clip.chromaKey.similarity);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uChromaSmoothness'), clip.chromaKey.smoothness);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uChromaSpill'), clip.chromaKey.spillSuppression);

      // Mask
      const shapeMap: Record<Clip['mask']['shape'], number> = {
        none: 0,
        linear: 1,
        mirror: 2,
        circle: 3,
        rectangle: 4,
        heart: 3,
        star: 4,
      };
      gl.uniform1i(gl.getUniformLocation(this.program, 'uMaskShape'), shapeMap[clip.mask.shape] ?? 0);
      gl.uniform2f(gl.getUniformLocation(this.program, 'uMaskCenter'), clip.mask.centerX, clip.mask.centerY);
      gl.uniform2f(gl.getUniformLocation(this.program, 'uMaskSize'), clip.mask.width, clip.mask.height);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uMaskRotation'), clip.mask.rotation);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uMaskFeather'), clip.mask.feather);
      gl.uniform1i(gl.getUniformLocation(this.program, 'uMaskInverted'), clip.mask.inverted ? 1 : 0);

      let fxType = primaryFx ? EFFECT_INDEX[primaryFx.shaderId] ?? 0 : 0;
      let fxIntensity = primaryFx ? primaryFx.intensity : 0;
      if (clip.transitionIn && clip.transitionIn.type !== 'none' && clip.transitionIn.type !== 'dissolve') {
        if (localUs < clip.transitionIn.durationUs) {
          const p = 1 - localUs / Math.max(1, clip.transitionIn.durationUs);
          fxType = EFFECT_INDEX[clip.transitionIn.type] ?? 1;
          fxIntensity = Math.max(fxIntensity, p);
        }
      }
      gl.uniform1i(gl.getUniformLocation(this.program, 'uEffectType'), fxType);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uEffectIntensity'), fxIntensity);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uTimeSec'), playheadUs / 1_000_000);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.bindVertexArray(null);

    if (project.settings.ambientGlow && activeVisualClips.length > 0) {
      gl.readPixels(Math.floor(w * 0.5), Math.floor(h * 0.5), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixelProbe);
      return `rgba(${this.pixelProbe[0]}, ${this.pixelProbe[1]}, ${this.pixelProbe[2]}, 0.32)`;
    }
    return null;
  }
}
