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

export type LeftPanelTab = 'media' | 'text' | 'effects' | 'transitions' | 'ai';
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
  addEffectClip: (shaderId: string, name: string, customFragmentGlsl?: string) => Promise<void>;
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
    task: 'silence' | 'scenes' | 'beats' | 'transcribe' | 'matting' | 'face-track'
  ) => Promise<void>;
  removeSilencesFromClip: (clipId: string) => Promise<void>;
  generateCaptionsFromTranscript: (assetId: string) => Promise<void>;
  loadWaveform: (asset: MediaAsset) => Promise<void>;
  registerLut: (lut: LoadedLutTexture) => void;

  requestChatCutPlan: (prompt: string) => Promise<void>;
  applyPendingPlan: () => Promise<void>;
  discardPendingPlan: () => void;
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
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

  init: async () => {
    try {
      const [health, list] = await Promise.all([engineApi.health(), engineApi.listProjects()]);
      set({ health, projectsList: list.projects });
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

  runAiTask: async (assetId, task) => {
    const p = get().project;
    if (!p) return;
    const labels: Record<typeof task, string> = {
      silence: 'Đang dò khoảng lặng bằng FFmpeg VAD...',
      scenes: 'Đang dò điểm chuyển cảnh (Scene Edit Detection)...',
      beats: 'Đang phân tích nhịp Beat âm thanh...',
      transcribe: 'Đang tạo phụ đề & transcript lời thoại...',
      matting: 'Apple Vision Neural Engine đang tách nền người...',
      'face-track': 'Apple Vision đang bám nét khuôn mặt Auto-Reframe 9:16...',
    };
    set({ busyTask: labels[task] });
    try {
      const res = await engineApi.analyzeAi<Record<string, unknown>>(p.id, assetId, task, 'vi');
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
      } else if (task === 'matting') {
        Object.values(next.clips)
          .filter((c) => c.assetId === assetId)
          .forEach((c) => {
            c.aiMattingEnabled = true;
          });
        await get().commitProject('Bật AI Person Matting', next);
        set({ statusMessage: 'Đã tách nền người bằng Apple Vision Neural Engine!' });
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
