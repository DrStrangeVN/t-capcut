import React, { useRef, useState } from 'react';
import {
  AudioWaveform,
  Bot,
  Code2,
  Download,
  FileJson,
  Film,
  Layers,
  Plus,
  Scissors,
  Sparkles,
  Subtitles,
  Trash2,
  Upload,
  UserCheck,
  Wand2,
} from 'lucide-react';
import { US_PER_SEC } from '@t-capcut/schema';
import { engineApi } from '../engine/api';
import { useEditorStore, type LeftPanelTab } from '../store/useEditorStore';

const TABS: Array<{ id: LeftPanelTab; label: string; icon: React.ReactNode }> = [
  { id: 'media', label: 'Media', icon: <Film size={14} /> },
  { id: 'text', label: 'Text', icon: <Subtitles size={14} /> },
  { id: 'effects', label: 'Effects', icon: <Sparkles size={14} /> },
  { id: 'transitions', label: 'Trans', icon: <Layers size={14} /> },
  { id: 'ai', label: 'AI Lab', icon: <Bot size={14} /> },
];

const SHADER_EFFECTS = [
  { id: 'glitch', name: 'Cyber Glitch', desc: 'Tách kênh RGB & giật ngang' },
  { id: 'chromatic', name: 'Chromatic Lens', desc: 'Tán sắc quang học viền kính' },
  { id: 'vhs', name: 'VHS Retro 90s', desc: 'Đường quét băng từ cổ điển' },
  { id: 'zoom_blur', name: 'Radial Zoom Blur', desc: 'Mờ chuyển động tâm tốc độ' },
  { id: 'dreamy', name: 'Dreamy Glow', desc: 'Phát sáng sương mờ điện ảnh' },
  { id: 'film_burn', name: 'Film Burn', desc: 'Ánh cháy phim analog ấm' },
];

const COLOR_PRESETS = [
  { name: 'Teal & Orange', contrast: 0.2, saturation: 0.18, temperature: 0.16, vignette: 0.25 },
  { name: 'Obsidian Noir', contrast: 0.35, saturation: -0.85, temperature: -0.1, vignette: 0.45 },
  { name: 'Warm Analog', contrast: 0.12, saturation: 0.08, temperature: 0.32, vignette: 0.2 },
  { name: 'Cyber Neon', contrast: 0.28, saturation: 0.42, temperature: -0.22, vignette: 0.3 },
];

const TRANSITIONS = [
  { type: 'dissolve', name: 'Cross Dissolve', durUs: 500_000 },
  { type: 'glitch', name: 'Glitch Flash', durUs: 400_000 },
  { type: 'chromatic', name: 'Chromatic Whip', durUs: 450_000 },
  { type: 'zoom_blur', name: 'Zoom Pull', durUs: 500_000 },
  { type: 'film_burn', name: 'Film Burn Cut', durUs: 600_000 },
  { type: 'wipe_left', name: 'Wipe Left', durUs: 450_000 },
  { type: 'wipe_right', name: 'Wipe Right', durUs: 450_000 },
  { type: 'spin', name: 'Spin Vortex', durUs: 500_000 },
] as const;

const DEFAULT_CUSTOM_GLSL = `vec4 effectMain(sampler2D tex, vec2 uv, float time, float intensity) {
  float wave = sin(uv.y * 18.0 + time * 5.0) * 0.012 * intensity;
  vec4 c = texture(tex, uv + vec2(wave, 0.0));
  c.rgb = mix(c.rgb, c.rgb * vec3(0.85, 1.05, 1.2), intensity * 0.55);
  return c;
}`;

export const LeftStudioPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const lutInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);

  const leftTab = useEditorStore((s) => s.leftTab);
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const health = useEditorStore((s) => s.health);

  const setLeftTab = useEditorStore((s) => s.setLeftTab);
  const createDemoSample = useEditorStore((s) => s.createDemoSample);
  const uploadMediaFile = useEditorStore((s) => s.uploadMediaFile);
  const importMediaPath = useEditorStore((s) => s.importMediaPath);
  const importCapCutDraftFile = useEditorStore((s) => s.importCapCutDraftFile);
  const addAssetToTimeline = useEditorStore((s) => s.addAssetToTimeline);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const addEffectClip = useEditorStore((s) => s.addEffectClip);
  const updateSelectedClip = useEditorStore((s) => s.updateSelectedClip);
  const runAiTask = useEditorStore((s) => s.runAiTask);
  const removeSilencesFromClip = useEditorStore((s) => s.removeSilencesFromClip);
  const generateCaptionsFromTranscript = useEditorStore((s) => s.generateCaptionsFromTranscript);
  const deleteTranscriptSegmentFromVideo = useEditorStore((s) => s.deleteTranscriptSegmentFromVideo);
  const downloadWhisperModel = useEditorStore((s) => s.downloadWhisperModel);
  const registerLut = useEditorStore((s) => s.registerLut);
  const setPlayheadUs = useEditorStore((s) => s.setPlayheadUs);
  const commitProject = useEditorStore((s) => s.commitProject);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  const [localPathInput, setLocalPathInput] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [customGlsl, setCustomGlsl] = useState(DEFAULT_CUSTOM_GLSL);
  const [showShaderEditor, setShowShaderEditor] = useState(false);

  const assets = project ? Object.values(project.assets) : [];
  const activeAsset = (selectedAssetId && project?.assets[selectedAssetId]) || assets[0] || null;
  const selectedClip = project && selectedClipId ? project.clips[selectedClipId] : null;

  return (
    <div className="liquid-glass-panel" style={{ width: 316, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`glass-btn ${leftTab === t.id ? 'glass-btn-active' : ''}`}
            style={{ flex: 1, padding: '6px 4px', fontSize: 11 }}
            onClick={() => setLeftTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="glass-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {leftTab === 'media' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="glass-btn glass-btn-primary" onClick={() => fileInputRef.current?.click()}>
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
              Thư viện Tư liệu ({assets.length})
            </div>

            {assets.length === 0 ? (
              <div style={{ padding: 18, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 12 }}>
                Chưa có tư liệu. Hãy bấm <strong>Video Mẫu</strong> để trải nghiệm ngay hoặc tải video từ máy.
              </div>
            ) : (
              assets.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setSelectedAssetId(a.id)}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: activeAsset?.id === a.id ? 'rgba(34, 211, 238, 0.12)' : 'rgba(255,255,255,0.04)',
                    border: activeAsset?.id === a.id ? '1px solid rgba(34, 211, 238, 0.45)' : '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    cursor: 'pointer',
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

        {leftTab === 'text' && (
          <>
            <button className="glass-btn glass-btn-primary" onClick={() => void addTextClip('T-CapCut Karaoke Studio', true)}>
              <Plus size={13} /> Thêm Phụ Đề Karaoke Vàng
            </button>
            <button className="glass-btn" onClick={() => void addTextClip('Tiêu đề Glass Tối Giản', false)}>
              <Plus size={13} /> Thêm Tiêu Đề Thường
            </button>
            <button className="glass-btn" onClick={() => srtInputRef.current?.click()}>
              <Upload size={13} /> Nhập File Phụ Đề (.SRT)
            </button>
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

            {activeAsset && (
              <button className="glass-btn" onClick={() => void generateCaptionsFromTranscript(activeAsset.id)}>
                <Wand2 size={13} color="#fbbf24" /> Auto-Captions Từ Audio
              </button>
            )}
          </>
        )}

        {leftTab === 'effects' && (
          <>
            <button className="glass-btn glass-btn-primary" onClick={() => lutInputRef.current?.click()}>
              <Upload size={13} /> Nạp 3D LUT (.cube)
            </button>
            <input
              ref={lutInputRef}
              type="file"
              accept=".cube"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const content = await file.text();
                const parsed = await engineApi.parseCubeLut(content);
                const id = `lut_${Date.now()}`;
                registerLut({
                  id,
                  title: parsed.title,
                  size: parsed.size,
                  data: new Float32Array(parsed.data),
                });
                if (selectedClip) {
                  await updateSelectedClip(`Áp dụng LUT ${parsed.title}`, (c) => {
                    c.colorGrade.lutId = id;
                    c.colorGrade.lutName = parsed.title;
                    c.colorGrade.lutIntensity = 0.85;
                  });
                }
                setStatusMessage(`Đã nạp 3D LUT: ${parsed.title} (${parsed.size}³)`);
                e.target.value = '';
              }}
            />

            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Presets Màu 1-Click</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {COLOR_PRESETS.map((cp) => (
                <button
                  key={cp.name}
                  className="glass-btn"
                  disabled={!selectedClip}
                  onClick={() =>
                    void updateSelectedClip(`Preset ${cp.name}`, (c) => {
                      c.colorGrade.contrast = cp.contrast;
                      c.colorGrade.saturation = cp.saturation;
                      c.colorGrade.temperature = cp.temperature;
                      c.colorGrade.vignette = cp.vignette;
                    })
                  }
                >
                  {cp.name}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              GPU Shader VFX (WebGL2 Real-Time)
            </div>
            {SHADER_EFFECTS.map((fx) => (
              <div
                key={fx.id}
                style={{
                  padding: 9,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{fx.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{fx.desc}</div>
                </div>
                <button className="glass-btn" onClick={() => void addEffectClip(fx.id, fx.name)}>
                  <Plus size={12} />
                </button>
              </div>
            ))}

            <button className="glass-btn" onClick={() => setShowShaderEditor(!showShaderEditor)}>
              <Code2 size={13} color="#22d3ee" /> Custom GLSL Shader Plugin
            </button>
            {showShaderEditor && (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(34,211,238,0.35)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="glass-textarea mono"
                  rows={6}
                  style={{ fontSize: 10.5 }}
                  value={customGlsl}
                  onChange={(e) => setCustomGlsl(e.target.value)}
                />
                <button
                  className="glass-btn glass-btn-primary"
                  onClick={() => void addEffectClip('custom', 'Custom GLSL FX', customGlsl)}
                >
                  Chạy Shader Lên Timeline
                </button>
              </div>
            )}
          </>
        )}

        {leftTab === 'transitions' && (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Chọn 1 Clip trên Timeline rồi bấm để gắn Chuyển Cảnh Đầu Clip:
            </div>
            {TRANSITIONS.map((tr) => (
              <div
                key={tr.type}
                style={{
                  padding: 9,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{tr.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {(tr.durUs / US_PER_SEC).toFixed(2)}s
                  </div>
                </div>
                <button
                  className="glass-btn"
                  disabled={!selectedClip}
                  onClick={() =>
                    void updateSelectedClip(`Transition ${tr.name}`, (c) => {
                      c.transitionIn = {
                        id: `tr_${Date.now()}`,
                        name: tr.name,
                        type: tr.type,
                        durationUs: tr.durUs,
                      };
                    })
                  }
                >
                  Áp dụng
                </button>
              </div>
            ))}
          </>
        )}

        {leftTab === 'ai' && (
          <>
            <div style={{ padding: 10, borderRadius: 12, background: 'rgba(34, 211, 238, 0.08)', border: '1px solid rgba(34,211,238,0.28)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontWeight: 600, color: '#67e8f9' }}>On-Device Apple Silicon AI</div>
              <div>Apple Vision/Metal: {health?.ai.visionAvailable ? 'Sẵn sàng (Offline)' : 'Chưa biên dịch'}</div>
              <div>
                Whisper ASR: {health?.ai.whisperModelPath ? 'Sẵn sàng (Offline GGML)' : 'Chưa tải model (Đang dùng VAD)'}
              </div>
              {!health?.ai.whisperModelPath && (
                <button className="glass-btn" style={{ marginTop: 2 }} onClick={() => void downloadWhisperModel('tiny')}>
                  <Download size={12} /> Tải Whisper Tiny (75MB)
                </button>
              )}
            </div>

            {!activeAsset ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Hãy nhập ít nhất 1 video ở tab Media để chạy AI.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Đang phân tích: <strong style={{ color: '#fff' }}>{activeAsset.name}</strong>
                </div>

                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'matting')}>
                  <UserCheck size={13} color="#22d3ee" /> Apple Vision Person Matting (Tách Nền)
                </button>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'face-track')}>
                  <Wand2 size={13} color="#a78bfa" /> Auto-Reframe 9:16 (Bám Khuôn Mặt)
                </button>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'beats')}>
                  <AudioWaveform size={13} color="#fbbf24" /> Auto Beat Markers (Nhịp Nhạc)
                </button>
                <button className="glass-btn" onClick={() => void runAiTask(activeAsset.id, 'scenes')}>
                  <Scissors size={13} color="#34d399" /> Scene Edit Detection (Dò Cảnh)
                </button>
                <button
                  className="glass-btn"
                  disabled={!selectedClip}
                  onClick={() => selectedClip && void removeSilencesFromClip(selectedClip.id)}
                >
                  <Scissors size={13} color="#fb7185" /> 1-Click Cắt Khoảng Lặng Clip Đang Chọn
                </button>
                <button className="glass-btn glass-btn-primary" onClick={() => void runAiTask(activeAsset.id, 'transcribe')}>
                  <Subtitles size={13} /> Tạo Transcript Rough-Cut
                </button>

                {activeAsset.transcript && activeAsset.transcript.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>RoughCut (Bấm tua / Xóa câu)</span>
                      <button
                        className="glass-btn"
                        style={{ padding: '3px 7px', fontSize: 10 }}
                        onClick={() => void generateCaptionsFromTranscript(activeAsset.id)}
                      >
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
