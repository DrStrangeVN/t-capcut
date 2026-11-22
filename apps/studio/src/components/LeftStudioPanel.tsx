import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioWaveform,
  Bot,
  Captions,
  CheckCircle2,
  Code2,
  Download,
  FileJson,
  Film,
  Layers,
  LayoutTemplate,
  Music,
  PackagePlus,
  Palette,
  Pause,
  Play,
  Plus,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sticker,
  Subtitles,
  Trash2,
  Upload,
  UserCheck,
  Wand2,
} from 'lucide-react';
import { US_PER_SEC } from '@t-capcut/schema';
import {
  AUDIO_MUSIC_CATALOG,
  AUDIO_MUSIC_CATEGORIES,
  AUDIO_SFX_CATALOG,
  AUDIO_SFX_CATEGORIES,
  LUT_CATEGORIES,
  LUTS_CATALOG,
  STICKER_CATEGORIES,
  STICKERS_CATALOG,
  TEMPLATE_CATEGORIES,
  TEXT_CATALOG,
  TEXT_CATEGORIES,
  TRANSITION_CATEGORIES,
  TRANSITIONS_CATALOG,
  VFX_CATALOG,
  VFX_CATEGORIES,
  VIDEO_TEMPLATES_CATALOG,
} from '@t-capcut/presets';
import { engineApi, presetAudioStreamUrl } from '../engine/api';
import { useEditorStore, type LeftPanelTab } from '../store/useEditorStore';

const TABS: Array<{ id: LeftPanelTab; label: string; icon: React.ReactNode }> = [
  { id: 'media', label: 'Media', icon: <Film size={12} /> },
  { id: 'audio', label: 'Audio', icon: <Music size={12} /> },
  { id: 'text', label: 'Text', icon: <Subtitles size={12} /> },
  { id: 'captions', label: 'Captions', icon: <Captions size={12} /> },
  { id: 'stickers', label: 'Stickers', icon: <Sticker size={12} /> },
  { id: 'effects', label: 'Effects', icon: <Sparkles size={12} /> },
  { id: 'transitions', label: 'Trans 32', icon: <Layers size={12} /> },
  { id: 'luts', label: 'Filters 16', icon: <Palette size={12} /> },
  { id: 'adjustment', label: 'Adjust', icon: <SlidersHorizontal size={12} /> },
  { id: 'templates', label: 'Mẫu 24+', icon: <LayoutTemplate size={12} /> },
  { id: 'ai', label: 'AI Lab', icon: <Bot size={12} /> },
];

const BODY_FX_IDS = ['subject_neon_glow', 'hologram_scan', 'neon_edge', 'chromatic', 'beat_pulse', 'speed_lines'];

const ADJUSTMENT_PRESETS = [
  { id: 'adj_warm_cine', name: 'Warm Cinema Layer', desc: 'Nhiệt ấm + tương phản phim rạp', grade: { contrast: 0.22, temperature: 0.25, vibrance: 0.16, vignette: 0.2 } },
  { id: 'adj_moody_teal', name: 'Moody Teal Layer', desc: 'Xanh lạnh phim đêm hiện đại', grade: { contrast: 0.28, temperature: -0.24, saturation: -0.1, vignette: 0.25 } },
  { id: 'adj_high_contrast', name: 'High Contrast Punch', desc: 'Sắc nét & độ tương phản mạnh', grade: { contrast: 0.35, sharpness: 0.3, saturation: 0.15 } },
  { id: 'adj_vivid_vlog', name: 'Vivid Vlog Bright', desc: 'Sáng trong rực rỡ cho Vlog / Food', grade: { brightness: 0.14, contrast: 0.12, vibrance: 0.34, saturation: 0.16 } },
  { id: 'adj_clean_bright', name: 'Studio Clean Bright', desc: 'Ánh sáng đều cho Tech Review', grade: { exposure: 0.15, brightness: 0.12, shadows: 0.22, sharpness: 0.2 } },
  { id: 'adj_noir_bw', name: 'Classic Noir B&W', desc: 'Đen trắng nghệ thuật Leica', grade: { saturation: -1, contrast: 0.38, vignette: 0.35 } },
];

const DEFAULT_CUSTOM_GLSL = `vec4 effectMain(sampler2D tex, vec2 uv, float time, float intensity) {
  float wave = sin(uv.y * 18.0 + time * 5.0) * 0.012 * intensity;
  vec4 c = texture(tex, uv + vec2(wave, 0.0));
  c.rgb = mix(c.rgb, c.rgb * vec3(0.85, 1.05, 1.2), intensity * 0.55);
  return c;
}`;

interface LeftStudioPanelProps {
  widthPx?: number;
}

export const LeftStudioPanel: React.FC<LeftStudioPanelProps> = ({ widthPx = 324 }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const lutInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const packInputRef = useRef<HTMLInputElement | null>(null);
  const lottieInputRef = useRef<HTMLInputElement | null>(null);
  const univTplInputRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const leftTab = useEditorStore((s) => s.leftTab);
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const health = useEditorStore((s) => s.health);
  const favoritePresetIds = useEditorStore((s) => s.favoritePresetIds);
  const loadedLuts = useEditorStore((s) => s.loadedLuts);
  const objectSegmentMode = useEditorStore((s) => s.objectSegmentMode);

  const setLeftTab = useEditorStore((s) => s.setLeftTab);
  const createDemoSample = useEditorStore((s) => s.createDemoSample);
  const uploadMediaFile = useEditorStore((s) => s.uploadMediaFile);
  const importMediaPath = useEditorStore((s) => s.importMediaPath);
  const importCapCutDraftFile = useEditorStore((s) => s.importCapCutDraftFile);
  const addAssetToTimeline = useEditorStore((s) => s.addAssetToTimeline);
  const addTextPresetClip = useEditorStore((s) => s.addTextPresetClip);
  const applyKaraokeStyleAll = useEditorStore((s) => s.applyKaraokeStyleAll);
  const addStickerClip = useEditorStore((s) => s.addStickerClip);
  const addEffectClip = useEditorStore((s) => s.addEffectClip);
  const addVfxPreset = useEditorStore((s) => s.addVfxPreset);
  const setClipTransition = useEditorStore((s) => s.setClipTransition);
  const applyBuiltinLut = useEditorStore((s) => s.applyBuiltinLut);
  const addBuiltinAudioToTimeline = useEditorStore((s) => s.addBuiltinAudioToTimeline);
  const toggleFavoritePreset = useEditorStore((s) => s.toggleFavoritePreset);
  const setTemplateModalPreset = useEditorStore((s) => s.setTemplateModalPreset);
  const setTemplateHubOpen = useEditorStore((s) => s.setTemplateHubOpen);
  const addAdjustmentLayerClip = useEditorStore((s) => s.addAdjustmentLayerClip);
  const autoColorMatchToPreviousClip = useEditorStore((s) => s.autoColorMatchToPreviousClip);
  const translateSelectedSubtitle = useEditorStore((s) => s.translateSelectedSubtitle);
  const detachAudioFromClip = useEditorStore((s) => s.detachAudioFromClip);
  const importLocalPresetPack = useEditorStore((s) => s.importLocalPresetPack);
  const runAiTask = useEditorStore((s) => s.runAiTask);
  const removeSilencesFromClip = useEditorStore((s) => s.removeSilencesFromClip);
  const generateCaptionsFromTranscript = useEditorStore((s) => s.generateCaptionsFromTranscript);
  const deleteTranscriptSegmentFromVideo = useEditorStore((s) => s.deleteTranscriptSegmentFromVideo);
  const downloadWhisperModel = useEditorStore((s) => s.downloadWhisperModel);
  const registerLut = useEditorStore((s) => s.registerLut);
  const setPlayheadUs = useEditorStore((s) => s.setPlayheadUs);
  const commitProject = useEditorStore((s) => s.commitProject);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);
  const setErrorMessage = useEditorStore((s) => s.setErrorMessage);
  const setHoverPreview = useEditorStore((s) => s.setHoverPreview);
  const setObjectSegmentMode = useEditorStore((s) => s.setObjectSegmentMode);
  const smartRemixSelectedMusic = useEditorStore((s) => s.smartRemixSelectedMusic);
  const autoSyncSfxAtCuts = useEditorStore((s) => s.autoSyncSfxAtCuts);
  const addLottieJsonSticker = useEditorStore((s) => s.addLottieJsonSticker);
  const generateAiVoiceover = useEditorStore((s) => s.generateAiVoiceover);
  const importUniversalTemplateFile = useEditorStore((s) => s.importUniversalTemplateFile);
  const importLocalCapCutDraft = useEditorStore((s) => s.importLocalCapCutDraft);
  const exportCurrentAsTemplatePack = useEditorStore((s) => s.exportCurrentAsTemplatePack);

  const [localPathInput, setLocalPathInput] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [customGlsl, setCustomGlsl] = useState(DEFAULT_CUSTOM_GLSL);
  const [showShaderEditor, setShowShaderEditor] = useState(false);
  const [ttsText, setTtsText] = useState('');
  const [ttsLang, setTtsLang] = useState<'vi' | 'en'>('vi');
  const [localCapCutDrafts, setLocalCapCutDrafts] = useState<Array<{ name: string; draftPath: string; modifiedAt: number }>>([]);

  // Creative search + category filters + preview state
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [audioSubTab, setAudioSubTab] = useState<'music' | 'sfx' | 'extract' | 'tts'>('music');
  const [effectSubTab, setEffectSubTab] = useState<'video' | 'body'>('video');
  const [audioCat, setAudioCat] = useState<string>('all');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [textCat, setTextCat] = useState<string>('all');
  const [stickerCat, setStickerCat] = useState<string>('all');
  const [vfxCat, setVfxCat] = useState<string>('all');
  const [hoveredVfxId, setHoveredVfxId] = useState<string | null>(null);
  const [transCat, setTransCat] = useState<string>('all');
  const [transWithSfx, setTransWithSfx] = useState(true);
  const [lutCat, setLutCat] = useState<string>('all');
  const [tplCat, setTplCat] = useState<string>('all');

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
    };
  }, []);

  const toggleAudioPreview = (id: string, filename: string) => {
    const existing = previewAudioRef.current;
    if (playingAudioId === id && existing) {
      existing.pause();
      setPlayingAudioId(null);
      return;
    }
    if (existing) existing.pause();
    const audio = new Audio(presetAudioStreamUrl(filename));
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => {
      setPlayingAudioId(null);
      setErrorMessage(`Không phát được file ${filename}`);
    };
    previewAudioRef.current = audio;
    setPlayingAudioId(id);
    void audio.play().catch(() => setPlayingAudioId(null));
  };

  const assets = project ? Object.values(project.assets) : [];
  const activeAsset = (selectedAssetId && project?.assets[selectedAssetId]) || assets[0] || null;
  const selectedClip = project && selectedClipId ? project.clips[selectedClipId] : null;
  const q = searchQuery.trim().toLowerCase();

  const matchesSearch = (id: string, name: string, desc = '') => {
    if (onlyFavorites && !favoritePresetIds.includes(id)) return false;
    if (!q) return true;
    return name.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || id.toLowerCase().includes(q);
  };

  const handleNativeImportClick = async () => {
    const native = (window as unknown as {
      tcapcutNative?: { pickLocalFiles?: () => Promise<string[]> };
    }).tcapcutNative;

    if (native?.pickLocalFiles) {
      const paths = await native.pickLocalFiles();
      for (const p of paths) await importMediaPath(p);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportPackFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const luts: Array<{ filename: string; content: string }> = [];
    const audioFiles: Array<{ filename: string; base64: string }> = [];
    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.cube')) {
        luts.push({ filename: file.name, content: await file.text() });
      } else if (/\.(m4a|mp3|wav)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
        audioFiles.push({ filename: file.name, base64: btoa(bin) });
      }
    }
    if (luts.length === 0 && audioFiles.length === 0) {
      setErrorMessage('Hãy chọn các file .cube (LUT) hoặc .m4a/.mp3/.wav (Audio)');
      return;
    }
    await importLocalPresetPack({ packName: `Pack (${luts.length + audioFiles.length} items)`, luts, audioFiles });
  };

  const showLibraryFilter = leftTab !== 'media' && leftTab !== 'ai' && leftTab !== 'adjustment' && leftTab !== 'captions';

  const renderFavBtn = (id: string) => {
    const isFav = favoritePresetIds.includes(id);
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleFavoritePreset(id);
        }}
        title="Lưu vào Yêu thích"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          color: isFav ? '#facc15' : 'rgba(255,255,255,0.35)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Star size={12} fill={isFav ? '#facc15' : 'none'} />
      </button>
    );
  };

  const catPillStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 8px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: active ? 700 : 500,
    border: active ? '1px solid rgba(34,211,238,0.5)' : '1px solid rgba(255,255,255,0.1)',
    background: active ? 'rgba(34,211,238,0.16)' : 'rgba(255,255,255,0.04)',
    color: active ? '#67e8f9' : 'var(--text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const filteredMusic = useMemo(
    () => AUDIO_MUSIC_CATALOG.filter((m) => (audioCat === 'all' || m.category === audioCat) && matchesSearch(m.id, m.name, m.desc)),
    [audioCat, q, onlyFavorites, favoritePresetIds]
  );
  const filteredSfx = useMemo(
    () => AUDIO_SFX_CATALOG.filter((s) => (audioCat === 'all' || s.category === audioCat) && matchesSearch(s.id, s.name, s.desc)),
    [audioCat, q, onlyFavorites, favoritePresetIds]
  );
  const filteredText = useMemo(
    () => TEXT_CATALOG.filter((t) => (textCat === 'all' || t.category === textCat) && matchesSearch(t.id, t.name, t.desc)),
    [textCat, q, onlyFavorites, favoritePresetIds]
  );
  const filteredStickers = useMemo(
    () => STICKERS_CATALOG.filter((s) => (stickerCat === 'all' || s.category === stickerCat) && matchesSearch(s.id, s.name, s.desc)),
    [stickerCat, q, onlyFavorites, favoritePresetIds]
  );
  const filteredVfx = useMemo(
    () => VFX_CATALOG.filter((v) => (vfxCat === 'all' || v.category === vfxCat) && matchesSearch(v.id, v.name, v.desc)),
    [vfxCat, q, onlyFavorites, favoritePresetIds]
  );
  const filteredTrans = useMemo(
    () => TRANSITIONS_CATALOG.filter((t) => (transCat === 'all' || t.category === transCat) && matchesSearch(t.id, t.name, t.desc)),
    [transCat, q, onlyFavorites, favoritePresetIds]
  );
  const filteredLuts = useMemo(
    () => LUTS_CATALOG.filter((l) => (lutCat === 'all' || l.category === lutCat) && matchesSearch(l.id, l.title, l.desc)),
    [lutCat, q, onlyFavorites, favoritePresetIds]
  );
  const filteredTpls = useMemo(
    () => VIDEO_TEMPLATES_CATALOG.filter((t) => (tplCat === 'all' || t.category === tplCat) && matchesSearch(t.id, t.name, t.desc)),
    [tplCat, q, onlyFavorites, favoritePresetIds]
  );

  return (
    <div className="nle-content-surface" style={{ width: widthPx, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', flexShrink: 0 }}>
      {/* Two-row compact CapCut Desktop Studio Rail (11 libraries cleanly accessible) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, padding: '8px 8px 3px' }}>
        {TABS.slice(0, 6).map((t) => (
          <button
            key={t.id}
            data-tab={t.id}
            className={`glass-btn ${leftTab === t.id ? 'glass-btn-active' : ''}`}
            style={{ padding: '5px 2px', fontSize: 9.5, flexDirection: 'column', gap: 2, minWidth: 0 }}
            onClick={() => {
              setLeftTab(t.id);
              setSearchQuery('');
            }}
          >
            {t.icon}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{t.label}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3, padding: '0 8px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.slice(6).map((t) => (
          <button
            key={t.id}
            data-tab={t.id}
            className={`glass-btn ${leftTab === t.id ? 'glass-btn-active' : ''}`}
            style={{ padding: '5px 2px', fontSize: 9.5, flexDirection: 'column', gap: 2, minWidth: 0 }}
            onClick={() => {
              setLeftTab(t.id);
              setSearchQuery('');
            }}
          >
            {t.icon}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Shared Search + ★ Favorites Bar for Preset Tabs */}
      {showLibraryFilter && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px 2px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', opacity: 0.55 }} />
            <input
              className="glass-input"
              style={{ paddingLeft: 26, fontSize: 11.5 }}
              placeholder="Tìm hiệu ứng, mẫu, LUT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className={`glass-btn ${onlyFavorites ? 'glass-btn-active' : ''}`}
            style={{ padding: '6px 8px' }}
            title="Lọc mục Yêu thích (★)"
            onClick={() => setOnlyFavorites(!onlyFavorites)}
          >
            <Star size={12} color={onlyFavorites ? '#facc15' : '#94a3b8'} fill={onlyFavorites ? '#facc15' : 'none'} />
          </button>
        </div>
      )}

      <div className="glass-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {/* ======================== MEDIA TAB ======================== */}
        {leftTab === 'media' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="glass-btn glass-btn-primary" onClick={() => void handleNativeImportClick()}>
                <Upload size={13} /> Nhập File
              </button>
              <button className="glass-btn" onClick={() => void createDemoSample()}>
                <Sparkles size={13} color="#22d3ee" /> Video Mẫu
              </button>
            </div>
            <button className="glass-btn" onClick={() => draftInputRef.current?.click()}>
              <FileJson size={13} color="#fbbf24" /> Mở CapCut draft_content.json
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*,image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadMediaFile(file);
                e.target.value = '';
              }}
            />
            <input
              ref={draftInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const json = JSON.parse(await file.text());
                await importCapCutDraftFile(json);
                e.target.value = '';
              }}
            />

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="glass-input"
                placeholder="Hoặc dán đường dẫn file Mac (/Users/...)"
                value={localPathInput}
                onChange={(e) => setLocalPathInput(e.target.value)}
              />
              <button
                className="glass-btn"
                onClick={() => {
                  if (localPathInput.trim()) {
                    void importMediaPath(localPathInput.trim());
                    setLocalPathInput('');
                  }
                }}
              >
                Load
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              Thư viện Tư liệu ({assets.length}) — Kéo thả trực tiếp vào Timeline
            </div>

            {assets.length === 0 ? (
              <div style={{ padding: 18, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 12 }}>
                Chưa có tư liệu. Hãy bấm <strong>Video Mẫu</strong> để trải nghiệm ngay hoặc kéo file từ Finder vào Timeline.
              </div>
            ) : (
              assets.map((a) => (
                <div
                  key={a.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-tcapcut-asset', JSON.stringify(a));
                  }}
                  onClick={() => setSelectedAssetId(a.id)}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: activeAsset?.id === a.id ? 'rgba(34, 211, 238, 0.12)' : 'rgba(255,255,255,0.04)',
                    border: activeAsset?.id === a.id ? '1px solid rgba(34, 211, 238, 0.45)' : '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    cursor: 'grab',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </span>
                    <button
                      className="glass-btn glass-btn-primary"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void addAssetToTimeline(a);
                      }}
                    >
                      <Plus size={12} /> Timeline
                    </button>
                  </div>
                  <div className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
                    <span>{(a.durationUs / US_PER_SEC).toFixed(1)}s</span>
                    {a.width > 0 && <span>{a.width}×{a.height}</span>}
                    {a.proxyStatus === 'ready' && <span style={{ color: '#34d399' }}>● PROXY</span>}
                    {a.mattingMaskPath && <span style={{ color: '#22d3ee' }}>● MATTING</span>}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ======================== AUDIO & SFX TAB (4 SUB-TABS CAPCUT) ======================== */}
        {leftTab === 'audio' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              <button
                className={`glass-btn ${audioSubTab === 'music' ? 'glass-btn-active' : ''}`}
                style={{ fontSize: 10, padding: '6px 3px', justifyContent: 'center' }}
                onClick={() => {
                  setAudioSubTab('music');
                  setAudioCat('all');
                }}
              >
                Nhạc 15
              </button>
              <button
                className={`glass-btn ${audioSubTab === 'sfx' ? 'glass-btn-active' : ''}`}
                style={{ fontSize: 10, padding: '6px 3px', justifyContent: 'center' }}
                onClick={() => {
                  setAudioSubTab('sfx');
                  setAudioCat('all');
                }}
              >
                SFX 40
              </button>
              <button
                className={`glass-btn ${audioSubTab === 'extract' ? 'glass-btn-active' : ''}`}
                style={{ fontSize: 10, padding: '6px 3px', justifyContent: 'center' }}
                onClick={() => setAudioSubTab('extract')}
              >
                Tách âm
              </button>
              <button
                className={`glass-btn ${audioSubTab === 'tts' ? 'glass-btn-active' : ''}`}
                style={{ fontSize: 10, padding: '6px 3px', justifyContent: 'center' }}
                onClick={() => setAudioSubTab('tts')}
              >
                TTS AI
              </button>
            </div>

            {audioSubTab === 'extract' ? (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#67e8f9' }}>Tách &amp; Xử Lý Âm Thanh Từ Video</div>
                <button className="glass-btn glass-btn-primary" disabled={!selectedClip} onClick={() => selectedClip && void detachAudioFromClip(selectedClip.id)}>
                  <Scissors size={12} /> Tách Âm Thanh (Detach Audio) Clip Đang Chọn
                </button>
                <button className="glass-btn" disabled={!activeAsset} onClick={() => activeAsset && void runAiTask(activeAsset.id, 'stem-separate')}>
                  <Music size={12} color="#34d399" /> Tách Riêng Vocals &amp; Beat Nhạc (AI Stems)
                </button>
                <button className="glass-btn" disabled={!activeAsset} onClick={() => activeAsset && void runAiTask(activeAsset.id, 'beats')}>
                  <AudioWaveform size={12} color="#fbbf24" /> Bắt Nhịp Beat Markers Tự Động
                </button>
                <button className="glass-btn" style={{ fontSize: 11 }} onClick={() => void smartRemixSelectedMusic()}>
                  <Sparkles size={12} color="#34d399" /> Smart Music Remix (Tự khớp Video + Outro)
                </button>
              </div>
            ) : audioSubTab === 'tts' ? (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#a78bfa' }}>Text-to-Speech Offline (Giọng đọc CapCut)</div>
                <textarea
                  className="glass-textarea"
                  rows={3}
                  placeholder="Nhập văn bản cần chuyển thành giọng đọc..."
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="glass-select" style={{ width: 125, fontSize: 11 }} value={ttsLang} onChange={(e) => setTtsLang(e.target.value as 'vi' | 'en')}>
                    <option value="vi">Tiếng Việt (Linh)</option>
                    <option value="en">English (US)</option>
                  </select>
                  <button
                    className="glass-btn glass-btn-primary"
                    style={{ flex: 1, fontSize: 11 }}
                    disabled={!ttsText.trim()}
                    onClick={() => void generateAiVoiceover(ttsText, ttsLang)}
                  >
                    Tạo Giọng Đọc + Phụ Đề
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button className="glass-btn" style={{ fontSize: 11 }} onClick={() => void smartRemixSelectedMusic()}>
                  <Sparkles size={12} color="#34d399" /> Smart Music Remix (Tự khớp Video + Outro)
                </button>

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(audioSubTab === 'music' ? AUDIO_MUSIC_CATEGORIES : AUDIO_SFX_CATEGORIES).map((c) => (
                    <button key={c.id} style={catPillStyle(audioCat === c.id)} onClick={() => setAudioCat(c.id)}>
                      {c.label}
                    </button>
                  ))}
                </div>

                {(audioSubTab === 'music' ? filteredMusic : filteredSfx).map((item) => {
                  const isPlaying = playingAudioId === item.id;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-tcapcut-preset', JSON.stringify({ kind: 'audio', preset: item }));
                      }}
                      style={{
                        padding: 9,
                        borderRadius: 12,
                        background: isPlaying ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255,255,255,0.04)',
                        border: isPlaying ? '1px solid rgba(52, 211, 153, 0.45)' : '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        cursor: 'grab',
                      }}
                    >
                      <button
                        className="glass-btn"
                        style={{ padding: '6px 7px', flexShrink: 0 }}
                        onClick={() => toggleAudioPreview(item.id, item.filename)}
                        title={isPlaying ? 'Dừng nghe thử' : 'Nghe thử offline'}
                      >
                        {isPlaying ? <Pause size={12} color="#34d399" /> : <Play size={12} color="#67e8f9" />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          {item.bpm > 0 && (
                            <span className="mono" style={{ fontSize: 9.5, color: '#facc15', background: 'rgba(250,204,21,0.14)', padding: '1px 6px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
                              {item.bpm} BPM
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.durationSec}s · {item.desc}
                        </div>
                      </div>
                      {renderFavBtn(item.id)}
                      <button className="glass-btn glass-btn-primary" style={{ padding: '5px 8px', fontSize: 11 }} onClick={() => void addBuiltinAudioToTimeline(item)}>
                        <Plus size={12} />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ======================== TEXT & KARAOKE TAB (25 TEMPLATES) ======================== */}
        {leftTab === 'text' && (
          <>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="glass-btn" style={{ flex: 1 }} onClick={() => srtInputRef.current?.click()}>
                <Upload size={12} /> Nhập .SRT
              </button>
              {activeAsset && (
                <button className="glass-btn" style={{ flex: 1 }} onClick={() => void generateCaptionsFromTranscript(activeAsset.id)}>
                  <Wand2 size={12} color="#fbbf24" /> Auto-Captions
                </button>
              )}
            </div>
            <input
              ref={srtInputRef}
              type="file"
              accept=".srt"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !project) return;
                const text = await file.text();
                const { segments } = await engineApi.parseSrt(text);
                const next = JSON.parse(JSON.stringify(project)) as typeof project;
                const targetAsset = activeAsset ?? Object.values(next.assets)[0];
                if (targetAsset) {
                  targetAsset.transcript = segments;
                  await commitProject('Import SRT Transcript', next);
                  await generateCaptionsFromTranscript(targetAsset.id);
                } else {
                  setStatusMessage(`Đã đọc ${segments.length} dòng SRT.`);
                }
                e.target.value = '';
              }}
            />

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {TEXT_CATEGORIES.map((c) => (
                <button key={c.id} style={catPillStyle(textCat === c.id)} onClick={() => setTextCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>

            {filteredText.map((preset) => (
              <div
                key={preset.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-tcapcut-preset', JSON.stringify({ kind: 'text', preset }));
                }}
                style={{
                  padding: 9,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  cursor: 'grab',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: preset.style.karaokeActiveColor || preset.style.color || '#fff' }}>
                      {preset.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{preset.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {renderFavBtn(preset.id)}
                    {preset.category === 'karaoke' && (
                      <button
                        className="glass-btn"
                        style={{ padding: '4px 6px', fontSize: 10 }}
                        title="Áp dụng phong cách Karaoke này cho tất cả phụ đề"
                        onClick={() => void applyKaraokeStyleAll(preset)}
                      >
                        Áp All
                      </button>
                    )}
                    <button className="glass-btn glass-btn-primary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => void addTextPresetClip(preset)}>
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ======================== CAPTIONS (PHỤ ĐỀ TỰ ĐỘNG & KARAOKE) ======================== */}
        {leftTab === 'captions' && (
          <>
            <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#67e8f9' }}>Tạo Phụ Đề &amp; Song Ngữ (Chuẩn CapCut Captions)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  className="glass-btn glass-btn-primary"
                  style={{ fontSize: 11 }}
                  disabled={!activeAsset}
                  onClick={() => activeAsset && void generateCaptionsFromTranscript(activeAsset.id)}
                >
                  <Wand2 size={12} /> Auto Captions
                </button>
                <button className="glass-btn" style={{ fontSize: 11 }} onClick={() => srtInputRef.current?.click()}>
                  <Upload size={12} /> Nhập .SRT / .ASS
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  className="glass-btn"
                  style={{ fontSize: 10.5 }}
                  disabled={!activeAsset}
                  onClick={() => activeAsset && void runAiTask(activeAsset.id, 'remove-fillers')}
                >
                  <Scissors size={11} color="#f59e0b" /> Xóa Từ Thừa
                </button>
                <button
                  className="glass-btn"
                  style={{ fontSize: 10.5 }}
                  disabled={selectedClip?.kind !== 'text'}
                  onClick={() => void translateSelectedSubtitle('en')}
                >
                  Dịch Song Ngữ VI/EN
                </button>
              </div>
              {!activeAsset && (
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Hãy nhập video hoặc tạo TTS để Auto-Captions nhận diện giọng nói.</div>
              )}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>Mẫu Phụ Đề Karaoke Viral (8 kiểu CapCut)</div>
            {TEXT_CATALOG.filter((p) => p.category === 'karaoke').map((preset) => (
              <div
                key={preset.id}
                style={{
                  padding: 9,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: preset.style.karaokeActiveColor || preset.style.color || '#fff' }}>{preset.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{preset.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="glass-btn" style={{ padding: '4px 7px', fontSize: 10.5 }} onClick={() => void applyKaraokeStyleAll(preset)}>
                    Áp All
                  </button>
                  <button className="glass-btn glass-btn-primary" style={{ padding: '4px 7px', fontSize: 10.5 }} onClick={() => void addTextPresetClip(preset)}>
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            ))}

            {activeAsset?.transcript && activeAsset.transcript.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#67e8f9' }}>Transcript Rough-Cut ({activeAsset.transcript.length} câu)</div>
                {activeAsset.transcript.slice(0, 12).map((seg) => (
                  <div
                    key={seg.id}
                    onClick={() => setPlayheadUs(seg.startUs)}
                    style={{
                      padding: 7,
                      borderRadius: 9,
                      background: 'rgba(255,255,255,0.04)',
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 6,
                    }}
                  >
                    <span>
                      <strong className="mono" style={{ fontSize: 9.5, color: '#22d3ee', marginRight: 6 }}>
                        {(seg.startUs / US_PER_SEC).toFixed(1)}s
                      </strong>
                      {seg.text}
                    </span>
                    <button
                      className="glass-btn"
                      style={{ padding: '2px 5px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteTranscriptSegmentFromVideo(seg.startUs, seg.endUs, seg.text);
                      }}
                    >
                      <Trash2 size={11} color="#fb7185" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ======================== STICKERS, LOTTIE & GPU PARTICLES TAB (30 PRESETS) ======================== */}
        {leftTab === 'stickers' && (
          <>
            <button className="glass-btn glass-btn-primary" style={{ fontSize: 11 }} onClick={() => lottieInputRef.current?.click()}>
              <Upload size={12} /> Nhập Lottie Motion (.json / .lottie)
            </button>
            <input
              ref={lottieInputRef}
              type="file"
              accept=".json,.lottie"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.name.endsWith('.lottie')) {
                  await importUniversalTemplateFile(file);
                } else {
                  const txt = await file.text();
                  await addLottieJsonSticker(file.name.replace(/\.json$/i, ''), txt);
                }
                e.target.value = '';
              }}
            />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {STICKER_CATEGORIES.map((c) => (
                <button key={c.id} style={catPillStyle(stickerCat === c.id)} onClick={() => setStickerCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {filteredStickers.map((stk) => (
                <div
                  key={stk.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-tcapcut-preset', JSON.stringify({ kind: 'sticker', preset: stk }));
                  }}
                  onClick={() => void addStickerClip(stk)}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 20 }}>{stk.previewEmoji}</span>
                    {renderFavBtn(stk.id)}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 700 }}>{stk.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{stk.desc}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ======================== VIDEO EFFECTS & BODY EFFECTS (48 SHADERS) ======================== */}
        {leftTab === 'effects' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                className={`glass-btn ${effectSubTab === 'video' ? 'glass-btn-active' : ''}`}
                style={{ fontSize: 11, padding: '6px' }}
                onClick={() => setEffectSubTab('video')}
              >
                ✨ Video Effects (48)
              </button>
              <button
                className={`glass-btn ${effectSubTab === 'body' ? 'glass-btn-active' : ''}`}
                style={{ fontSize: 11, padding: '6px' }}
                onClick={() => setEffectSubTab('body')}
              >
                🧍 Body Effects (6)
              </button>
            </div>

            {effectSubTab === 'video' && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {VFX_CATEGORIES.map((c) => (
                  <button key={c.id} style={catPillStyle(vfxCat === c.id)} onClick={() => setVfxCat(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
              {effectSubTab === 'body'
                ? 'Hiệu ứng viền / hào quang theo chủ thể (khuyên dùng kèm AI Tách nền trong Video → Remove BG).'
                : selectedClip && (selectedClip.kind === 'video' || selectedClip.kind === 'image')
                  ? `Đang chọn "${selectedClip.name}" — bấm + để xếp chồng Multi-FX GPU trên clip này`
                  : 'Bấm + để thả VFX Shader vào Effect Track (hỗ trợ xếp nhiều lớp đồng thời)'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(effectSubTab === 'body' ? VFX_CATALOG.filter((v) => BODY_FX_IDS.includes(v.id)) : filteredVfx).map((fx) => {
                const isHover = hoveredVfxId === fx.id;
                return (
                  <div
                    key={fx.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-tcapcut-preset', JSON.stringify({ kind: 'vfx', preset: fx }));
                    }}
                    onMouseEnter={() => {
                      setHoveredVfxId(fx.id);
                      setHoverPreview({ kind: 'vfx', id: fx.id, name: fx.name });
                    }}
                    onMouseLeave={() => {
                      setHoveredVfxId(null);
                      setHoverPreview(null);
                    }}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: isHover ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)',
                      border: isHover ? '1px solid rgba(34,211,238,0.5)' : '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'grab',
                      transition: 'transform 120ms ease, border-color 120ms ease',
                      transform: isHover ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        height: 36,
                        background: fx.previewGradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 8px',
                      }}
                    >
                      <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, background: 'rgba(0,0,0,0.48)', padding: '2px 5px', borderRadius: 4 }}>
                        #{fx.shaderIndex}
                      </span>
                      {renderFavBtn(fx.id)}
                    </div>
                    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700 }}>{fx.name}</div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', flex: 1 }}>{fx.desc}</div>
                      <button className="glass-btn glass-btn-primary" style={{ padding: '4px 6px', fontSize: 10.5 }} onClick={() => void addVfxPreset(fx)}>
                        <Plus size={11} /> Gắn VFX
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="glass-btn" onClick={() => setShowShaderEditor(!showShaderEditor)}>
              <Code2 size={13} color="#22d3ee" /> Custom GLSL Shader Plugin
            </button>
            {showShaderEditor && (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(34,211,238,0.35)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea className="glass-textarea mono" rows={6} style={{ fontSize: 10.5 }} value={customGlsl} onChange={(e) => setCustomGlsl(e.target.value)} />
                <button className="glass-btn glass-btn-primary" onClick={() => void addEffectClip('custom', 'Custom GLSL FX', customGlsl)}>
                  Chạy Shader Lên Timeline
                </button>
              </div>
            )}
          </>
        )}

        {/* ======================== TRANSITIONS 24 DUAL-TEXTURE TAB ======================== */}
        {leftTab === 'transitions' && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, padding: '6px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}>
              <input type="checkbox" checked={transWithSfx} onChange={(e) => setTransWithSfx(e.target.checked)} />
              <span>🔊 Tự chèn SFX Whoosh/Glitch đi kèm chuyển cảnh</span>
            </label>
            <button className="glass-btn" style={{ fontSize: 11 }} onClick={() => void autoSyncSfxAtCuts()}>
              <Sparkles size={12} color="#fbbf24" /> Auto-SFX Khớp Toàn Bộ Vết Cắt
            </button>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {TRANSITION_CATEGORIES.map((c) => (
                <button key={c.id} style={catPillStyle(transCat === c.id)} onClick={() => setTransCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
              Chọn 1 Clip (hoặc bấm nút [⊞] giữa 2 clip trên Timeline) rồi áp chuyển cảnh:
            </div>

            {filteredTrans.map((tr) => (
              <div
                key={tr.id}
                style={{
                  padding: 9,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{tr.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {(tr.defaultDurationUs / US_PER_SEC).toFixed(2)}s · {tr.desc}
                  </div>
                </div>
                {renderFavBtn(tr.id)}
                <button
                  className="glass-btn glass-btn-primary"
                  style={{ padding: '5px 9px', fontSize: 11 }}
                  disabled={!selectedClip}
                  onClick={() => selectedClip && void setClipTransition(selectedClip.id, tr.id, transWithSfx)}
                >
                  Áp dụng
                </button>
              </div>
            ))}
          </>
        )}

        {/* ======================== 3D LUTS & COLOR + PACK MANAGER TAB ======================== */}
        {leftTab === 'luts' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button className="glass-btn glass-btn-primary" style={{ fontSize: 11 }} onClick={() => lutInputRef.current?.click()}>
                <Upload size={12} /> Nạp .cube LUT
              </button>
              <button className="glass-btn" style={{ fontSize: 11 }} onClick={() => packInputRef.current?.click()}>
                <PackagePlus size={12} color="#a78bfa" /> Nhập Local Pack
              </button>
            </div>
            <input
              ref={packInputRef}
              type="file"
              multiple
              accept=".cube,.m4a,.mp3,.wav"
              style={{ display: 'none' }}
              onChange={async (e) => {
                await handleImportPackFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={lutInputRef}
              type="file"
              accept=".cube"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !project) return;
                try {
                  const content = await file.text();
                  const uploaded = await engineApi.uploadLut(content);
                  registerLut({
                    id: uploaded.id,
                    title: uploaded.title,
                    size: uploaded.size,
                    data: new Float32Array(uploaded.data),
                  });
                  const next = JSON.parse(JSON.stringify(project)) as typeof project;
                  next.luts = next.luts ?? {};
                  next.luts[uploaded.id] = { id: uploaded.id, title: uploaded.title, size: uploaded.size, filePath: uploaded.filePath };
                  if (selectedClipId && next.clips[selectedClipId]) {
                    next.clips[selectedClipId].colorGrade.lutId = uploaded.id;
                    next.clips[selectedClipId].colorGrade.lutName = uploaded.title;
                    next.clips[selectedClipId].colorGrade.lutIntensity = 0.85;
                  }
                  await commitProject(`Nạp 3D LUT ${uploaded.title}`, next);
                  setStatusMessage(`Đã lưu 3D LUT: ${uploaded.title} (${uploaded.size}³)`);
                } catch (err) {
                  setErrorMessage(`Lỗi nạp LUT: ${err instanceof Error ? err.message : String(err)}`);
                }
                e.target.value = '';
              }}
            />

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {LUT_CATEGORIES.map((c) => (
                <button key={c.id} style={catPillStyle(lutCat === c.id)} onClick={() => setLutCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {filteredLuts.map((lut) => {
                const isActive = selectedClip?.colorGrade.lutId === lut.id;
                return (
                  <div
                    key={lut.id}
                    onClick={() => void applyBuiltinLut(lut)}
                    onMouseEnter={() => {
                      if (!loadedLuts[lut.id]) {
                        void engineApi.getBuiltinLut(lut.id).then((d) => {
                          registerLut({ id: d.id, title: d.title, size: d.size, data: new Float32Array(d.data) });
                          setHoverPreview({ kind: 'lut', id: lut.id, name: lut.title });
                        }).catch(() => {});
                      } else {
                        setHoverPreview({ kind: 'lut', id: lut.id, name: lut.title });
                      }
                    }}
                    onMouseLeave={() => setHoverPreview(null)}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: isActive ? 'rgba(34,211,238,0.14)' : 'rgba(255,255,255,0.04)',
                      border: isActive ? '1.5px solid #22d3ee' : '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        height: 44,
                        background: lut.previewGradient,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        padding: 6,
                      }}
                    >
                      <span style={{ fontSize: 9.5, fontWeight: 700, background: 'rgba(0,0,0,0.45)', padding: '2px 5px', borderRadius: 4 }}>
                        17³ CUBE
                      </span>
                      {renderFavBtn(lut.id)}
                    </div>
                    <div style={{ padding: 8 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700 }}>{lut.title}</div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', marginTop: 2 }}>{lut.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ======================== ADJUSTMENT LAYERS (CAPCUT ADJUSTMENT) ======================== */}
        {leftTab === 'adjustment' && (
          <>
            <button className="glass-btn glass-btn-primary" onClick={() => void addAdjustmentLayerClip()}>
              <SlidersHorizontal size={13} /> + Tạo Custom Adjustment Layer
            </button>
            <button className="glass-btn" disabled={!selectedClip} onClick={() => void autoColorMatchToPreviousClip()}>
              <Wand2 size={13} color="#34d399" /> Auto Color Match Với Clip Trước
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              Thả Adjustment Layer lên Track trên để áp chỉnh màu đồng loạt cho mọi cảnh bên dưới:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {ADJUSTMENT_PRESETS.map((ap) => (
                <div
                  key={ap.id}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{ap.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{ap.desc}</div>
                  </div>
                  <button
                    className="glass-btn glass-btn-primary"
                    style={{ padding: '4px 9px', fontSize: 11 }}
                    onClick={() => void addAdjustmentLayerClip(ap.grade, ap.name)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ======================== 24 SMART VIDEO TEMPLATES + UNIVERSAL TEMPLATE HUB ======================== */}
        {leftTab === 'templates' && (
          <>
            <button
              className="glass-btn glass-btn-primary"
              style={{ justifyContent: 'center', padding: '9px 10px', fontWeight: 700 }}
              onClick={() => setTemplateHubOpen(true)}
            >
              <LayoutTemplate size={14} /> Mở Kho Mẫu Lớn (24+ Templates &amp; CapCut Import)
            </button>
            <div style={{ padding: 8, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#67e8f9' }}>Universal Template Hub (Đa Nền Tảng)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <button className="glass-btn" style={{ fontSize: 10.5 }} onClick={() => univTplInputRef.current?.click()} title="Nhập .capcut, draft_content.json, .fcpxml, .otio, .tcapcut-tpl">
                  <Upload size={11} /> Nhập Mẫu Ngoài
                </button>
                <button className="glass-btn" style={{ fontSize: 10.5 }} onClick={() => void exportCurrentAsTemplatePack()} title="Đóng gói dự án hiện tại thành gói .tcapcut-tpl">
                  <Download size={11} color="#34d399" /> Lưu Thành Mẫu
                </button>
              </div>
              <button
                className="glass-btn"
                style={{ fontSize: 10.5 }}
                onClick={async () => {
                  const res = await engineApi.scanLocalCapCutDrafts();
                  setLocalCapCutDrafts(res.drafts);
                  if (res.drafts.length === 0) setStatusMessage('Không thấy thư mục dự án CapCut cục bộ trên máy này.');
                }}
              >
                <FileJson size={11} color="#a78bfa" /> Quét Dự Án CapCut Có Sẵn Trên Mac
              </button>
              {localCapCutDrafts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
                  {localCapCutDrafts.slice(0, 6).map((d) => (
                    <button key={d.draftPath} className="glass-btn" style={{ fontSize: 10, justifyContent: 'space-between' }} onClick={() => void importLocalCapCutDraft(d.draftPath)}>
                      <span>📂 {d.name}</span>
                      <span style={{ color: '#22d3ee' }}>Mở →</span>
                    </button>
                  ))}
                </div>
              )}
              <input
                ref={univTplInputRef}
                type="file"
                accept=".capcut,.tcapcut-tpl,.json,.fcpxml,.xml,.otio,.zip,.lottie"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await importUniversalTemplateFile(f);
                  e.target.value = '';
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {TEMPLATE_CATEGORIES.map((c) => (
                <button key={c.id} style={catPillStyle(tplCat === c.id)} onClick={() => setTplCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>

            {filteredTpls.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => setTemplateModalPreset(tpl)}
                style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    height: 48,
                    background: tpl.previewGradient,
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', gap: 5 }}>
                    <span className="mono" style={{ fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '2px 6px', borderRadius: 5 }}>
                      {tpl.aspectRatio}
                    </span>
                    <span className="mono" style={{ fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '2px 6px', borderRadius: 5 }}>
                      {tpl.slots.length} Cảnh · {tpl.bpm} BPM
                    </span>
                  </div>
                  {renderFavBtn(tpl.id)}
                </div>
                <div style={{ padding: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{tpl.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{tpl.desc}</div>
                  </div>
                  <button className="glass-btn glass-btn-primary" style={{ padding: '5px 9px', fontSize: 11, flexShrink: 0 }}>
                    Dùng Mẫu
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ======================== AI LAB TAB ======================== */}
        {leftTab === 'ai' && (
          <>
            <div style={{ padding: 10, borderRadius: 12, background: 'rgba(34, 211, 238, 0.08)', border: '1px solid rgba(34,211,238,0.28)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontWeight: 600, color: '#67e8f9', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={13} /> System & AI Dependency Doctor
              </div>
              <div>FFmpeg/FFprobe: {health?.ai.ffmpegAvailable ? 'Sẵn sàng (VideoToolbox)' : 'Thiếu FFmpeg (brew install ffmpeg)'}</div>
              <div>Apple Vision/Metal: {health?.ai.visionAvailable ? 'Sẵn sàng (Offline)' : 'Chưa biên dịch'}</div>
              <div>Apple Speech On-Device: {health?.ai.appleSpeechAvailable ? 'Sẵn sàng' : 'Chưa bật'}</div>
              <div>Whisper ASR: {health?.ai.whisperModelPath ? 'Sẵn sàng (Offline GGML)' : 'Chưa tải model'}</div>
              {!health?.ai.whisperModelPath && (
                <button className="glass-btn" style={{ marginTop: 2 }} onClick={() => void downloadWhisperModel('tiny')}>
                  <Download size={12} /> Tải Whisper Tiny (75MB)
                </button>
              )}
            </div>

            {!activeAsset ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Hãy nhập ít nhất 1 video ở tab Media để chạy AI.</div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Đang phân tích: <strong style={{ color: '#fff' }}>{activeAsset.name}</strong>
                </div>

                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'matting')}>
                  <UserCheck size={13} color="#22d3ee" /> Apple Vision Person Matting (Tách Nền)
                </button>
                <button
                  className={`glass-btn ${objectSegmentMode ? 'glass-btn-active' : ''}`}
                  onClick={() => {
                    setObjectSegmentMode(!objectSegmentMode);
                    if (!objectSegmentMode) setStatusMessage('Bấm trực tiếp vào vật thể trên Video Player để tách nền!');
                  }}
                >
                  <Sparkles size={13} color="#38bdf8" /> {objectSegmentMode ? 'Đang chờ Click lên Vật Thể...' : 'Click-to-Segment Vật Thể (SAM / Vision)'}
                </button>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'face-track')}>
                  <Wand2 size={13} color="#a78bfa" /> Auto-Reframe 9:16 (Bám Khuôn Mặt)
                </button>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'highlights')}>
                  <Sparkles size={13} color="#fb7185" /> AI Auto-Highlight Viral 9:16
                </button>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'beats')}>
                  <AudioWaveform size={13} color="#fbbf24" /> Auto Beat Markers (Nhịp Nhạc)
                </button>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'scenes')}>
                  <Scissors size={13} color="#34d399" /> Scene Edit Detection (Dò Cảnh)
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  <button className="glass-btn" style={{ fontSize: 10.5 }} onClick={() => void runAiTask(activeAsset.id, 'stabilize')}>
                    Chống rung 2D
                  </button>
                  <button className="glass-btn" style={{ fontSize: 10.5 }} onClick={() => void runAiTask(activeAsset.id, 'upscale')}>
                    Upscale 2× Crisp
                  </button>
                </div>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'stem-separate')}>
                  <Music size={13} color="#34d399" /> Tách Vocals & Nhạc Nền (AI Stems)
                </button>
                <button className="glass-btn" disabled={!selectedClip} onClick={() => selectedClip && void removeSilencesFromClip(selectedClip.id)}>
                  <Scissors size={13} color="#fb7185" /> 1-Click Cắt Khoảng Lặng Clip Đang Chọn
                </button>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'remove-fillers')}>
                  <Scissors size={13} color="#f59e0b" /> Xóa Từ Thừa ("ờ, à, ừm")
                </button>
                <button className="glass-btn glass-btn-primary" onClick={() => void runAiTask(activeAsset.id, 'transcribe')}>
                  <Subtitles size={13} /> Tạo Transcript Rough-Cut
                </button>

                {/* Offline AI Voiceover TTS Generator */}
                <div style={{ padding: 9, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>AI Voiceover Offline (Giọng đọc + Tự tạo Phụ đề)</div>
                  <textarea
                    className="glass-textarea"
                    rows={2}
                    placeholder="Nhập lời thoại cần AI đọc..."
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 5 }}>
                    <select className="glass-select" style={{ width: 115, fontSize: 10.5 }} value={ttsLang} onChange={(e) => setTtsLang(e.target.value as 'vi' | 'en')}>
                      <option value="vi">Tiếng Việt (Linh)</option>
                      <option value="en">English (US)</option>
                    </select>
                    <button
                      className="glass-btn glass-btn-primary"
                      style={{ flex: 1, fontSize: 10.5 }}
                      disabled={!ttsText.trim()}
                      onClick={() => void generateAiVoiceover(ttsText, ttsLang)}
                    >
                      Tạo Voiceover + Phụ đề
                    </button>
                  </div>
                </div>

                {activeAsset.transcript && activeAsset.transcript.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>RoughCut (Bấm tua / Xóa câu)</span>
                      <button className="glass-btn" style={{ padding: '3px 7px', fontSize: 10 }} onClick={() => void generateCaptionsFromTranscript(activeAsset.id)}>
                        Đưa thành Phụ đề
                      </button>
                    </div>
                    {activeAsset.transcript.map((seg) => (
                      <div
                        key={seg.id}
                        onClick={() => setPlayheadUs(seg.startUs)}
                        style={{
                          padding: 8,
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: 11.5,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 6,
                        }}
                      >
                        <div>
                          <div className="mono" style={{ fontSize: 10, color: '#22d3ee', marginBottom: 3 }}>
                            {(seg.startUs / US_PER_SEC).toFixed(2)}s → {(seg.endUs / US_PER_SEC).toFixed(2)}s
                          </div>
                          <div>{seg.text}</div>
                        </div>
                        <button
                          className="glass-btn"
                          style={{ padding: '4px 6px', flexShrink: 0 }}
                          title="Xóa đoạn thoại này khỏi Video"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteTranscriptSegmentFromVideo(seg.startUs, seg.endUs, seg.text);
                          }}
                        >
                          <Trash2 size={12} color="#fb7185" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
