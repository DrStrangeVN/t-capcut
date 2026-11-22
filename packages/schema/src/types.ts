/** Microseconds (1_000_000 = 1 second), matching CapCut draft precision */
export type Microseconds = number;

export const US_PER_SEC = 1_000_000;

export type AspectRatioPreset =
  | '16:9'
  | '9:16'
  | '1:1'
  | '4:3'
  | '3:4'
  | '2.35:1'
  | '2:1'
  | '1.85:1'
  | 'custom';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft_light'
  | 'hard_light'
  | 'color_dodge'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'add'
  | 'exclusion';

export type TrackType = 'video' | 'overlay' | 'audio' | 'text' | 'effect' | 'adjustment';

export type ClipKind = 'video' | 'image' | 'audio' | 'text' | 'sticker' | 'effect' | 'adjustment' | 'compound';

export type MaskShape = 'none' | 'linear' | 'mirror' | 'circle' | 'rectangle' | 'heart' | 'star';

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'video' | 'audio' | 'image';
  sourcePath: string;
  proxyPath?: string | null;
  mattingMaskPath?: string | null;
  waveformPath?: string | null;
  thumbnailStripPath?: string | null;
  filmstripCols?: number;
  objectMaskPath?: string | null;
  stabilizedPath?: string | null;
  upscaledPath?: string | null;
  durationUs: Microseconds;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  codecVideo?: string;
  codecAudio?: string;
  colorSpace?: 'sdr-709' | 'hdr-hlg' | 'hdr-pq';
  fileSizeBytes: number;
  createdAt: number;
  proxyStatus: 'none' | 'generating' | 'ready' | 'failed';
  beatsUs?: Microseconds[];
  scenesUs?: Microseconds[];
  transcript?: TranscriptSegment[];
}

export interface WordTimestamp {
  text: string;
  startUs: Microseconds;
  endUs: Microseconds;
  confidence?: number;
}

export interface TranscriptSegment {
  id: string;
  startUs: Microseconds;
  endUs: Microseconds;
  text: string;
  words: WordTimestamp[];
  speaker?: string;
  isSilence?: boolean;
}

export interface KeyframePoint {
  id: string;
  timeUs: Microseconds; // Relative to clip start
  value: number;
  easing: [number, number, number, number]; // Cubic bezier [x1, y1, x2, y2]
}

export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity'
  | 'volume'
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'maskScale';

export type KeyframeMap = Partial<Record<AnimatableProperty, KeyframePoint[]>>;

export interface TransformState {
  x: number; // Normalized -1..1 or canvas pixels relative to center
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // Degrees
  opacity: number; // 0..1
  anchorX: number; // 0..1
  anchorY: number; // 0..1
  flipH: boolean;
  flipV: boolean;
  cropLeft: number; // 0..1
  cropRight: number;
  cropTop: number;
  cropBottom: number;
  blendMode: BlendMode;
  fillMode?: 'fit' | 'cover';
}

export interface ColorWheelValues {
  lift: [number, number, number]; // R, G, B offsets -1..1
  gamma: [number, number, number];
  gain: [number, number, number];
}

export interface ColorGradeState {
  exposure: number; // -1..1
  brightness: number; // -1..1
  contrast: number; // -1..1
  saturation: number; // -1..1
  vibrance: number; // -1..1
  temperature: number; // -1..1
  tint: number; // -1..1
  highlights: number; // -1..1
  shadows: number; // -1..1
  sharpness: number; // 0..1
  vignette: number; // 0..1
  lutId?: string | null;
  lutName?: string | null;
  lutIntensity: number; // 0..1
  wheels: ColorWheelValues;
  curves: {
    master: [number, number][]; // normalized 0..1 points
    red: [number, number][];
    green: [number, number][];
    blue: [number, number][];
  };
  hsl: Record<string, { hue: number; sat: number; lum: number }>;
}

export interface ChromaKeyState {
  enabled: boolean;
  colorHex: string;
  similarity: number; // 0..1
  smoothness: number; // 0..1
  spillSuppression: number; // 0..1
}

export interface MaskState {
  shape: MaskShape;
  centerX: number; // 0..1
  centerY: number; // 0..1
  width: number; // 0..1
  height: number; // 0..1
  rotation: number; // degrees
  feather: number; // 0..1
  roundness: number; // 0..1
  inverted: boolean;
}

export interface SpeedCurvePoint {
  position: number; // 0..1 normalized source progress
  speed: number; // 0.1..10x
}

export interface SpeedState {
  mode: 'uniform' | 'curve';
  rate: number; // 0.1..16
  pitchPreserved: boolean;
  reverse: boolean;
  presetName?: 'custom' | 'montage' | 'hero' | 'bullet' | 'jump_cut' | 'flash_in' | 'flash_out';
  curvePoints: SpeedCurvePoint[];
}

export interface TextStyleState {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  backgroundColor: string;
  backgroundRadius: number;
  backgroundPadding: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  karaokeEnabled: boolean;
  karaokeActiveColor: string;
  karaokePreset:
    | 'none'
    | 'capcut-yellow'
    | 'hormozi-pop'
    | 'classic-pill'
    | 'liquid-glass'
    | 'sweep-fill'
    | 'neon-cyber'
    | 'minimal-podcast'
    | 'comic-punch'
    | 'doc-serif'
    | 'neon-cyan'
    | 'pop-bounce'
    | 'word-highlight';
  words?: WordTimestamp[];
  animationIn?:
    | 'none'
    | 'fade'
    | 'pop'
    | 'typewriter'
    | 'slide-up'
    | 'slide-down'
    | 'slide-left'
    | 'slide-right'
    | 'blur-in'
    | 'glitch'
    | 'zoom-slam';
  animationOut?: 'none' | 'fade' | 'pop' | 'slide-down' | 'zoom-out';
  animationLoop?: 'none' | 'float' | 'pulse' | 'neon-flicker' | 'wave' | 'shake';
  animationDurationUs?: Microseconds;
  badgeText?: string;
  roleLabel?: string;
  behindSubject?: boolean;
  highlightKeywords?: string[];
  highlightColor?: string;
}

export interface StickerState {
  presetId: string;
  category: 'creator' | 'particle' | 'badge' | 'lottie';
  name: string;
  label?: string;
  primaryColor: string;
  secondaryColor: string;
  particleType?: 'snow' | 'rain' | 'dust' | 'hearts' | 'confetti' | 'bokeh' | null;
  iconType?: string;
  lottieJson?: string | null;
  lottieDurationSec?: number;
}

export interface TransitionConfig {
  id: string;
  name: string;
  type: string; // e.g. dissolve, whip_left, zoom_in, film_burn, iris_circle, glitch, etc.
  durationUs: Microseconds;
  easing?: 'linear' | 'easeInOut' | 'expoOut';
  customFragmentShader?: string;
}

export interface ShaderEffectInstance {
  id: string;
  name: string;
  shaderId: string;
  intensity: number; // 0..1
  speed: number; // 0..3
  scale?: number; // 0.2..3
  enabled?: boolean;
  customFragmentGlsl?: string;
}

export interface AudioClipState {
  volume: number; // 0..2 (1 = 0dB)
  pan: number; // -1..1
  fadeInUs: Microseconds;
  fadeOutUs: Microseconds;
  muted: boolean;
  denoise: boolean;
  denoiseStrength: number; // 0..1
  autoDucking: boolean;
  duckAmountDb: number; // e.g. -14
  voicePreset: 'none' | 'podcast' | 'megaphone' | 'deep' | 'chipmunk' | 'robot';
  eqBands?: [number, number, number, number, number]; // dB at 80Hz, 250Hz, 1kHz, 4kHz, 12kHz (-12..+12)
  compressorEnabled?: boolean;
  noiseGateEnabled?: boolean;
  pitchSemitones?: number; // -12..+12
}

export interface MotionTrackPoint {
  timeUs: Microseconds; // Relative to clip start
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  scale?: number;
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string | null; // null for text / adjustment / effect / compound
  kind: ClipKind;
  name: string;
  timelineStartUs: Microseconds;
  durationUs: Microseconds;
  sourceStartUs: Microseconds;
  sourceDurationUs: Microseconds;
  locked: boolean;
  disabled: boolean;
  transform: TransformState;
  colorGrade: ColorGradeState;
  chromaKey: ChromaKeyState;
  mask: MaskState;
  speed: SpeedState;
  audio: AudioClipState;
  keyframes: KeyframeMap;
  text?: TextStyleState;
  sticker?: StickerState;
  transitionIn?: TransitionConfig | null;
  effects: ShaderEffectInstance[];
  aiMattingEnabled: boolean;
  autoReframeEnabled: boolean;
  prerenderHash?: string | null;
  compoundTimelineId?: string | null;
  motionTrackPoints?: MotionTrackPoint[];
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  index: number;
  isMain: boolean;
  magnetic: boolean;
  muted: boolean;
  solo: boolean;
  hidden: boolean;
  locked: boolean;
  volume: number;
}

export interface TimelineMarker {
  id: string;
  timeUs: Microseconds;
  label: string;
  color: string;
  kind: 'user' | 'beat' | 'scene' | 'silence';
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  aspectRatio: AspectRatioPreset;
  sampleRate: number;
  coloristMode: boolean;
  ambientGlow: boolean;
  proxyEnabled: boolean;
  prerenderEnabled: boolean;
  loudnessTargetLufs: number;
  previewScale?: 1 | 0.5 | 0.25;
}

export interface SavedLutAsset {
  id: string;
  title: string;
  size: number;
  filePath?: string | null;
  cubeContent?: string | null;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  assets: Record<string, MediaAsset>;
  luts?: Record<string, SavedLutAsset>;
  tracks: Track[];
  clips: Record<string, Clip>;
  markers: TimelineMarker[];
  nestedTimelines?: Record<string, { id: string; name: string; tracks: Track[]; clips: Record<string, Clip> }>;
  inPointUs?: Microseconds | null;
  outPointUs?: Microseconds | null;
}

export interface CommandEntry {
  id: string;
  projectId: string;
  parentId: string | null;
  label: string;
  timestamp: number;
  forwardPatch: unknown;
  inversePatch: unknown;
}

export interface ChatCutDiffOp {
  op:
    | 'split'
    | 'delete'
    | 'trim'
    | 'add_caption'
    | 'apply_color'
    | 'apply_transform'
    | 'apply_audio'
    | 'set_speed'
    | 'add_effect'
    | 'add_marker'
    | 'set_aspect'
    | 'apply_template'
    | 'add_transition'
    | 'add_sticker'
    | 'add_music'
    | 'beat_cut'
    | 'apply_lut'
    | 'reframe_face'
    | 'text_behind_subject'
    | 'voiceover_tts'
    | 'remove_fillers';
  description: string;
  targetClipId?: string;
  timeUs?: Microseconds;
  durationUs?: Microseconds;
  payload?: Record<string, unknown>;
}

export interface ChatCutPlan {
  id: string;
  prompt: string;
  summary: string;
  ops: ChatCutDiffOp[];
  estimatedTimeSavedSec?: number;
}

export function createDefaultTransform(): TransformState {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
    flipH: false,
    flipV: false,
    cropLeft: 0,
    cropRight: 0,
    cropTop: 0,
    cropBottom: 0,
    blendMode: 'normal',
  };
}

export function createDefaultColorGrade(): ColorGradeState {
  return {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    vibrance: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    sharpness: 0,
    vignette: 0,
    lutId: null,
    lutName: null,
    lutIntensity: 1,
    wheels: {
      lift: [0, 0, 0],
      gamma: [0, 0, 0],
      gain: [0, 0, 0],
    },
    curves: {
      master: [
        [0, 0],
        [1, 1],
      ],
      red: [
        [0, 0],
        [1, 1],
      ],
      green: [
        [0, 0],
        [1, 1],
      ],
      blue: [
        [0, 0],
        [1, 1],
      ],
    },
    hsl: {
      red: { hue: 0, sat: 0, lum: 0 },
      orange: { hue: 0, sat: 0, lum: 0 },
      yellow: { hue: 0, sat: 0, lum: 0 },
      green: { hue: 0, sat: 0, lum: 0 },
      aqua: { hue: 0, sat: 0, lum: 0 },
      blue: { hue: 0, sat: 0, lum: 0 },
      purple: { hue: 0, sat: 0, lum: 0 },
      magenta: { hue: 0, sat: 0, lum: 0 },
    },
  };
}

export function createDefaultChromaKey(): ChromaKeyState {
  return {
    enabled: false,
    colorHex: '#00ff00',
    similarity: 0.25,
    smoothness: 0.1,
    spillSuppression: 0.3,
  };
}

export function createDefaultMask(): MaskState {
  return {
    shape: 'none',
    centerX: 0.5,
    centerY: 0.5,
    width: 0.6,
    height: 0.6,
    rotation: 0,
    feather: 0.05,
    roundness: 0.05,
    inverted: false,
  };
}

export function createDefaultSpeed(): SpeedState {
  return {
    mode: 'uniform',
    rate: 1,
    pitchPreserved: true,
    reverse: false,
    presetName: 'custom',
    curvePoints: [
      { position: 0, speed: 1 },
      { position: 0.5, speed: 1 },
      { position: 1, speed: 1 },
    ],
  };
}

export function createDefaultAudioState(): AudioClipState {
  return {
    volume: 1,
    pan: 0,
    fadeInUs: 0,
    fadeOutUs: 0,
    muted: false,
    denoise: false,
    denoiseStrength: 0.6,
    autoDucking: false,
    duckAmountDb: -14,
    voicePreset: 'none',
    eqBands: [0, 0, 0, 0, 0],
    compressorEnabled: false,
    noiseGateEnabled: false,
    pitchSemitones: 0,
  };
}

export function createDefaultTextStyle(text = 'T-CapCut Title'): TextStyleState {
  return {
    text,
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 56,
    fontWeight: 700,
    italic: false,
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 4,
    backgroundColor: 'rgba(10, 12, 18, 0)',
    backgroundRadius: 12,
    backgroundPadding: 14,
    shadowColor: 'rgba(0, 0, 0, 0.65)',
    shadowBlur: 12,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.25,
    karaokeEnabled: false,
    karaokeActiveColor: '#FFD60A',
    karaokePreset: 'capcut-yellow',
    animationIn: 'pop',
    animationDurationUs: 250_000,
  };
}

export function createEmptyProject(id: string, name = 'Dự án T-CapCut Mới'): Project {
  const now = Date.now();
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      aspectRatio: '16:9',
      sampleRate: 48000,
      coloristMode: false,
      ambientGlow: true,
      proxyEnabled: true,
      prerenderEnabled: true,
      loudnessTargetLufs: -14,
    },
    assets: {},
    tracks: [
      { id: 'track_effect_1', type: 'effect', name: 'Effects / LUTs', index: 4, isMain: false, magnetic: false, muted: false, solo: false, hidden: false, locked: false, volume: 1 },
      { id: 'track_text_1', type: 'text', name: 'Text & Captions', index: 3, isMain: false, magnetic: false, muted: false, solo: false, hidden: false, locked: false, volume: 1 },
      { id: 'track_overlay_1', type: 'overlay', name: 'Overlay / PiP', index: 2, isMain: false, magnetic: false, muted: false, solo: false, hidden: false, locked: false, volume: 1 },
      { id: 'track_main', type: 'video', name: 'Main Track', index: 1, isMain: true, magnetic: true, muted: false, solo: false, hidden: false, locked: false, volume: 1 },
      { id: 'track_audio_1', type: 'audio', name: 'Audio / Music', index: 0, isMain: false, magnetic: false, muted: false, solo: false, hidden: false, locked: false, volume: 1 },
    ],
    clips: {},
    markers: [],
    nestedTimelines: {},
  };
}

export const ASPECT_RATIO_DIMENSIONS: Record<Exclude<AspectRatioPreset, 'custom'>, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
  '2.35:1': { width: 1920, height: 816 },
  '2:1': { width: 1920, height: 960 },
  '1.85:1': { width: 1920, height: 1038 },
};
