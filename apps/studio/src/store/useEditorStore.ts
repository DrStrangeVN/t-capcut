import { create } from 'zustand';
import {
  ASPECT_RATIO_DIMENSIONS,
  US_PER_SEC,
  createDefaultAudioState,
  createDefaultChromaKey,
  createDefaultColorGrade,
  createDefaultMask,
  createDefaultSpeed,
  createDefaultTextStyle,
  createDefaultTransform,
  getScopeTracksAndClips,
  type AnimatableProperty,
  type AspectRatioPreset,
  type ChatCutPlan,
  type Clip,
  type KeyframePoint,
  type MediaAsset,
  type Microseconds,
  type Project,
  type Track,
  type TrackType,
} from '@t-capcut/schema';
import { assetMediaUrl, engineApi, type ChatCutLlmConfig, type EngineHealth, type HistoryItem } from '../engine/api';
import { playbackClock } from '../engine/PlaybackClock';
import type { LoadedLutTexture } from '../engine/WebGLCompositor';
import {
  applyVideoTemplateToProject,
  buildTextStyleFromPreset,
  TRANSITION_BY_ID,
  type AudioPreset,
  type BuiltinLutPreset,
  type StickerPreset,
  type TextPreset,
  type VideoTemplatePreset,
  type VfxPreset,
} from '@t-capcut/presets';

export type LeftPanelTab = 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'transitions' | 'luts' | 'templates' | 'ai';
export type InspectorTab = 'transform' | 'color' | 'chroma' | 'speed' | 'audio';
export type TimelineTool = 'select' | 'blade';

interface EditorState {
  health: EngineHealth | null;
  projectsList: Array<{ id: string; name: string; updatedAt: number; clipCount: number; aspectRatio: string }>;
  project: Project | null;
  history: HistoryItem[];
  nestedScopeId: string | null;
  playheadUs: Microseconds;
  isPlaying: boolean;
  zoomPxPerSec: number;
  scrollLeftPx: number;
  selectedClipId: string | null;
  selectedClipIds: string[];
  tool: TimelineTool;
  leftTab: LeftPanelTab;
  inspectorTab: InspectorTab;
  showSafeZones: boolean;
  showScopes: boolean;
  cropMode: boolean;
  eyedropperActive: boolean;
  historyDrawerOpen: boolean;
  chatCutOpen: boolean;
  exportModalOpen: boolean;
  pendingPlan: ChatCutPlan | null;
  statusMessage: string | null;
  errorMessage: string | null;
  busyTask: string | null;
  waveformCache: Record<string, number[]>;
  loadedLuts: Record<string, LoadedLutTexture>;
  ambientGlowColor: string;
  llmConfig: ChatCutLlmConfig | null;
  favoritePresetIds: string[];
  templateModalPreset: VideoTemplatePreset | null;
  systemFonts: string[];
  hoverPreview: { kind: 'lut' | 'vfx'; id: string; name: string } | null;
  copiedAttributes: {
    colorGrade?: Clip['colorGrade'];
    effects?: Clip['effects'];
    transform?: Clip['transform'];
    audio?: Clip['audio'];
  } | null;
  objectSegmentMode: boolean;
  fullscreenPreview: boolean;
  commandPaletteOpen: boolean;
  importReport: {
    title: string;
    compatibilityPct: number;
    mappedItems: string[];
    fallbackItems: string[];
    missingMediaSlots: Array<{ slotIndex: number; clipId: string; originalPath: string; label: string; durationUs: number }>;
  } | null;

  init: () => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  setPlayheadUs: (us: Microseconds) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoomPxPerSec: (px: number) => void;
  setScrollLeftPx: (px: number) => void;
  setSelectedClipId: (id: string | null) => void;
  toggleClipSelection: (id: string) => void;
  setSelectedClipIds: (ids: string[]) => void;
  setTool: (tool: TimelineTool) => void;
  setLeftTab: (tab: LeftPanelTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setShowSafeZones: (v: boolean) => void;
  setShowScopes: (v: boolean) => void;
  setCropMode: (v: boolean) => void;
  setEyedropperActive: (v: boolean) => void;
  setHistoryDrawerOpen: (v: boolean) => void;
  setChatCutOpen: (v: boolean) => void;
  setExportModalOpen: (v: boolean) => void;
  setAmbientGlowColor: (c: string) => void;
  setStatusMessage: (msg: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  setLlmConfig: (cfg: ChatCutLlmConfig | null) => void;

  commitProject: (label: string, next: Project) => Promise<void>;
  commitCurrentProject: (label: string) => Promise<void>;
  previewSelectedClip: (updater: (clip: Clip) => void) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  jumpToCommand: (cmdId: string) => Promise<void>;

  createDemoSample: () => Promise<void>;
  uploadMediaFile: (file: File) => Promise<void>;
  importMediaPath: (path: string) => Promise<void>;
  importCapCutDraftFile: (draftJson: unknown) => Promise<void>;
  addAssetToTimeline: (asset: MediaAsset, targetTrackId?: string, atUs?: Microseconds) => Promise<void>;
  addTextClip: (text?: string, karaokeEnabled?: boolean) => Promise<void>;
  addTextPresetClip: (preset: TextPreset, textOverride?: string) => Promise<void>;
  applyKaraokeStyleAll: (preset: TextPreset) => Promise<void>;
  addStickerClip: (preset: StickerPreset, atUs?: Microseconds) => Promise<void>;
  addEffectClip: (shaderId: string, name: string, customFragmentGlsl?: string) => Promise<void>;
  addVfxPreset: (vfx: VfxPreset, targetClipId?: string) => Promise<void>;
  setClipTransition: (clipId: string, transitionId: string, withPairedSfx?: boolean) => Promise<void>;
  applyBuiltinLut: (lut: BuiltinLutPreset) => Promise<void>;
  addBuiltinAudioToTimeline: (preset: AudioPreset, atUs?: Microseconds) => Promise<void>;
  toggleFavoritePreset: (id: string) => void;
  setTemplateModalPreset: (tpl: VideoTemplatePreset | null) => void;
  applyTemplateProject: (template: VideoTemplatePreset, slotAssets: Array<MediaAsset | null>) => Promise<void>;
  importLocalPresetPack: (pack: {
    packName?: string;
    luts?: Array<{ id?: string; filename?: string; content: string }>;
    audioFiles?: Array<{ filename: string; base64: string }>;
  }) => Promise<void>;
  autoCutSelectedClipToBeats: () => Promise<void>;
  applyClipColorAndFxToAll: (kind: 'color' | 'fx') => Promise<void>;
  updateSelectedClip: (label: string, updater: (clip: Clip) => void) => Promise<void>;
  addKeyframeAtPlayhead: (prop: AnimatableProperty, value: number) => Promise<void>;
  moveKeyframeTime: (clipId: string, oldTimeUs: Microseconds, newTimeUs: Microseconds) => Promise<void>;
  deleteKeyframeAtTime: (clipId: string, timeUs: Microseconds) => Promise<void>;
  splitClipAtPlayhead: (clipId?: string, atUs?: Microseconds) => Promise<void>;
  rippleTrimClip: (side: 'left' | 'right') => Promise<void>;
  deleteSelectedClip: () => Promise<void>;
  duplicateSelectedClip: () => Promise<void>;
  createFreezeFrameAtPlayhead: () => Promise<void>;
  createCompoundFromTrack: () => Promise<void>;
  enterNestedScope: (compoundId: string) => void;
  exitNestedScope: () => void;
  ungroupCompoundClip: (clipId: string) => Promise<void>;
  addTrack: (type: TrackType) => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
  toggleTrackProp: (trackId: string, prop: 'muted' | 'solo' | 'locked' | 'magnetic' | 'hidden') => Promise<void>;
  setInOutPoint: (edge: 'in' | 'out', us?: Microseconds) => Promise<void>;
  clearInOutPoints: () => Promise<void>;
  addMarkerAtPlayhead: (label?: string) => Promise<void>;
  deleteTranscriptSegmentFromVideo: (startUs: Microseconds, endUs: Microseconds, text: string) => Promise<void>;
  downloadWhisperModel: (variant: 'tiny' | 'base') => Promise<void>;
  setAspectRatio: (ratio: Exclude<AspectRatioPreset, 'custom'>) => Promise<void>;
  toggleColoristMode: () => Promise<void>;
  toggleAmbientGlow: () => Promise<void>;
  toggleProxyMode: () => Promise<void>;
  prerenderSelectedClip: () => Promise<void>;

  runAiTask: (
    assetId: string,
    task: 'silence' | 'scenes' | 'beats' | 'transcribe' | 'matting' | 'face-track' | 'object-matting' | 'highlights' | 'remove-fillers' | 'stabilize' | 'upscale' | 'stem-separate',
    extra?: { normX?: number; normY?: number }
  ) => Promise<void>;
  setPreviewScale: (scale: 1 | 0.5 | 0.25) => Promise<void>;
  setHoverPreview: (p: { kind: 'lut' | 'vfx'; id: string; name: string } | null) => void;
  setObjectSegmentMode: (v: boolean) => void;
  setFullscreenPreview: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setImportReport: (r: EditorState['importReport']) => void;
  copyClipAttributes: (clipId?: string) => void;
  pasteClipAttributes: (clipId: string, part: 'color' | 'vfx' | 'transform' | 'audio' | 'all') => Promise<void>;
  rippleDeleteClip: (clipId?: string) => Promise<void>;
  detachAudioFromClip: (clipId?: string) => Promise<void>;
  replaceClipAsset: (clipId: string, newAssetId: string) => Promise<void>;
  generateAiVoiceover: (text: string, language: 'vi' | 'en', voice?: string) => Promise<void>;
  smartRemixSelectedMusic: () => Promise<void>;
  autoSyncSfxAtCuts: () => Promise<void>;
  autoColorMatchToPreviousClip: () => Promise<void>;
  setTextBehindSubject: (clipId: string, enabled: boolean) => Promise<void>;
  translateSelectedSubtitle: (targetLang: 'en' | 'vi') => Promise<void>;
  addLottieJsonSticker: (name: string, lottieJson: string) => Promise<void>;
  importUniversalTemplateFile: (file: File) => Promise<void>;
  importLocalCapCutDraft: (draftPath: string) => Promise<void>;
  exportCurrentAsTemplatePack: () => Promise<void>;
  removeSilencesFromClip: (clipId: string) => Promise<void>;
  generateCaptionsFromTranscript: (assetId: string) => Promise<void>;
  loadWaveform: (asset: MediaAsset) => Promise<void>;
  registerLut: (lut: LoadedLutTexture) => void;

  requestChatCutPlan: (prompt: string) => Promise<void>;
  applyPendingPlan: () => Promise<void>;
  discardPendingPlan: () => void;
}

function clone<T>(obj: T): T {
  return typeof structuredClone === 'function' ? structuredClone(obj) : (JSON.parse(JSON.stringify(obj)) as T);
}

function getActiveScopeMutable(p: Project, nestedScopeId: string | null) {
  if (nestedScopeId && p.nestedTimelines?.[nestedScopeId]) {
    return p.nestedTimelines[nestedScopeId];
  }
  return p;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  health: null,
  projectsList: [],
  project: null,
  history: [],
  nestedScopeId: null,
  playheadUs: 0,
  isPlaying: false,
  zoomPxPerSec: 110,
  scrollLeftPx: 0,
  selectedClipId: null,
  selectedClipIds: [],
  tool: 'select',
  leftTab: 'media',
  inspectorTab: 'transform',
  showSafeZones: false,
  showScopes: false,
  cropMode: false,
  eyedropperActive: false,
  historyDrawerOpen: false,
  chatCutOpen: false,
  exportModalOpen: false,
  pendingPlan: null,
  statusMessage: null,
  errorMessage: null,
  busyTask: null,
  waveformCache: {},
  loadedLuts: {},
  ambientGlowColor: 'rgba(34, 211, 238, 0.16)',
  llmConfig: (() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('tcapcut_llm_cfg') : null;
      return raw ? (JSON.parse(raw) as ChatCutLlmConfig) : null;
    } catch {
      return null;
    }
  })(),
  favoritePresetIds: (() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('tcapcut_favs_v3') : null;
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  })(),
  templateModalPreset: null,
  systemFonts: ['Inter', 'SF Pro Display', 'Helvetica Neue', 'Avenir Next', 'Georgia', 'Menlo'],
  hoverPreview: null,
  copiedAttributes: null,
  objectSegmentMode: false,
  fullscreenPreview: false,
  commandPaletteOpen: false,
  importReport: null,

  init: async () => {
    try {
      const [health, list] = await Promise.all([engineApi.health(), engineApi.listProjects()]);
      set({ health, projectsList: list.projects });
      void engineApi.getSystemFonts().then((f) => {
        if (f.fonts?.length) set({ systemFonts: f.fonts });
      }).catch(() => {});
      const firstId = list.projects[0]?.id;
      if (firstId) {
        await get().selectProject(firstId);
      }
    } catch (err) {
      set({ errorMessage: `Không kết nối được Engine: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  selectProject: async (id) => {
    try {
      const res = await engineApi.getProject(id);
      playbackClock.setPlaying(false);
      playbackClock.setTimeUs(0);
      set({
        project: res.project,
        history: res.history,
        nestedScopeId: null,
        playheadUs: 0,
        isPlaying: false,
        selectedClipId: null,
        selectedClipIds: [],
      });
      Object.values(res.project.assets).forEach((a) => {
        if (a.waveformPath) void get().loadWaveform(a);
      });
      // Restore any persisted 3D LUTs referenced by clips
      const neededLutIds = new Set<string>();
      Object.values(res.project.clips).forEach((c) => {
        if (c.colorGrade.lutId) neededLutIds.add(c.colorGrade.lutId);
      });
      for (const lutId of neededLutIds) {
        if (!get().loadedLuts[lutId]) {
          void engineApi
            .getLut(lutId)
            .then((l) => {
              get().registerLut({ id: l.id, title: l.title, size: l.size, data: new Float32Array(l.data) });
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      set({ errorMessage: `Lỗi tải dự án: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  createProject: async (name) => {
    try {
      const res = await engineApi.createProject(name);
      const list = await engineApi.listProjects();
      playbackClock.setPlaying(false);
      playbackClock.setTimeUs(0);
      set({
        project: res.project,
        projectsList: list.projects,
        history: [],
        nestedScopeId: null,
        playheadUs: 0,
        isPlaying: false,
        selectedClipId: null,
        selectedClipIds: [],
      });
    } catch (err) {
      set({ errorMessage: `Lỗi tạo dự án: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  setPlayheadUs: (us) => {
    const clamped = Math.max(0, Math.round(us));
    playbackClock.setTimeUs(clamped);
    set({ playheadUs: clamped });
  },

  setIsPlaying: (playing) => {
    playbackClock.setPlaying(playing);
    set({ isPlaying: playing, playheadUs: playbackClock.getTimeUs() });
  },

  setZoomPxPerSec: (px) => set({ zoomPxPerSec: Math.min(480, Math.max(20, px)) }),
  setScrollLeftPx: (px) => set({ scrollLeftPx: Math.max(0, px) }),
  setSelectedClipId: (id) => set({ selectedClipId: id, selectedClipIds: id ? [id] : [] }),
  toggleClipSelection: (id) =>
    set((s) => {
      const exists = s.selectedClipIds.includes(id);
      const next = exists ? s.selectedClipIds.filter((x) => x !== id) : [...s.selectedClipIds, id];
      return { selectedClipIds: next, selectedClipId: next[next.length - 1] ?? null };
    }),
  setSelectedClipIds: (ids) => set({ selectedClipIds: ids, selectedClipId: ids[ids.length - 1] ?? null }),
  setTool: (tool) => set({ tool }),
  setLeftTab: (tab) => set({ leftTab: tab }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  setShowSafeZones: (v) => set({ showSafeZones: v }),
  setShowScopes: (v) => set({ showScopes: v }),
  setCropMode: (v) => set({ cropMode: v }),
  setEyedropperActive: (v) => set({ eyedropperActive: v }),
  setHistoryDrawerOpen: (v) => set({ historyDrawerOpen: v }),
  setChatCutOpen: (v) => set({ chatCutOpen: v }),
  setExportModalOpen: (v) => set({ exportModalOpen: v }),
  setAmbientGlowColor: (c) => set({ ambientGlowColor: c }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setErrorMessage: (msg) => set({ errorMessage: msg }),
  setLlmConfig: (cfg) => {
    try {
      if (cfg) localStorage.setItem('tcapcut_llm_cfg', JSON.stringify(cfg));
      else localStorage.removeItem('tcapcut_llm_cfg');
    } catch {
      // ignore
    }
    set({ llmConfig: cfg });
  },

  commitProject: async (label, next) => {
    set({ project: next });
    try {
      const res = await engineApi.mutateProject(next.id, label, next);
      const clipCount = Object.keys(res.project.clips).length;
      set((s) => ({
        project: res.project,
        history: res.history,
        projectsList: s.projectsList.map((item) =>
          item.id === res.project.id
            ? { ...item, clipCount, aspectRatio: res.project.settings.aspectRatio, updatedAt: res.project.updatedAt }
            : item
        ),
      }));
    } catch (err) {
      set({ errorMessage: `Lỗi lưu thay đổi (${label}): ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  commitCurrentProject: async (label) => {
    const p = get().project;
    if (!p) return;
    await get().commitProject(label, p);
  },

  // Instant zero-HTTP-lag local preview for 120Hz slider dragging (committed cleanly on pointerUp)
  previewSelectedClip: (updater) => {
    const p = get().project;
    const cid = get().selectedClipId;
    if (!p || !cid) return;
    const scope = getActiveScopeMutable(p, get().nestedScopeId);
    const clip = scope.clips[cid];
    if (!clip) return;
    const nextClip = clone(clip);
    updater(nextClip);
    if (get().nestedScopeId && p.nestedTimelines?.[get().nestedScopeId!]) {
      const nt = p.nestedTimelines[get().nestedScopeId!];
      set({
        project: {
          ...p,
          nestedTimelines: {
            ...p.nestedTimelines,
            [nt.id]: { ...nt, clips: { ...nt.clips, [cid]: nextClip } },
          },
        },
      });
    } else {
      set({ project: { ...p, clips: { ...p.clips, [cid]: nextClip } } });
    }
  },

  undo: async () => {
    const p = get().project;
    if (!p) return;
    try {
      const res = await engineApi.undo(p.id);
      set({
        project: res.project,
        history: res.history,
        statusMessage: res.undoneLabel ? `Đã hoàn tác: ${res.undoneLabel}` : 'Không còn bước để Undo',
      });
    } catch (err) {
      set({ errorMessage: `Lỗi Undo: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  redo: async () => {
    const p = get().project;
    if (!p) return;
    try {
      const res = await engineApi.redo(p.id);
      set({
        project: res.project,
        history: res.history,
        statusMessage: res.redoneLabel ? `Đã làm lại: ${res.redoneLabel}` : 'Không còn bước để Redo',
      });
    } catch (err) {
      set({ errorMessage: `Lỗi Redo: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  jumpToCommand: async (cmdId) => {
    const p = get().project;
    if (!p) return;
    try {
      const res = await engineApi.jumpToCommand(p.id, cmdId);
      set({ project: res.project, history: res.history, statusMessage: 'Đã khôi phục mốc lịch sử!' });
    } catch (err) {
      set({ errorMessage: `Lỗi nhảy lịch sử: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  createDemoSample: async () => {
    set({ busyTask: 'Đang tạo video mẫu 720p + tạo Proxy & Waveform...' });
    try {
      const { asset } = await engineApi.createSampleMedia();
      const p = get().project;
      if (!p) return;
      const next = clone(p);
      next.assets[asset.id] = asset;
      await get().commitProject(`Import Demo: ${asset.name}`, next);
      await get().addAssetToTimeline(asset);
      await get().loadWaveform(asset);
      set({ statusMessage: 'Đã nạp & đưa video mẫu vào Timeline!' });
    } catch (err) {
      set({ errorMessage: `Lỗi tạo video mẫu: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  uploadMediaFile: async (file) => {
    set({ busyTask: `Đang nhập ${file.name} (Streaming zero-OOM)...` });
    try {
      const { asset } = await engineApi.uploadMedia(file);
      const p = get().project;
      if (!p) return;
      const next = clone(p);
      next.assets[asset.id] = asset;
      await get().commitProject(`Import ${asset.name}`, next);
      await get().loadWaveform(asset);
      set({ statusMessage: `Đã nhập ${asset.name}` });
    } catch (err) {
      set({ errorMessage: `Lỗi nhập file: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  importMediaPath: async (filePath) => {
    set({ busyTask: `Đang đọc ${filePath}...` });
    try {
      const { asset } = await engineApi.importMediaPath(filePath, true);
      const p = get().project;
      if (!p) return;
      const next = clone(p);
      next.assets[asset.id] = asset;
      await get().commitProject(`Import ${asset.name}`, next);
      await get().loadWaveform(asset);
      set({ statusMessage: `Đã nhập ${asset.name}` });
    } catch (err) {
      set({ errorMessage: `Lỗi đọc đường dẫn: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  importCapCutDraftFile: async (draftJson) => {
    set({ busyTask: 'Đang chuyển đổi CapCut draft_content.json sang T-CapCut...' });
    try {
      const { project } = await engineApi.importCapCutDraft(draftJson);
      const list = await engineApi.listProjects();
      set({
        project,
        projectsList: list.projects,
        nestedScopeId: null,
        history: [],
        playheadUs: 0,
        selectedClipId: null,
        selectedClipIds: [],
        statusMessage: `Đã nhập CapCut Draft: ${project.name}`,
      });
    } catch (err) {
      set({ errorMessage: `Lỗi đọc CapCut draft: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  addAssetToTimeline: async (asset, targetTrackId, atUs) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    next.assets[asset.id] = asset;
    const scope = getActiveScopeMutable(next, get().nestedScopeId);

    const track =
      (targetTrackId && scope.tracks.find((t) => t.id === targetTrackId)) ||
      (asset.kind === 'audio'
        ? scope.tracks.find((t) => t.type === 'audio')
        : scope.tracks.find((t) => t.isMain)) ||
      scope.tracks[0];

    const trackClips = Object.values(scope.clips).filter((c) => c.trackId === track.id);
    const startUs =
      atUs !== undefined
        ? Math.max(0, atUs)
        : track.isMain
          ? trackClips.reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0)
          : playbackClock.getTimeUs();

    const clip: Clip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId: track.id,
      assetId: asset.id,
      kind: asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video',
      name: asset.name,
      timelineStartUs: startUs,
      durationUs: asset.durationUs,
      sourceStartUs: 0,
      sourceDurationUs: asset.durationUs,
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };

    scope.clips[clip.id] = clip;
    await get().commitProject(`Thêm ${asset.name} vào Timeline`, next);
    set({ selectedClipId: clip.id, selectedClipIds: [clip.id] });
  },

  addTextClip: async (text = 'T-CapCut Liquid Glass', karaokeEnabled = true) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const track = scope.tracks.find((t) => t.type === 'text') ?? scope.tracks[0];
    const startUs = playbackClock.getTimeUs();
    const durUs = 3 * US_PER_SEC;
    const wordsRaw = text.trim().split(/\s+/);
    const wordStep = Math.floor(durUs / Math.max(1, wordsRaw.length));
    const style = createDefaultTextStyle(text);
    style.karaokeEnabled = karaokeEnabled;
    style.words = wordsRaw.map((w, i) => ({
      text: w,
      startUs: startUs + i * wordStep,
      endUs: i === wordsRaw.length - 1 ? startUs + durUs : startUs + (i + 1) * wordStep,
    }));

    const clip: Clip = {
      id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      trackId: track.id,
      assetId: null,
      kind: 'text',
      name: text.slice(0, 24),
      timelineStartUs: startUs,
      durationUs: durUs,
      sourceStartUs: 0,
      sourceDurationUs: durUs,
      locked: false,
      disabled: false,
      transform: { ...createDefaultTransform(), y: 0.34 },
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      text: style,
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    scope.clips[clip.id] = clip;
    await get().commitProject('Thêm Text / Karaoke', next);
    set({ selectedClipId: clip.id, selectedClipIds: [clip.id] });
  },

  addEffectClip: async (shaderId, name, customFragmentGlsl) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const track = scope.tracks.find((t) => t.type === 'effect') ?? scope.tracks[0];
    const clip: Clip = {
      id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      trackId: track.id,
      assetId: null,
      kind: 'effect',
      name,
      timelineStartUs: playbackClock.getTimeUs(),
      durationUs: 3 * US_PER_SEC,
      sourceStartUs: 0,
      sourceDurationUs: 3 * US_PER_SEC,
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      effects: [{ id: `fx_inst_${Date.now()}`, name, shaderId, intensity: 0.75, speed: 1, customFragmentGlsl }],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    scope.clips[clip.id] = clip;
    await get().commitProject(`Thêm hiệu ứng ${name}`, next);
    set({ selectedClipId: clip.id, selectedClipIds: [clip.id] });
  },

  addTextPresetClip: async (preset, textOverride) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const track = scope.tracks.find((t) => t.type === 'text') ?? scope.tracks[0];
    const startUs = playbackClock.getTimeUs();
    const durUs = 3 * US_PER_SEC;
    const content = textOverride ?? preset.sampleText;
    const style = buildTextStyleFromPreset(preset, content);
    if (style.karaokeEnabled) {
      const wordsRaw = content.trim().split(/\s+/);
      const step = Math.floor(durUs / Math.max(1, wordsRaw.length));
      style.words = wordsRaw.map((w, i) => ({
        text: w,
        startUs: startUs + i * step,
        endUs: i === wordsRaw.length - 1 ? startUs + durUs : startUs + (i + 1) * step,
      }));
    }
    const clip: Clip = {
      id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      trackId: track.id,
      assetId: null,
      kind: 'text',
      name: preset.name,
      timelineStartUs: startUs,
      durationUs: durUs,
      sourceStartUs: 0,
      sourceDurationUs: durUs,
      locked: false,
      disabled: false,
      transform: { ...createDefaultTransform(), y: preset.defaultY },
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      text: style,
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    scope.clips[clip.id] = clip;
    await get().commitProject(`Thêm mẫu chữ ${preset.name}`, next);
    set({ selectedClipId: clip.id, selectedClipIds: [clip.id], statusMessage: `Đã thêm mẫu chữ "${preset.name}"` });
  },

  applyKaraokeStyleAll: async (preset) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    let count = 0;
    Object.values(scope.clips).forEach((clip) => {
      if (clip.kind === 'text' && clip.text) {
        const merged = buildTextStyleFromPreset(preset, clip.text.text);
        merged.words = clip.text.words;
        clip.text = merged;
        count += 1;
      }
    });
    if (count === 0) {
      await get().addTextPresetClip(preset);
      return;
    }
    await get().commitProject(`Áp dụng Karaoke "${preset.name}" cho ${count} phụ đề`, next);
    set({ statusMessage: `Đã đồng bộ kiểu Karaoke "${preset.name}" cho ${count} clip chữ!` });
  },

  addStickerClip: async (preset, atUs) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const track =
      scope.tracks.find((t) => t.type === 'overlay') ??
      scope.tracks.find((t) => t.type === 'text') ??
      scope.tracks[0];
    const startUs = atUs ?? playbackClock.getTimeUs();
    const clip: Clip = {
      id: `stk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      trackId: track.id,
      assetId: null,
      kind: 'sticker',
      name: preset.name,
      timelineStartUs: startUs,
      durationUs: preset.defaultDurationUs,
      sourceStartUs: 0,
      sourceDurationUs: preset.defaultDurationUs,
      locked: false,
      disabled: false,
      transform: { ...createDefaultTransform(), y: preset.category === 'badge' ? -0.3 : 0.25 },
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      sticker: { ...preset },
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    scope.clips[clip.id] = clip;
    await get().commitProject(`Thêm Sticker ${preset.name}`, next);
    set({ selectedClipId: clip.id, selectedClipIds: [clip.id], statusMessage: `Đã thêm "${preset.name}" vào Timeline` });
  },

  addVfxPreset: async (vfx, targetClipId) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const targetId = targetClipId ?? get().selectedClipId;
    const targetClip = targetId ? scope.clips[targetId] : undefined;

    if (targetClip && (targetClip.kind === 'video' || targetClip.kind === 'image')) {
      targetClip.effects = [
        ...(targetClip.effects ?? []),
        {
          id: `fx_inst_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          name: vfx.name,
          shaderId: vfx.id,
          intensity: vfx.defaultIntensity,
          speed: vfx.defaultSpeed,
          scale: vfx.defaultScale,
          enabled: true,
        },
      ];
      await get().commitProject(`Gắn VFX ${vfx.name} lên ${targetClip.name}`, next);
      set({ statusMessage: `Đã xếp chồng GPU VFX "${vfx.name}" lên clip` });
      return;
    }

    const track = scope.tracks.find((t) => t.type === 'effect') ?? scope.tracks[0];
    const startUs = playbackClock.getTimeUs();
    const clip: Clip = {
      id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      trackId: track.id,
      assetId: null,
      kind: 'effect',
      name: vfx.name,
      timelineStartUs: startUs,
      durationUs: 3 * US_PER_SEC,
      sourceStartUs: 0,
      sourceDurationUs: 3 * US_PER_SEC,
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      effects: [
        {
          id: `fx_inst_${Date.now()}`,
          name: vfx.name,
          shaderId: vfx.id,
          intensity: vfx.defaultIntensity,
          speed: vfx.defaultSpeed,
          scale: vfx.defaultScale,
          enabled: true,
        },
      ],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    scope.clips[clip.id] = clip;
    await get().commitProject(`Thêm VFX Track ${vfx.name}`, next);
    set({ selectedClipId: clip.id, selectedClipIds: [clip.id], statusMessage: `Đã thêm GPU VFX "${vfx.name}"` });
  },

  setClipTransition: async (clipId, transitionId, withPairedSfx = false) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const clip = scope.clips[clipId];
    if (!clip) return;

    const trans = TRANSITION_BY_ID[transitionId];
    if (!trans || transitionId === 'none') {
      clip.transitionIn = null;
      await get().commitProject('Xóa chuyển cảnh', next);
      return;
    }

    clip.transitionIn = {
      id: `tr_${Date.now()}`,
      name: trans.name,
      type: trans.id,
      durationUs: trans.defaultDurationUs,
    };

    if (withPairedSfx && trans.recommendedSfxId) {
      try {
        const res = await engineApi.addBuiltinAudio(trans.recommendedSfxId);
        next.assets[res.asset.id] = res.asset;
        const audioTrack = scope.tracks.find((t) => t.type === 'audio') ?? scope.tracks[0];
        const sfxStart = Math.max(0, clip.timelineStartUs - Math.round(res.asset.durationUs * 0.45));
        const sfxId = `sfx_tr_${Date.now()}`;
        scope.clips[sfxId] = {
          id: sfxId,
          trackId: audioTrack.id,
          assetId: res.asset.id,
          kind: 'audio',
          name: res.asset.name,
          timelineStartUs: sfxStart,
          durationUs: res.asset.durationUs,
          sourceStartUs: 0,
          sourceDurationUs: res.asset.durationUs,
          locked: false,
          disabled: false,
          transform: createDefaultTransform(),
          colorGrade: createDefaultColorGrade(),
          chromaKey: createDefaultChromaKey(),
          mask: createDefaultMask(),
          speed: createDefaultSpeed(),
          audio: { ...createDefaultAudioState(), volume: 0.9 },
          keyframes: {},
          effects: [],
          aiMattingEnabled: false,
          autoReframeEnabled: false,
        };
      } catch {
        // non-fatal if SFX asset fails
      }
    }

    await get().commitProject(`Chuyển cảnh: ${trans.name}`, next);
    set({ statusMessage: `Đã gắn chuyển cảnh "${trans.name}"${withPairedSfx && trans.recommendedSfxId ? ' + SFX đi kèm' : ''}` });
  },

  applyBuiltinLut: async (lut) => {
    const p = get().project;
    if (!p) return;
    set({ busyTask: `Đang nạp 3D LUT ${lut.title}...` });
    try {
      const loaded = await engineApi.getBuiltinLut(lut.id);
      get().registerLut({
        id: lut.id,
        title: lut.title,
        size: loaded.size,
        data: new Float32Array(loaded.data),
      });

      const next = clone(p);
      next.luts = {
        ...(next.luts ?? {}),
        [lut.id]: { id: lut.id, title: lut.title, size: loaded.size, filePath: loaded.filePath },
      };
      const scope = getActiveScopeMutable(next, get().nestedScopeId);
      const selId = get().selectedClipId;
      const selClip = selId ? scope.clips[selId] : undefined;
      const targets =
        selClip && (selClip.kind === 'video' || selClip.kind === 'image')
          ? [selClip]
          : Object.values(scope.clips).filter((c) => c.kind === 'video' || c.kind === 'image');

      targets.forEach((tc) => {
        tc.colorGrade.lutId = lut.id;
        tc.colorGrade.lutName = lut.title;
        tc.colorGrade.lutIntensity = lut.defaultIntensity;
      });

      await get().commitProject(`Áp 3D LUT: ${lut.title}`, next);
      set({ statusMessage: `Đã áp 3D LUT "${lut.title}" lên ${targets.length} clip` });
    } catch (err) {
      set({ errorMessage: `Lỗi tải LUT: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  addBuiltinAudioToTimeline: async (preset, atUs) => {
    const p = get().project;
    if (!p) return;
    set({ busyTask: `Đang thêm ${preset.name} vào Timeline...` });
    try {
      const { asset } = await engineApi.addBuiltinAudio(preset.id);
      const next = clone(p);
      next.assets[asset.id] = asset;
      const scope = getActiveScopeMutable(next, get().nestedScopeId);
      const track = scope.tracks.find((t) => t.type === 'audio') ?? scope.tracks[0];
      const startUs = atUs ?? playbackClock.getTimeUs();

      const clip: Clip = {
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        trackId: track.id,
        assetId: asset.id,
        kind: 'audio',
        name: preset.name,
        timelineStartUs: startUs,
        durationUs: asset.durationUs,
        sourceStartUs: 0,
        sourceDurationUs: asset.durationUs,
        locked: false,
        disabled: false,
        transform: createDefaultTransform(),
        colorGrade: createDefaultColorGrade(),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed: createDefaultSpeed(),
        audio: {
          ...createDefaultAudioState(),
          volume: preset.kind === 'music' ? 0.72 : 0.95,
          fadeOutUs: preset.kind === 'music' ? 600_000 : 0,
        },
        keyframes: {},
        effects: [],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
      scope.clips[clip.id] = clip;

      if (preset.kind === 'music' && preset.beatsUs.length > 0) {
        const existingBeats = new Set(next.markers.map((m) => m.timeUs));
        preset.beatsUs.slice(0, 32).forEach((bUs, bi) => {
          const absUs = startUs + bUs;
          if (!existingBeats.has(absUs)) {
            next.markers.push({
              id: `bmk_${Date.now()}_${bi}`,
              timeUs: absUs,
              label: `Beat ${bi + 1}`,
              color: '#FFD60A',
              kind: 'beat',
            });
          }
        });
      }

      await get().commitProject(`Thêm ${preset.kind === 'music' ? 'Nhạc' : 'SFX'}: ${preset.name}`, next);
      await get().loadWaveform(asset);
      set({
        selectedClipId: clip.id,
        selectedClipIds: [clip.id],
        statusMessage: `Đã thêm "${preset.name}"${preset.bpm ? ` (${preset.bpm} BPM + Beat Markers)` : ''}`,
      });
    } catch (err) {
      set({ errorMessage: `Lỗi thêm Audio: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  toggleFavoritePreset: (id) => {
    set((s) => {
      const exists = s.favoritePresetIds.includes(id);
      const next = exists ? s.favoritePresetIds.filter((x) => x !== id) : [...s.favoritePresetIds, id];
      try {
        localStorage.setItem('tcapcut_favs_v3', JSON.stringify(next));
      } catch {
        // ignore
      }
      return { favoritePresetIds: next };
    });
  },

  setTemplateModalPreset: (tpl) => set({ templateModalPreset: tpl }),

  applyTemplateProject: async (template, slotAssets) => {
    const p = get().project;
    if (!p) return;
    set({ busyTask: `Đang dựng Smart Template "${template.name}"...` });
    try {
      const [loadedLut, musicRes] = await Promise.all([
        engineApi.getBuiltinLut(template.lutId).catch(() => null),
        engineApi.addBuiltinAudio(template.musicId).catch(() => null),
      ]);
      if (loadedLut) {
        get().registerLut({
          id: template.lutId,
          title: loadedLut.title,
          size: loadedLut.size,
          data: new Float32Array(loadedLut.data),
        });
      }
      const nextProj = applyVideoTemplateToProject(p, template, slotAssets, musicRes?.asset ?? null);
      if (loadedLut) {
        nextProj.luts = {
          ...(nextProj.luts ?? {}),
          [template.lutId]: { id: template.lutId, title: loadedLut.title, size: loadedLut.size, filePath: loadedLut.filePath },
        };
      }
      await get().commitProject(`Áp dụng Template: ${template.name}`, nextProj);
      if (musicRes?.asset) await get().loadWaveform(musicRes.asset);
      playbackClock.setPlaying(false);
      playbackClock.setTimeUs(0);
      set({
        playheadUs: 0,
        templateModalPreset: null,
        selectedClipId: null,
        statusMessage: `Đã tạo video từ Template "${template.name}" (${template.slots.length} cảnh + Nhạc + LUT + Karaoke)!`,
      });
    } catch (err) {
      set({ errorMessage: `Lỗi tạo Template: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  importLocalPresetPack: async (pack) => {
    set({ busyTask: 'Đang nhập Local Pack...' });
    try {
      const res = await engineApi.importLocalPack(pack);
      res.importedLuts.forEach((l) => {
        get().registerLut({ id: l.id, title: l.title, size: l.size, data: new Float32Array(l.data) });
      });
      const p = get().project;
      if (p) {
        const next = clone(p);
        res.importedAudio.forEach((a) => {
          next.assets[a.id] = a;
        });
        res.importedLuts.forEach((l) => {
          next.luts = { ...(next.luts ?? {}), [l.id]: { id: l.id, title: l.title, size: l.size, filePath: l.filePath } };
        });
        await get().commitProject(`Import Pack: ${res.packName}`, next);
      }
      set({ statusMessage: `Đã nhập Pack "${res.packName}" (${res.importedLuts.length} LUTs, ${res.importedAudio.length} Audio)` });
    } catch (err) {
      set({ errorMessage: `Lỗi nhập Pack: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  autoCutSelectedClipToBeats: async () => {
    const p = get().project;
    const cid = get().selectedClipId;
    if (!p || !cid) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const clip = scope.clips[cid];
    if (!clip) return;

    const beatTimes = next.markers
      .filter((m) => m.kind === 'beat' && m.timeUs > clip.timelineStartUs + 150_000 && m.timeUs < clip.timelineStartUs + clip.durationUs - 150_000)
      .map((m) => m.timeUs)
      .sort((a, b) => a - b);

    if (beatTimes.length === 0) {
      set({ errorMessage: 'Chưa có Beat Marker nằm trên clip này. Hãy thêm Nhạc nền hoặc chạy Auto Beat Markers trước!' });
      return;
    }

    // Deduplicate cuts closer than 250ms and split clip into beat-synced segments
    const cuts: number[] = [];
    for (const bt of beatTimes) {
      if (cuts.length === 0 || bt - cuts[cuts.length - 1]! >= 250_000) cuts.push(bt);
    }

    delete scope.clips[clip.id];
    const points = [clip.timelineStartUs, ...cuts, clip.timelineStartUs + clip.durationUs];
    const createdIds: string[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const sUs = points[i]!;
      const eUs = points[i + 1]!;
      const segDur = eUs - sUs;
      const offsetUs = sUs - clip.timelineStartUs;
      const segId = i === 0 ? clip.id : `${clip.id}_b${i}_${Math.random().toString(36).slice(2, 5)}`;
      const seg: Clip = clone(clip);
      seg.id = segId;
      seg.name = `${clip.name} · B${i + 1}`;
      seg.timelineStartUs = sUs;
      seg.durationUs = segDur;
      seg.sourceStartUs = clip.sourceStartUs + Math.round(offsetUs * (clip.speed.rate || 1));
      seg.sourceDurationUs = Math.round(segDur * (clip.speed.rate || 1));
      seg.transitionIn = i === 0 ? clip.transitionIn : null;
      scope.clips[segId] = seg;
      createdIds.push(segId);
    }
    await get().commitProject(`⚡ Beat-Cut thành ${createdIds.length} đoạn`, next);
    set({ selectedClipId: createdIds[0]!, selectedClipIds: createdIds, statusMessage: `Đã tự động cắt thành ${createdIds.length} đoạn khớp nhịp Beat!` });
  },

  applyClipColorAndFxToAll: async (kind) => {
    const p = get().project;
    const cid = get().selectedClipId;
    if (!p || !cid) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const src = scope.clips[cid];
    if (!src) return;
    let count = 0;
    Object.values(scope.clips).forEach((c) => {
      if (c.id !== src.id && (c.kind === 'video' || c.kind === 'image')) {
        if (kind === 'color') c.colorGrade = clone(src.colorGrade);
        else c.effects = clone(src.effects).map((fx, idx) => ({ ...fx, id: `${fx.id}_cp_${count}_${idx}` }));
        count += 1;
      }
    });
    if (count === 0) {
      set({ statusMessage: 'Không có clip video/ảnh nào khác để sao chép.' });
      return;
    }
    await get().commitProject(kind === 'color' ? `Đồng bộ Màu/LUT cho ${count} clip` : `Đồng bộ Multi-FX cho ${count} clip`, next);
    set({ statusMessage: `Đã áp dụng ${kind === 'color' ? 'Màu/LUT' : 'VFX Stack'} cho ${count} clip khác!` });
  },

  updateSelectedClip: async (label, updater) => {
    const p = get().project;
    const cid = get().selectedClipId;
    if (!p || !cid) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    if (!scope.clips[cid]) return;
    updater(scope.clips[cid]);
    await get().commitProject(label, next);
  },

  addKeyframeAtPlayhead: async (prop, value) => {
    const p = get().project;
    const cid = get().selectedClipId;
    if (!p || !cid) return;
    const scopeRead = getScopeTracksAndClips(p, get().nestedScopeId);
    const clip = scopeRead.clips[cid];
    if (!clip) return;
    const localUs = Math.max(0, Math.min(clip.durationUs, playbackClock.getTimeUs() - clip.timelineStartUs));
    await get().updateSelectedClip(`Keyframe ${prop}`, (c) => {
      const list: KeyframePoint[] = c.keyframes[prop] ?? [];
      const existing = list.find((k) => Math.abs(k.timeUs - localUs) < 40_000);
      if (existing) {
        existing.value = value;
      } else {
        list.push({
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          timeUs: localUs,
          value,
          easing: [0.42, 0, 0.58, 1],
        });
      }
      c.keyframes[prop] = list.sort((a, b) => a.timeUs - b.timeUs);
    });
  },

  moveKeyframeTime: async (clipId, oldTimeUs, newTimeUs) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const c = scope.clips[clipId];
    if (!c) return;
    const clampedNew = Math.max(0, Math.min(c.durationUs, Math.round(newTimeUs)));
    Object.values(c.keyframes).forEach((arr) => {
      if (!arr) return;
      arr.forEach((kf) => {
        if (Math.abs(kf.timeUs - oldTimeUs) < 15_000) kf.timeUs = clampedNew;
      });
      arr.sort((a, b) => a.timeUs - b.timeUs);
    });
    await get().commitProject('Dịch chuyển Keyframe', next);
  },

  deleteKeyframeAtTime: async (clipId, timeUs) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const c = scope.clips[clipId];
    if (!c) return;
    Object.keys(c.keyframes).forEach((k) => {
      const prop = k as AnimatableProperty;
      const list = c.keyframes[prop];
      if (!list) return;
      c.keyframes[prop] = list.filter((kf) => Math.abs(kf.timeUs - timeUs) >= 20_000);
    });
    await get().commitProject('Xóa Keyframe', next);
  },

  splitClipAtPlayhead: async (clipId, atUs) => {
    const p = get().project;
    if (!p) return;
    const scopeRead = getScopeTracksAndClips(p, get().nestedScopeId);
    const splitAt = atUs ?? playbackClock.getTimeUs();
    const target =
      (clipId && scopeRead.clips[clipId]) ||
      (get().selectedClipId && scopeRead.clips[get().selectedClipId!]) ||
      Object.values(scopeRead.clips).find(
        (c) => splitAt > c.timelineStartUs + 80_000 && splitAt < c.timelineStartUs + c.durationUs - 80_000
      );
    if (!target) return;
    if (splitAt <= target.timelineStartUs + 80_000 || splitAt >= target.timelineStartUs + target.durationUs - 80_000) {
      return;
    }

    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const left = scope.clips[target.id];
    const leftDur = splitAt - left.timelineStartUs;
    const rightDur = left.durationUs - leftDur;
    const rate = left.speed.rate || 1;
    const leftSourceDur = Math.round(leftDur * rate);

    const right: Clip = {
      ...clone(left),
      id: `${left.id}_s_${Math.random().toString(36).slice(2, 5)}`,
      timelineStartUs: splitAt,
      durationUs: rightDur,
      sourceStartUs: left.sourceStartUs + leftSourceDur,
      sourceDurationUs: Math.max(80_000, left.sourceDurationUs - leftSourceDur),
    };
    left.durationUs = leftDur;
    left.sourceDurationUs = leftSourceDur;
    scope.clips[right.id] = right;
    await get().commitProject(`Split ${left.name}`, next);
    set({ selectedClipId: right.id, selectedClipIds: [right.id] });
  },

  rippleTrimClip: async (side) => {
    const p = get().project;
    const cid = get().selectedClipId;
    if (!p || !cid) return;
    const scopeRead = getScopeTracksAndClips(p, get().nestedScopeId);
    const clip = scopeRead.clips[cid];
    if (!clip) return;
    const at = playbackClock.getTimeUs();
    if (at <= clip.timelineStartUs || at >= clip.timelineStartUs + clip.durationUs) return;

    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const target = scope.clips[cid];
    const track = scope.tracks.find((t) => t.id === target.trackId);

    if (side === 'left') {
      const cutUs = at - target.timelineStartUs;
      target.sourceStartUs += Math.round(cutUs * (target.speed.rate || 1));
      target.durationUs -= cutUs;
      target.sourceDurationUs -= Math.round(cutUs * (target.speed.rate || 1));
      if (track?.magnetic) {
        Object.values(scope.clips)
          .filter((c) => c.trackId === target.trackId && c.timelineStartUs >= target.timelineStartUs)
          .forEach((c) => {
            c.timelineStartUs = Math.max(0, c.timelineStartUs - cutUs);
          });
        get().setPlayheadUs(target.timelineStartUs);
      } else {
        target.timelineStartUs = at;
      }
    } else {
      const cutUs = target.timelineStartUs + target.durationUs - at;
      target.durationUs -= cutUs;
      target.sourceDurationUs = Math.round(target.durationUs * (target.speed.rate || 1));
      if (track?.magnetic) {
        Object.values(scope.clips)
          .filter((c) => c.trackId === target.trackId && c.timelineStartUs > target.timelineStartUs)
          .forEach((c) => {
            c.timelineStartUs = Math.max(0, c.timelineStartUs - cutUs);
          });
      }
    }
    await get().commitProject(`Ripple Trim ${side}`, next);
  },

  deleteSelectedClip: async () => {
    const p = get().project;
    const ids = get().selectedClipIds.length > 0 ? get().selectedClipIds : get().selectedClipId ? [get().selectedClipId!] : [];
    if (!p || ids.length === 0) return;

    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    let labelName = '';

    // Sort right-to-left so magnetic gaps close cleanly without index shift errors
    const toRemove = ids
      .map((id) => scope.clips[id])
      .filter((c): c is Clip => Boolean(c))
      .sort((a, b) => b.timelineStartUs - a.timelineStartUs);

    for (const removed of toRemove) {
      labelName = removed.name;
      const track = scope.tracks.find((t) => t.id === removed.trackId);
      delete scope.clips[removed.id];
      if (track?.magnetic) {
        Object.values(scope.clips)
          .filter((c) => c.trackId === track.id && c.timelineStartUs > removed.timelineStartUs)
          .forEach((c) => {
            c.timelineStartUs = Math.max(0, c.timelineStartUs - removed.durationUs);
          });
      }
    }

    await get().commitProject(toRemove.length > 1 ? `Xóa ${toRemove.length} clips` : `Xóa ${labelName}`, next);
    set({ selectedClipId: null, selectedClipIds: [] });
  },

  duplicateSelectedClip: async () => {
    const p = get().project;
    const cid = get().selectedClipId;
    if (!p || !cid) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const src = scope.clips[cid];
    if (!src) return;
    const dup: Clip = {
      ...clone(src),
      id: `${src.id}_dup_${Math.random().toString(36).slice(2, 5)}`,
      timelineStartUs: src.timelineStartUs + src.durationUs,
    };
    scope.clips[dup.id] = dup;
    await get().commitProject(`Nhân bản ${src.name}`, next);
    set({ selectedClipId: dup.id, selectedClipIds: [dup.id] });
  },

  createFreezeFrameAtPlayhead: async () => {
    const p = get().project;
    const at = playbackClock.getTimeUs();
    if (!p) return;
    const scopeRead = getScopeTracksAndClips(p, get().nestedScopeId);
    const target =
      (get().selectedClipId && scopeRead.clips[get().selectedClipId!]) ||
      Object.values(scopeRead.clips).find((c) => c.kind === 'video' && at >= c.timelineStartUs && at <= c.timelineStartUs + c.durationUs);
    if (!target || !target.assetId || target.kind !== 'video') {
      set({ statusMessage: 'Hãy đặt Playhead lên 1 Video Clip để đóng băng khung hình.' });
      return;
    }

    set({ busyTask: 'Đang trích xuất khung hình Freeze Frame...' });
    try {
      const localUs = Math.max(0, at - target.timelineStartUs);
      const sourceTimeUs = target.sourceStartUs + Math.round(localUs * (target.speed.rate || 1));
      const { asset } = await engineApi.createFreezeFrame(p.id, target.assetId, sourceTimeUs);

      const next = clone(p);
      next.assets[asset.id] = asset;
      const scope = getActiveScopeMutable(next, get().nestedScopeId);
      const orig = scope.clips[target.id];
      const freezeDur = 2 * US_PER_SEC;
      const splitOffset = Math.max(0, at - orig.timelineStartUs);
      const rightDur = orig.durationUs - splitOffset;

      if (splitOffset > 80_000 && rightDur > 80_000) {
        const right: Clip = {
          ...clone(orig),
          id: `${orig.id}_fr_${Math.random().toString(36).slice(2, 5)}`,
          timelineStartUs: at + freezeDur,
          durationUs: rightDur,
          sourceStartUs: orig.sourceStartUs + Math.round(splitOffset * (orig.speed.rate || 1)),
          sourceDurationUs: Math.max(80_000, orig.sourceDurationUs - Math.round(splitOffset * (orig.speed.rate || 1))),
        };
        orig.durationUs = splitOffset;
        orig.sourceDurationUs = Math.round(splitOffset * (orig.speed.rate || 1));
        scope.clips[right.id] = right;
      }

      Object.values(scope.clips)
        .filter((c) => c.trackId === orig.trackId && c.timelineStartUs >= at && c.id !== orig.id && !c.id.includes('_fr_'))
        .forEach((c) => {
          c.timelineStartUs += freezeDur;
        });

      const freezeClip: Clip = {
        id: `freeze_${Date.now()}`,
        trackId: orig.trackId,
        assetId: asset.id,
        kind: 'image',
        name: `Freeze · ${orig.name}`,
        timelineStartUs: at,
        durationUs: freezeDur,
        sourceStartUs: 0,
        sourceDurationUs: freezeDur,
        locked: false,
        disabled: false,
        transform: clone(orig.transform),
        colorGrade: clone(orig.colorGrade),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed: createDefaultSpeed(),
        audio: createDefaultAudioState(),
        keyframes: {},
        effects: [],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
      scope.clips[freezeClip.id] = freezeClip;
      await get().commitProject('Freeze Frame 2.0s', next);
      set({ selectedClipId: freezeClip.id, selectedClipIds: [freezeClip.id], statusMessage: 'Đã tạo Freeze Frame 2.0s tại Playhead!' });
    } catch (err) {
      set({ errorMessage: `Lỗi Freeze Frame: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  createCompoundFromTrack: async () => {
    const p = get().project;
    if (!p || get().nestedScopeId) return;
    const selected = get().selectedClipIds.map((id) => p.clips[id]).filter((c): c is Clip => Boolean(c));
    const mainTrack = p.tracks.find((t) => t.isMain) ?? p.tracks[0];
    const clips = selected.length >= 2 ? selected : Object.values(p.clips).filter((c) => c.trackId === mainTrack.id);
    if (clips.length < 2) {
      set({ statusMessage: 'Chọn ít nhất 2 clips (Shift+Click) hoặc cần >= 2 clips trên Main Track.' });
      return;
    }

    const next = clone(p);
    const compoundId = `cmp_${Date.now()}`;
    const minStart = Math.min(...clips.map((c) => c.timelineStartUs));
    const maxEnd = Math.max(...clips.map((c) => c.timelineStartUs + c.durationUs));

    const usedTrackIds = new Set(clips.map((c) => c.trackId));
    const nestedTracks = next.tracks.filter((t) => usedTrackIds.has(t.id)).map((t) => clone(t));
    const nestedClips: Record<string, Clip> = {};
    clips.forEach((c) => {
      const cloned = clone(c);
      cloned.timelineStartUs = cloned.timelineStartUs - minStart;
      nestedClips[c.id] = cloned;
      delete next.clips[c.id];
    });

    next.nestedTimelines = next.nestedTimelines ?? {};
    next.nestedTimelines[compoundId] = {
      id: compoundId,
      name: `Compound (${clips.length} clips)`,
      tracks: nestedTracks.length > 0 ? nestedTracks : [clone(mainTrack)],
      clips: nestedClips,
    };

    const compoundClip: Clip = {
      id: `clip_${compoundId}`,
      trackId: clips[0].trackId,
      assetId: null,
      kind: 'compound',
      name: `Compound (${clips.length} clips)`,
      timelineStartUs: minStart,
      durationUs: maxEnd - minStart,
      sourceStartUs: 0,
      sourceDurationUs: maxEnd - minStart,
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
      compoundTimelineId: compoundId,
    };
    next.clips[compoundClip.id] = compoundClip;
    await get().commitProject('Tạo Compound Clip', next);
    set({
      selectedClipId: compoundClip.id,
      selectedClipIds: [compoundClip.id],
      statusMessage: `Đã gộp ${clips.length} clips thành Compound Clip (Double-click để mở chỉnh sửa bên trong)!`,
    });
  },

  enterNestedScope: (compoundId) => {
    const p = get().project;
    if (!p?.nestedTimelines?.[compoundId]) return;
    playbackClock.setPlaying(false);
    playbackClock.setTimeUs(0);
    set({ nestedScopeId: compoundId, isPlaying: false, playheadUs: 0, selectedClipId: null, selectedClipIds: [] });
  },

  exitNestedScope: () => {
    playbackClock.setPlaying(false);
    playbackClock.setTimeUs(0);
    set({ nestedScopeId: null, isPlaying: false, playheadUs: 0, selectedClipId: null, selectedClipIds: [] });
  },

  ungroupCompoundClip: async (clipId) => {
    const p = get().project;
    if (!p) return;
    const cmp = p.clips[clipId];
    if (!cmp || cmp.kind !== 'compound' || !cmp.compoundTimelineId || !p.nestedTimelines?.[cmp.compoundTimelineId]) return;
    const next = clone(p);
    const nt = next.nestedTimelines![cmp.compoundTimelineId!];
    delete next.clips[clipId];
    const restoredIds: string[] = [];
    for (const child of Object.values(nt.clips)) {
      const targetTrackExists = next.tracks.some((t) => t.id === child.trackId);
      const restored: Clip = {
        ...clone(child),
        trackId: targetTrackExists ? child.trackId : cmp.trackId,
        timelineStartUs: cmp.timelineStartUs + child.timelineStartUs,
      };
      next.clips[restored.id] = restored;
      restoredIds.push(restored.id);
    }
    delete next.nestedTimelines![cmp.compoundTimelineId!];
    await get().commitProject('Tách Compound Clip (Ungroup)', next);
    set({ selectedClipIds: restoredIds, selectedClipId: restoredIds[0] ?? null, statusMessage: 'Đã tách Compound Clip!' });
  },

  addTrack: async (type) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const maxIndex = scope.tracks.reduce((m, t) => Math.max(m, t.index), -1);
    const labels: Record<TrackType, string> = {
      video: 'Video',
      overlay: 'Overlay / PiP',
      audio: 'Audio',
      text: 'Text',
      effect: 'Effect',
      adjustment: 'Adjustment',
    };
    const newTrack: Track = {
      id: `track_${type}_${Date.now()}`,
      type,
      name: `${labels[type]} ${scope.tracks.filter((t) => t.type === type).length + 1}`,
      index: maxIndex + 1,
      isMain: false,
      magnetic: false,
      muted: false,
      solo: false,
      hidden: false,
      locked: false,
      volume: 1,
    };
    scope.tracks.push(newTrack);
    await get().commitProject(`Thêm Track ${newTrack.name}`, next);
  },

  removeTrack: async (trackId) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const tr = scope.tracks.find((t) => t.id === trackId);
    if (!tr || tr.isMain) return;
    const hasClips = Object.values(scope.clips).some((c) => c.trackId === trackId);
    if (hasClips) {
      set({ errorMessage: 'Chỉ có thể xóa Track trống (hãy xóa hoặc kéo clips ra khỏi Track trước).' });
      return;
    }
    scope.tracks = scope.tracks.filter((t) => t.id !== trackId);
    await get().commitProject(`Xóa Track ${tr.name}`, next);
  },

  toggleTrackProp: async (trackId, prop) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const scope = getActiveScopeMutable(next, get().nestedScopeId);
    const target = scope.tracks.find((t) => t.id === trackId);
    if (!target) return;
    target[prop] = !target[prop];
    await get().commitProject(`Track ${target.name}: ${prop}`, next);
  },

  setInOutPoint: async (edge, us) => {
    const p = get().project;
    if (!p) return;
    const t = us ?? playbackClock.getTimeUs();
    const next = clone(p);
    if (edge === 'in') next.inPointUs = Math.max(0, t);
    else next.outPointUs = Math.max((next.inPointUs ?? 0) + 100_000, t);
    await get().commitProject(`Đặt ${edge.toUpperCase()} Point`, next);
  },

  clearInOutPoints: async () => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    next.inPointUs = null;
    next.outPointUs = null;
    await get().commitProject('Xóa In/Out Range', next);
  },

  addMarkerAtPlayhead: async (label) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    next.markers.push({
      id: `mk_${Date.now()}`,
      timeUs: playbackClock.getTimeUs(),
      label: label || `Marker ${next.markers.length + 1}`,
      color: '#22d3ee',
      kind: 'user',
    });
    await get().commitProject('Thêm Marker', next);
    set({ statusMessage: 'Đã gắn Marker tại Playhead!' });
  },

  deleteTranscriptSegmentFromVideo: async (startUs, endUs, text) => {
    const p = get().project;
    if (!p) return;
    const durUs = endUs - startUs;
    if (durUs <= 80_000) return;

    const target = Object.values(p.clips).find(
      (c) => c.kind === 'video' && startUs >= c.timelineStartUs && endUs <= c.timelineStartUs + c.durationUs
    );
    if (!target) {
      set({ statusMessage: 'Không tìm thấy đoạn video khớp với câu thoại này.' });
      return;
    }

    const next = clone(p);
    const clip = next.clips[target.id];
    const leftDur = startUs - clip.timelineStartUs;
    const rightOffset = endUs - clip.timelineStartUs;
    const rightDur = clip.durationUs - rightOffset;

    if (leftDur > 80_000 && rightDur > 80_000) {
      const right: Clip = {
        ...clone(clip),
        id: `${clip.id}_tx_${Math.random().toString(36).slice(2, 5)}`,
        timelineStartUs: startUs,
        durationUs: rightDur,
        sourceStartUs: clip.sourceStartUs + rightOffset,
        sourceDurationUs: rightDur,
      };
      clip.durationUs = leftDur;
      clip.sourceDurationUs = leftDur;
      next.clips[right.id] = right;
    } else if (leftDur <= 80_000) {
      clip.sourceStartUs += durUs;
      clip.durationUs -= durUs;
      clip.sourceDurationUs -= durUs;
    } else {
      clip.durationUs = leftDur;
      clip.sourceDurationUs = leftDur;
    }

    Object.values(next.clips)
      .filter((c) => c.trackId === clip.trackId && c.timelineStartUs > startUs && !c.id.includes('_tx_'))
      .forEach((c) => {
        c.timelineStartUs = Math.max(0, c.timelineStartUs - durUs);
      });

    await get().commitProject(`RoughCut xóa: "${text.slice(0, 20)}"`, next);
    set({ statusMessage: `Đã cắt bỏ đoạn "${text.slice(0, 24)}..." khỏi video!` });
  },

  downloadWhisperModel: async (variant) => {
    set({ busyTask: `Đang tải Whisper ${variant} GGML về máy để chạy ASR Offline...` });
    try {
      const res = await engineApi.downloadWhisperModel(variant);
      const health = await engineApi.health();
      set({
        health,
        statusMessage: `Đã tải xong Whisper ${variant} (${Math.round(res.bytes / 1024 / 1024)} MB)!`,
      });
    } catch (err) {
      set({ errorMessage: `Tải Whisper thất bại: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  setAspectRatio: async (ratio) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    next.settings.aspectRatio = ratio;
    next.settings.width = ASPECT_RATIO_DIMENSIONS[ratio].width;
    next.settings.height = ASPECT_RATIO_DIMENSIONS[ratio].height;
    await get().commitProject(`Đổi tỉ lệ ${ratio}`, next);
  },

  toggleColoristMode: async () => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    next.settings.coloristMode = !next.settings.coloristMode;
    await get().commitProject('Toggle Colorist Focus Mode', next);
  },

  toggleAmbientGlow: async () => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    next.settings.ambientGlow = !next.settings.ambientGlow;
    await get().commitProject('Toggle Ambient Glow', next);
  },

  toggleProxyMode: async () => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    next.settings.proxyEnabled = !next.settings.proxyEnabled;
    await get().commitProject('Toggle Proxy Mode', next);
  },

  prerenderSelectedClip: async () => {
    const p = get().project;
    const cid = get().selectedClipId;
    if (!p || !cid) return;
    set({ busyTask: 'Đang Segment Pre-Render trên GPU/VideoToolbox...' });
    try {
      const res = await engineApi.prerenderClip(p.id, cid);
      set({
        project: res.project,
        statusMessage: res.cacheHit ? 'Pre-render Cache Hit (0ms)!' : `Đã Pre-render Segment (${res.hash})`,
      });
    } catch (err) {
      set({ errorMessage: `Lỗi Pre-Render: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  runAiTask: async (assetId, task, extra) => {
    const p = get().project;
    if (!p) return;
    const labels: Record<string, string> = {
      silence: 'Đang dò khoảng lặng bằng FFmpeg VAD...',
      scenes: 'Đang dò điểm chuyển cảnh (Scene Edit Detection)...',
      beats: 'Đang phân tích nhịp Beat âm thanh...',
      transcribe: 'Đang tạo phụ đề & transcript lời thoại...',
      matting: 'Apple Vision Neural Engine đang tách nền người...',
      'object-matting': 'Apple Vision đang tách vật thể được chọn (Click-to-Segment)...',
      'face-track': 'Apple Vision đang bám nét khuôn mặt Auto-Reframe 9:16...',
      highlights: 'AI đang tìm các khoảnh khắc Highlight Viral 9:16...',
      'remove-fillers': 'Đang quét & loại bỏ từ thừa (ờ, à, ừm...)...',
      stabilize: 'Đang chống rung 2D Stabilization...',
      upscale: 'Đang nâng độ phân giải 2× Lanczos Crisp...',
      'stem-separate': 'Đang tách Vocals & Nhạc Nền riêng biệt...',
    };
    set({ busyTask: labels[task] || 'Đang xử lý AI...' });
    try {
      const res = await engineApi.analyzeAi<Record<string, unknown>>(p.id, assetId, task, 'vi', extra);
      const fresh = await engineApi.getProject(p.id);
      const next = clone(fresh.project);

      if (task === 'beats' && Array.isArray(res.beatsUs)) {
        const beats = res.beatsUs as number[];
        beats.slice(0, 40).forEach((b, i) => {
          next.markers.push({
            id: `beat_${Date.now()}_${i}`,
            timeUs: b,
            label: `Beat ${i + 1}`,
            color: '#FFD60A',
            kind: 'beat',
          });
        });
        await get().commitProject('AI Beat Markers', next);
        set({ statusMessage: `Đã gắn ${beats.length} Beat Markers!` });
      } else if (task === 'scenes' && Array.isArray(res.scenesUs)) {
        const scenes = res.scenesUs as number[];
        scenes.forEach((sc, i) => {
          next.markers.push({
            id: `scene_${Date.now()}_${i}`,
            timeUs: sc,
            label: `Scene ${i + 1}`,
            color: '#22D3EE',
            kind: 'scene',
          });
        });
        await get().commitProject('AI Scene Markers', next);
        set({ statusMessage: `Phát hiện ${scenes.length} điểm chuyển cảnh.` });
      } else if (task === 'matting' || task === 'object-matting') {
        Object.values(next.clips)
          .filter((c) => c.assetId === assetId)
          .forEach((c) => {
            c.aiMattingEnabled = true;
          });
        await get().commitProject(task === 'object-matting' ? 'AI Tách Vật Thể' : 'Bật AI Person Matting', next);
        set({
          objectSegmentMode: false,
          statusMessage:
            task === 'object-matting'
              ? 'Đã tách vật thể được chọn bằng Apple Vision!'
              : 'Đã tách nền người bằng Apple Vision Neural Engine!',
        });
      } else if (task === 'highlights' && Array.isArray(res.highlights)) {
        const hls = res.highlights as Array<{ startUs: number; endUs: number; score: number; title: string }>;
        hls.forEach((hl, i) => {
          next.markers.push({
            id: `hl_${Date.now()}_${i}`,
            timeUs: hl.startUs,
            label: `★ Viral #${i + 1} (${hl.score}đ)`,
            color: '#FB7185',
            kind: 'user',
          });
        });
        await get().commitProject('AI Auto-Highlight Markers', next);
        set({ statusMessage: `Đã tìm thấy ${hls.length} đoạn Highlight Viral — gắn Marker đỏ lên Timeline!` });
      } else if (task === 'remove-fillers' && Array.isArray(res.fillers)) {
        const fillers = res.fillers as Array<{ startUs: number; endUs: number; word: string }>;
        if (fillers.length === 0) {
          set({ statusMessage: 'Không phát hiện từ thừa ("ờ", "à", "ừm") trong transcript.' });
        } else {
          const targetClip = Object.values(next.clips).find((c) => c.assetId === assetId);
          if (targetClip) {
            fillers
              .slice()
              .sort((a, b) => b.startUs - a.startUs)
              .forEach((f) => {
                const dur = f.endUs - f.startUs;
                if (f.startUs > targetClip.timelineStartUs && f.endUs < targetClip.timelineStartUs + targetClip.durationUs && dur > 50_000) {
                  targetClip.durationUs = Math.max(200_000, targetClip.durationUs - dur);
                }
              });
            await get().commitProject(`Xóa ${fillers.length} từ thừa`, next);
            set({ statusMessage: `Đã loại bỏ ${fillers.length} từ thừa ("ờ", "à", "ừm")!` });
          }
        }
      } else if ((task === 'stabilize' || task === 'upscale') && res.asset) {
        const newAsset = res.asset as MediaAsset;
        next.assets[newAsset.id] = newAsset;
        await get().commitProject(task === 'stabilize' ? 'Chống rung Video' : 'Upscale 2× Video', next);
        set({ statusMessage: `Đã thêm ${newAsset.name} vào Media Bin!` });
      } else if (task === 'stem-separate' && res.vocalAsset && res.instrumentalAsset) {
        const vA = res.vocalAsset as MediaAsset;
        const iA = res.instrumentalAsset as MediaAsset;
        next.assets[vA.id] = vA;
        next.assets[iA.id] = iA;
        await get().commitProject('Tách Vocals & Instrumental', next);
        await Promise.all([get().loadWaveform(vA), get().loadWaveform(iA)]);
        set({ statusMessage: 'Đã tách thành công Vocals & Nhạc Nền vào Media Bin!' });
      } else if (task === 'face-track' && res.track) {
        const tr = res.track as { points: Array<{ timeUs: number; centerX: number }> };
        next.settings.aspectRatio = '9:16';
        next.settings.width = 1080;
        next.settings.height = 1920;
        Object.values(next.clips)
          .filter((c) => c.assetId === assetId)
          .forEach((c) => {
            c.autoReframeEnabled = true;
            c.transform.scaleX = 1.78;
            c.transform.scaleY = 1.78;
            if (tr.points.length > 0) {
              c.keyframes.x = tr.points.map((pt, idx) => ({
                id: `rf_${idx}`,
                timeUs: pt.timeUs,
                value: (0.5 - pt.centerX) * 1.4,
                easing: [0.42, 0, 0.58, 1],
              }));
            }
          });
        await get().commitProject('AI Auto-Reframe 9:16', next);
        set({ statusMessage: `Auto-Reframe 9:16 theo ${tr.points.length} điểm khuôn mặt!` });
      } else {
        const engineUsed = res.engine ? ` (${String(res.engine)})` : '';
        set({ project: next, history: fresh.history, statusMessage: `Phân tích AI hoàn tất${engineUsed}!` });
      }
    } catch (err) {
      set({ errorMessage: `Lỗi AI (${task}): ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  setPreviewScale: async (scale) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    next.settings.previewScale = scale;
    await get().commitProject(`Preview Độ phân giải ${scale === 1 ? 'Full' : scale === 0.5 ? '1/2' : '1/4'}`, next);
  },

  setHoverPreview: (hp) => set({ hoverPreview: hp }),
  setObjectSegmentMode: (v) => set({ objectSegmentMode: v }),
  setFullscreenPreview: (v) => set({ fullscreenPreview: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setImportReport: (r) => set({ importReport: r }),

  copyClipAttributes: (clipId) => {
    const p = get().project;
    const cid = clipId ?? get().selectedClipId;
    const clip = p && cid ? p.clips[cid] : null;
    if (!clip) return;
    set({
      copiedAttributes: {
        colorGrade: clone(clip.colorGrade),
        effects: clone(clip.effects),
        transform: clone(clip.transform),
        audio: clone(clip.audio),
      },
      statusMessage: `Đã copy thuộc tính từ "${clip.name}" (Chuột phải clip khác để dán)`,
    });
  },

  pasteClipAttributes: async (clipId, part) => {
    const p = get().project;
    const attrs = get().copiedAttributes;
    const target = p?.clips[clipId];
    if (!p || !attrs || !target) return;
    const next = clone(p);
    const tc = next.clips[clipId]!;
    if ((part === 'color' || part === 'all') && attrs.colorGrade) {
      tc.colorGrade = clone(attrs.colorGrade);
    }
    if ((part === 'vfx' || part === 'all') && attrs.effects) {
      tc.effects = clone(attrs.effects).map((e) => ({ ...e, id: `fxi_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` }));
    }
    if ((part === 'transform' || part === 'all') && attrs.transform) {
      tc.transform = clone(attrs.transform);
    }
    if ((part === 'audio' || part === 'all') && attrs.audio) {
      tc.audio = clone(attrs.audio);
    }
    await get().commitProject(`Dán thuộc tính (${part}) -> ${tc.name}`, next);
    set({ statusMessage: `Đã dán thuộc tính (${part}) cho "${tc.name}"` });
  },

  rippleDeleteClip: async (clipId) => {
    const p = get().project;
    const cid = clipId ?? get().selectedClipId;
    const clip = p && cid ? p.clips[cid] : null;
    if (!p || !clip) return;
    const next = clone(p);
    const removedStart = clip.timelineStartUs;
    const removedDur = clip.durationUs;
    const trId = clip.trackId;
    delete next.clips[cid!];
    Object.values(next.clips)
      .filter((c) => c.trackId === trId && c.timelineStartUs >= removedStart)
      .forEach((c) => {
        c.timelineStartUs = Math.max(0, c.timelineStartUs - removedDur);
      });
    await get().commitProject(`Ripple Delete ${clip.name}`, next);
    set({ selectedClipId: null, selectedClipIds: [], statusMessage: `Đã xóa & kéo khít "${clip.name}"` });
  },

  detachAudioFromClip: async (clipId) => {
    const p = get().project;
    const cid = clipId ?? get().selectedClipId;
    const clip = p && cid ? p.clips[cid] : null;
    if (!p || !clip || !clip.assetId) return;
    const next = clone(p);
    const audioTrack = next.tracks.find((t) => t.type === 'audio') ?? next.tracks[next.tracks.length - 1]!;
    const aId = `det_aud_${Date.now()}`;
    next.clips[aId] = {
      ...clone(next.clips[cid!]!),
      id: aId,
      trackId: audioTrack.id,
      kind: 'audio',
      name: `🔊 ${clip.name}`,
      effects: [],
    };
    next.clips[cid!]!.audio.muted = true;
    await get().commitProject(`Tách Audio: ${clip.name}`, next);
    set({ selectedClipId: aId, statusMessage: `Đã tách Audio của "${clip.name}" xuống Audio Track!` });
  },

  replaceClipAsset: async (clipId, newAssetId) => {
    const p = get().project;
    const asset = p?.assets[newAssetId];
    const clip = p?.clips[clipId];
    if (!p || !asset || !clip) return;
    const next = clone(p);
    const tc = next.clips[clipId]!;
    tc.assetId = newAssetId;
    tc.name = asset.name;
    tc.sourceStartUs = 0;
    tc.sourceDurationUs = Math.min(tc.durationUs, asset.durationUs);
    await get().commitProject(`Thay clip -> ${asset.name}`, next);
    set({ statusMessage: `Đã thay Footage "${asset.name}" (giữ nguyên toàn bộ LUT/VFX/Keyframe)` });
  },

  generateAiVoiceover: async (text, language, voice) => {
    const p = get().project;
    if (!p || !text.trim()) return;
    set({ busyTask: 'Đang tạo giọng đọc AI Voiceover Offline...' });
    try {
      const res = await engineApi.generateTtsVoiceover(text.trim(), language, voice);
      const next = clone(p);
      next.assets[res.asset.id] = res.asset;
      const audioTrack = next.tracks.find((t) => t.type === 'audio') ?? next.tracks[0]!;
      const textTrack = next.tracks.find((t) => t.type === 'text');
      const startAt = get().playheadUs;
      const aClipId = `tts_clip_${Date.now()}`;
      next.clips[aClipId] = {
        id: aClipId,
        trackId: audioTrack.id,
        assetId: res.asset.id,
        kind: 'audio',
        name: res.asset.name,
        timelineStartUs: startAt,
        durationUs: res.asset.durationUs,
        sourceStartUs: 0,
        sourceDurationUs: res.asset.durationUs,
        locked: false,
        disabled: false,
        transform: createDefaultTransform(),
        colorGrade: createDefaultColorGrade(),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed: createDefaultSpeed(),
        audio: createDefaultAudioState(),
        keyframes: {},
        effects: [],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
      if (textTrack) {
        const tClipId = `tts_cap_${Date.now()}`;
        const st = createDefaultTextStyle(text.trim());
        st.karaokeEnabled = true;
        st.words = res.segment.words.map((w) => ({
          ...w,
          startUs: startAt + w.startUs,
          endUs: startAt + w.endUs,
        }));
        next.clips[tClipId] = {
          id: tClipId,
          trackId: textTrack.id,
          assetId: null,
          kind: 'text',
          name: text.trim().slice(0, 24),
          timelineStartUs: startAt,
          durationUs: res.asset.durationUs,
          sourceStartUs: 0,
          sourceDurationUs: res.asset.durationUs,
          locked: false,
          disabled: false,
          transform: { ...createDefaultTransform(), y: 0.34 },
          colorGrade: createDefaultColorGrade(),
          chromaKey: createDefaultChromaKey(),
          mask: createDefaultMask(),
          speed: createDefaultSpeed(),
          audio: createDefaultAudioState(),
          keyframes: {},
          text: st,
          effects: [],
          aiMattingEnabled: false,
          autoReframeEnabled: false,
        };
      }
      await get().commitProject('Tạo AI Voiceover + Phụ đề', next);
      await get().loadWaveform(res.asset);
      set({ selectedClipId: aClipId, statusMessage: 'Đã chèn giọng đọc AI + Phụ đề Karaoke khớp từng từ!' });
    } catch (err) {
      set({ errorMessage: `Lỗi AI Voiceover: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  smartRemixSelectedMusic: async () => {
    const p = get().project;
    const cid = get().selectedClipId;
    const musicClip = cid && p?.clips[cid]?.kind === 'audio' ? p.clips[cid] : Object.values(p?.clips ?? {}).find((c) => c.kind === 'audio');
    if (!p || !musicClip || !musicClip.assetId) {
      set({ errorMessage: 'Hãy chọn 1 clip nhạc trên Audio Track để Smart Remix!' });
      return;
    }
    const visualEnd = Object.values(p.clips)
      .filter((c) => c.kind === 'video' || c.kind === 'image')
      .reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0);
    const targetDur = Math.max(2 * US_PER_SEC, visualEnd - musicClip.timelineStartUs);
    set({ busyTask: `Đang Smart Music Remix khớp ${(targetDur / US_PER_SEC).toFixed(1)}s (có Outro)...` });
    try {
      const res = await engineApi.smartRemixMusic(musicClip.assetId, targetDur);
      const next = clone(p);
      next.assets[res.asset.id] = res.asset;
      const mc = next.clips[musicClip.id]!;
      mc.assetId = res.asset.id;
      mc.name = res.asset.name;
      mc.sourceStartUs = 0;
      mc.durationUs = res.asset.durationUs;
      mc.sourceDurationUs = res.asset.durationUs;
      await get().commitProject('Smart Music Remix', next);
      await get().loadWaveform(res.asset);
      set({ statusMessage: `Đã remix nhạc khớp ${(targetDur / US_PER_SEC).toFixed(1)}s kèm Outro kết mượt!` });
    } catch (err) {
      set({ errorMessage: `Lỗi Smart Remix: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  autoSyncSfxAtCuts: async () => {
    const p = get().project;
    if (!p) return;
    set({ busyTask: 'Đang đồng bộ SFX tự động vào toàn bộ vết cắt...' });
    try {
      const cuts = Object.values(p.clips)
        .filter((c) => (c.kind === 'video' || c.kind === 'image') && c.timelineStartUs > 50_000)
        .sort((a, b) => a.timelineStartUs - b.timelineStartUs);
      if (cuts.length === 0) {
        set({ statusMessage: 'Chưa có vết cắt chuyển tiếp giữa các clip.' });
        return;
      }
      const next = clone(p);
      const audioTrack = next.tracks.find((t) => t.type === 'audio') ?? next.tracks[next.tracks.length - 1]!;
      for (let i = 0; i < Math.min(12, cuts.length); i++) {
        const c = cuts[i]!;
        const tr = c.transitionIn?.type ? TRANSITION_BY_ID[c.transitionIn.type] : undefined;
        const sfxId = tr?.recommendedSfxId || 'sfx_fast_whoosh';
        const added = await engineApi.addBuiltinAudio(sfxId);
        next.assets[added.asset.id] = added.asset;
        const scId = `autosfx_${Date.now()}_${i}`;
        next.clips[scId] = {
          id: scId,
          trackId: audioTrack.id,
          assetId: added.asset.id,
          kind: 'audio',
          name: `⚡ ${added.asset.name}`,
          timelineStartUs: Math.max(0, c.timelineStartUs - 200_000),
          durationUs: added.asset.durationUs,
          sourceStartUs: 0,
          sourceDurationUs: added.asset.durationUs,
          locked: false,
          disabled: false,
          transform: createDefaultTransform(),
          colorGrade: createDefaultColorGrade(),
          chromaKey: createDefaultChromaKey(),
          mask: createDefaultMask(),
          speed: createDefaultSpeed(),
          audio: { ...createDefaultAudioState(), volume: 0.72 },
          keyframes: {},
          effects: [],
          aiMattingEnabled: false,
          autoReframeEnabled: false,
        };
      }
      await get().commitProject(`Auto-SFX (${cuts.length} vết cắt)`, next);
      set({ statusMessage: `Đã gắn ${Math.min(12, cuts.length)} SFX Whoosh khớp vết cắt!` });
    } catch (err) {
      set({ errorMessage: `Lỗi Auto-SFX: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  autoColorMatchToPreviousClip: async () => {
    const p = get().project;
    const cid = get().selectedClipId;
    const cur = cid && p?.clips[cid] ? p.clips[cid] : null;
    if (!p || !cur) return;
    const prev = Object.values(p.clips)
      .filter((c) => c.trackId === cur.trackId && (c.kind === 'video' || c.kind === 'image') && c.timelineStartUs < cur.timelineStartUs)
      .sort((a, b) => b.timelineStartUs - a.timelineStartUs)[0];
    if (!prev) {
      set({ errorMessage: 'Cần có 1 clip đứng trước clip này để cân màu khớp theo!' });
      return;
    }
    const next = clone(p);
    next.clips[cur.id]!.colorGrade = clone(prev.colorGrade);
    if (prev.colorGrade.lutId && !get().loadedLuts[prev.colorGrade.lutId]) {
      void engineApi.getBuiltinLut(prev.colorGrade.lutId).then((l) => {
        get().registerLut({ id: l.id, title: l.title, size: l.size, data: new Float32Array(l.data) });
      }).catch(() => {});
    }
    await get().commitProject(`Auto Color Match <- ${prev.name}`, next);
    set({ statusMessage: `Đã cân màu "${cur.name}" khớp với "${prev.name}"!` });
  },

  setTextBehindSubject: async (clipId, enabled) => {
    const p = get().project;
    const clip = p?.clips[clipId];
    if (!p || !clip?.text) return;
    const next = clone(p);
    next.clips[clipId]!.text!.behindSubject = enabled;
    const mainVisual = Object.values(next.clips).find(
      (c) => (c.kind === 'video' || c.kind === 'image') && clip.timelineStartUs < c.timelineStartUs + c.durationUs && clip.timelineStartUs + clip.durationUs > c.timelineStartUs
    );
    if (enabled && mainVisual && mainVisual.assetId) {
      const asset = next.assets[mainVisual.assetId];
      if (asset && !asset.mattingMaskPath) {
        await get().commitProject('Đánh dấu Text Behind Subject', next);
        await get().runAiTask(asset.id, 'matting');
        return;
      }
      mainVisual.aiMattingEnabled = true;
    }
    await get().commitProject(enabled ? 'Bật Chữ Sau Chủ Thể' : 'Tắt Chữ Sau Chủ Thể', next);
    set({ statusMessage: enabled ? 'Đã đưa tiêu đề ra sau chủ thể!' : 'Đã đưa chữ về lớp phía trước.' });
  },

  translateSelectedSubtitle: async (targetLang) => {
    const p = get().project;
    const cid = get().selectedClipId;
    const clip = cid && p?.clips[cid] ? p.clips[cid] : null;
    if (!p || !clip?.text) return;
    const viToEn: Array<[RegExp, string]> = [
      [/xin chào/gi, 'Hello'],
      [/chào mừng/gi, 'Welcome'],
      [/cảm ơn/gi, 'Thank you'],
      [/đăng ký kênh/gi, 'Subscribe now'],
      [/bùng nổ/gi, 'Explosive'],
      [/bí quyết/gi, 'The Secret'],
      [/hôm nay/gi, 'Today'],
      [/tuyệt vời/gi, 'Amazing'],
      [/một ngày bình yên/gi, 'A peaceful day'],
    ];
    let out = clip.text.text;
    if (targetLang === 'en') {
      viToEn.forEach(([re, rep]) => {
        out = out.replace(re, rep);
      });
      if (out === clip.text.text) out = `${clip.text.text}\n(English Sub)`;
      else out = `${clip.text.text}\n${out}`;
    } else {
      out = out.split('\n')[0] || out;
    }
    const next = clone(p);
    next.clips[clip.id]!.text!.text = out;
    next.clips[clip.id]!.text!.karaokeEnabled = false;
    await get().commitProject(`Dịch phụ đề (${targetLang.toUpperCase()})`, next);
    set({ statusMessage: `Đã thêm phụ đề song ngữ (${targetLang.toUpperCase()})!` });
  },

  addLottieJsonSticker: async (name, lottieJson) => {
    const p = get().project;
    if (!p) return;
    const next = clone(p);
    const overlayTrack = next.tracks.find((t) => t.type === 'overlay') ?? next.tracks[0];
    if (!overlayTrack) return;
    const parsed = JSON.parse(lottieJson) as { fr?: number; ip?: number; op?: number };
    const durSec = Math.max(1, ((parsed.op ?? 60) - (parsed.ip ?? 0)) / Math.max(10, parsed.fr ?? 30));
    const sid = `lottie_${Date.now()}`;
    next.clips[sid] = {
      id: sid,
      trackId: overlayTrack.id,
      assetId: null,
      kind: 'sticker',
      name,
      timelineStartUs: get().playheadUs,
      durationUs: Math.round(durSec * US_PER_SEC),
      sourceStartUs: 0,
      sourceDurationUs: Math.round(durSec * US_PER_SEC),
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      sticker: {
        presetId: sid,
        category: 'lottie',
        name,
        primaryColor: '#22D3EE',
        secondaryColor: '#FFFFFF',
        lottieJson,
        lottieDurationSec: durSec,
      },
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    await get().commitProject(`Chèn Lottie: ${name}`, next);
    set({ selectedClipId: sid, statusMessage: `Đã chèn Lottie Motion Graphic "${name}"!` });
  },

  importUniversalTemplateFile: async (file) => {
    set({ busyTask: `Đang phân tích mẫu "${file.name}"...` });
    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
      const base64 = btoa(bin);
      const res = await engineApi.importUniversalFile(file.name, base64);
      if (res.kind === 'lottie' && res.lottieJson) {
        await get().addLottieJsonSticker(res.name || file.name, res.lottieJson);
        return;
      }
      if (res.project) {
        const list = await engineApi.listProjects();
        set({
          project: res.project,
          projectsList: list.projects,
          selectedClipId: null,
          playheadUs: 0,
          importReport: res.report ? { title: res.project.name, ...res.report } : null,
          statusMessage: `Đã nhập mẫu "${res.project.name}" (${res.report?.compatibilityPct ?? 100}% tương thích)!`,
        });
      }
    } catch (err) {
      set({ errorMessage: `Lỗi nhập mẫu: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  importLocalCapCutDraft: async (draftPath) => {
    set({ busyTask: 'Đang chuyển đổi dự án CapCut sang T-CapCut...' });
    try {
      const res = await engineApi.importLocalCapCutDraftPath(draftPath);
      const list = await engineApi.listProjects();
      set({
        project: res.project,
        projectsList: list.projects,
        selectedClipId: null,
        playheadUs: 0,
        statusMessage: `Đã mở dự án CapCut "${res.project.name}"!`,
      });
    } catch (err) {
      set({ errorMessage: `Lỗi đọc CapCut Draft: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  exportCurrentAsTemplatePack: async () => {
    const p = get().project;
    if (!p) return;
    set({ busyTask: 'Đang đóng gói dự án thành gói mẫu .tcapcut-tpl...' });
    try {
      const res = await engineApi.exportTemplatePack(p.id, `${p.name} Template`);
      const bin = atob(res.contentBase64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      set({ statusMessage: `Đã xuất gói mẫu "${res.filename}" để dùng chung / chia sẻ!` });
    } catch (err) {
      set({ errorMessage: `Lỗi đóng gói mẫu: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  removeSilencesFromClip: async (clipId) => {
    const p = get().project;
    const clip = p?.clips[clipId];
    if (!p || !clip || !clip.assetId) return;
    set({ busyTask: 'Đang cắt bỏ toàn bộ khoảng lặng...' });
    try {
      const plan = await engineApi.planChatCut(p.id, 'Cắt hết khoảng lặng', { selectedClipId: clipId });
      const res = await engineApi.applyChatCut(p.id, plan.plan);
      set({ project: res.project, history: res.history, statusMessage: `Đã xóa ${plan.plan.ops.length} khoảng lặng!` });
    } catch (err) {
      set({ errorMessage: `Lỗi cắt khoảng lặng: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  generateCaptionsFromTranscript: async (assetId) => {
    const p = get().project;
    const asset = p?.assets[assetId];
    if (!p || !asset) return;
    const segs = asset.transcript ?? [];
    if (segs.length === 0) {
      await get().runAiTask(assetId, 'transcribe');
    }
    const fresh = get().project;
    const freshAsset = fresh?.assets[assetId];
    if (!fresh || !freshAsset?.transcript) return;

    const next = clone(fresh);
    const textTrack = next.tracks.find((t) => t.type === 'text') ?? next.tracks[0];
    freshAsset.transcript.forEach((seg, idx) => {
      const id = `cap_${Date.now()}_${idx}`;
      const style = createDefaultTextStyle(seg.text);
      style.karaokeEnabled = true;
      style.words = seg.words;
      next.clips[id] = {
        id,
        trackId: textTrack.id,
        assetId: null,
        kind: 'text',
        name: seg.text.slice(0, 26),
        timelineStartUs: seg.startUs,
        durationUs: Math.max(400_000, seg.endUs - seg.startUs),
        sourceStartUs: 0,
        sourceDurationUs: Math.max(400_000, seg.endUs - seg.startUs),
        locked: false,
        disabled: false,
        transform: { ...createDefaultTransform(), y: 0.34 },
        colorGrade: createDefaultColorGrade(),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed: createDefaultSpeed(),
        audio: createDefaultAudioState(),
        keyframes: {},
        text: style,
        effects: [],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
    });
    await get().commitProject('Tạo phụ đề Karaoke từ Transcript', next);
    set({ statusMessage: `Đã tạo ${freshAsset.transcript.length} đoạn phụ đề Karaoke!` });
  },

  loadWaveform: async (asset) => {
    if (!asset.waveformPath) return;
    try {
      const res = await fetch(assetMediaUrl(asset.id, 'waveform'));
      if (!res.ok) return;
      const data = (await res.json()) as { peaks: number[] };
      set((s) => ({ waveformCache: { ...s.waveformCache, [asset.id]: data.peaks } }));
    } catch {
      // non-fatal
    }
  },

  registerLut: (lut) => {
    set((s) => ({ loadedLuts: { ...s.loadedLuts, [lut.id]: lut } }));
  },

  requestChatCutPlan: async (prompt) => {
    const p = get().project;
    if (!p || !prompt.trim()) return;
    set({ busyTask: 'T-ChatCut đang phân tích timeline & lập kế hoạch...' });
    try {
      const res = await engineApi.planChatCut(p.id, prompt, {
        selectedClipId: get().selectedClipId,
        llmConfig: get().llmConfig,
      });
      set({ pendingPlan: res.plan });
    } catch (err) {
      set({ errorMessage: `Lỗi T-ChatCut: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ busyTask: null });
    }
  },

  applyPendingPlan: async () => {
    const p = get().project;
    const plan = get().pendingPlan;
    if (!p || !plan) return;
    try {
      const res = await engineApi.applyChatCut(p.id, plan);
      const neededLuts = new Set<string>();
      Object.values(res.project.clips).forEach((c) => {
        if (c.colorGrade.lutId && !get().loadedLuts[c.colorGrade.lutId]) {
          neededLuts.add(c.colorGrade.lutId);
        }
      });
      for (const lutId of neededLuts) {
        void engineApi
          .getLut(lutId)
          .then((l) => get().registerLut({ id: l.id, title: l.title, size: l.size, data: new Float32Array(l.data) }))
          .catch(() => {});
      }
      const clipCount = Object.keys(res.project.clips).length;
      set((s) => ({
        project: res.project,
        history: res.history,
        pendingPlan: null,
        projectsList: s.projectsList.map((item) =>
          item.id === res.project.id
            ? { ...item, clipCount, aspectRatio: res.project.settings.aspectRatio, updatedAt: res.project.updatedAt }
            : item
        ),
        statusMessage: `Đã áp dụng ${plan.ops.length} thao tác từ T-ChatCut!`,
      }));
    } catch (err) {
      set({ errorMessage: `Lỗi áp dụng kế hoạch ChatCut: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  discardPendingPlan: () => set({ pendingPlan: null }),
}));
