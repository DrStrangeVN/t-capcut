import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CopyCheck,
  Crosshair,
  Diamond,
  Film,
  FlipHorizontal,
  FlipVertical,
  Gauge,
  Maximize,
  Palette,
  Pipette,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
  UserCheck,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  EASING_PRESETS,
  US_PER_SEC,
  computeDurationFromSpeed,
  getScopeTracksAndClips,
  type AudioClipState,
  type BlendMode,
  type ClipAnimationState,
  type MaskShape,
  type SpeedState,
  type TextStyleState,
} from '@t-capcut/schema';
import { useEditorStore, type InspectorTab } from '../store/useEditorStore';

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string; icon: React.ReactNode }> = [
  { id: 'transform', label: 'Video', icon: <Film size={12} /> },
  { id: 'audio', label: 'Audio', icon: <Volume2 size={12} /> },
  { id: 'speed', label: 'Speed', icon: <Gauge size={12} /> },
  { id: 'animation', label: 'Anim', icon: <Zap size={12} /> },
  { id: 'tracking', label: 'Track', icon: <Crosshair size={12} /> },
  { id: 'color', label: 'Adjust', icon: <Palette size={12} /> },
];

const ANIM_IN_LIST: Array<{ id: NonNullable<ClipAnimationState['in']>; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'fade_in', label: 'Fade In' },
  { id: 'zoom_in', label: 'Zoom In' },
  { id: 'slide_left', label: 'Slide Left' },
  { id: 'slide_right', label: 'Slide Right' },
  { id: 'slide_up', label: 'Slide Up' },
  { id: 'slide_down', label: 'Slide Down' },
  { id: 'shake_in', label: 'Shake' },
  { id: 'bounce_in', label: 'Bounce' },
  { id: 'spin_in', label: 'Spin In' },
];

const ANIM_OUT_LIST: Array<{ id: NonNullable<ClipAnimationState['out']>; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'fade_out', label: 'Fade Out' },
  { id: 'zoom_out', label: 'Zoom Out' },
  { id: 'slide_left', label: 'Slide Left' },
  { id: 'slide_right', label: 'Slide Right' },
  { id: 'slide_down', label: 'Slide Down' },
  { id: 'spin_out', label: 'Spin Out' },
];

const ANIM_COMBO_LIST: Array<{ id: NonNullable<ClipAnimationState['combo']>; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'pendulum', label: 'Pendulum' },
  { id: 'wobble', label: 'Wobble' },
  { id: 'beat_pulse', label: 'Beat Pulse' },
  { id: 'zoom_bounce', label: 'Zoom Bounce' },
  { id: 'distort_swing', label: 'Distort Swing' },
];

const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft_light',
  'hard_light',
  'color_dodge',
  'darken',
  'lighten',
  'difference',
  'add',
  'exclusion',
];

const SPEED_PRESETS: Array<{ id: NonNullable<SpeedState['presetName']>; label: string; points: SpeedState['curvePoints'] }> = [
  { id: 'montage', label: 'Montage', points: [{ position: 0, speed: 0.7 }, { position: 0.35, speed: 3.2 }, { position: 0.7, speed: 0.6 }, { position: 1, speed: 2.0 }] },
  { id: 'hero', label: 'Hero', points: [{ position: 0, speed: 1.5 }, { position: 0.45, speed: 0.35 }, { position: 0.65, speed: 0.35 }, { position: 1, speed: 2.2 }] },
  { id: 'bullet', label: 'Bullet', points: [{ position: 0, speed: 4.5 }, { position: 0.4, speed: 0.3 }, { position: 1, speed: 1.2 }] },
  { id: 'jump_cut', label: 'Jump Cut', points: [{ position: 0, speed: 1.0 }, { position: 0.5, speed: 5.0 }, { position: 1, speed: 1.0 }] },
];

const HSL_CHANNELS: Array<{ key: string; label: string; color: string }> = [
  { key: 'red', label: 'Đỏ', color: '#ef4444' },
  { key: 'orange', label: 'Cam', color: '#f97316' },
  { key: 'yellow', label: 'Vàng', color: '#eab308' },
  { key: 'green', label: 'Lục', color: '#22c55e' },
  { key: 'aqua', label: 'Ngọc', color: '#06b6d4' },
  { key: 'blue', label: 'Lam', color: '#3b82f6' },
  { key: 'purple', label: 'Tím', color: '#8b5cf6' },
  { key: 'magenta', label: 'Hồng', color: '#ec4899' },
];

interface RightInspectorProps {
  widthPx?: number;
}

export const RightInspector: React.FC<RightInspectorProps> = ({ widthPx = 348 }) => {
  const project = useEditorStore((s) => s.project);
  const nestedScopeId = useEditorStore((s) => s.nestedScopeId);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const inspectorTab = useEditorStore((s) => s.inspectorTab);
  const eyedropperActive = useEditorStore((s) => s.eyedropperActive);

  const setInspectorTab = useEditorStore((s) => s.setInspectorTab);
  const setEyedropperActive = useEditorStore((s) => s.setEyedropperActive);
  const previewSelectedClip = useEditorStore((s) => s.previewSelectedClip);
  const commitCurrentProject = useEditorStore((s) => s.commitCurrentProject);
  const updateSelectedClip = useEditorStore((s) => s.updateSelectedClip);
  const addKeyframeAtPlayhead = useEditorStore((s) => s.addKeyframeAtPlayhead);
  const applyClipColorAndFxToAll = useEditorStore((s) => s.applyClipColorAndFxToAll);
  const systemFonts = useEditorStore((s) => s.systemFonts);
  const setTextBehindSubject = useEditorStore((s) => s.setTextBehindSubject);
  const translateSelectedSubtitle = useEditorStore((s) => s.translateSelectedSubtitle);
  const autoColorMatchToPreviousClip = useEditorStore((s) => s.autoColorMatchToPreviousClip);
  const smartRemixSelectedMusic = useEditorStore((s) => s.smartRemixSelectedMusic);
  const runAiTask = useEditorStore((s) => s.runAiTask);
  const objectSegmentMode = useEditorStore((s) => s.objectSegmentMode);
  const setObjectSegmentMode = useEditorStore((s) => s.setObjectSegmentMode);
  const generateAiVoiceover = useEditorStore((s) => s.generateAiVoiceover);
  const playheadUs = useEditorStore((s) => s.playheadUs);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  const [curveChannel, setCurveChannel] = useState<'master' | 'red' | 'green' | 'blue'>('master');
  const [hslChannel, setHslChannel] = useState<string>('red');
  const [videoSubTab, setVideoSubTab] = useState<'basic' | 'remove_bg' | 'mask' | 'retouch'>('basic');
  const [audioSubTab, setAudioSubTab] = useState<'basic' | 'voice' | 'eq'>('basic');
  const [animSubTab, setAnimSubTab] = useState<'in' | 'out' | 'combo'>('in');
  const [adjustSubTab, setAdjustSubTab] = useState<'basic' | 'hsl' | 'curves' | 'wheels'>('basic');
  const draggingSpeedIdx = useRef<number | null>(null);

  const scope = project ? getScopeTracksAndClips(project, nestedScopeId) : null;
  const clip = scope && selectedClipId ? scope.clips[selectedClipId] : null;

  return (
    <div className="nle-content-surface" style={{ width: widthPx, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {INSPECTOR_TABS.map((t) => (
          <button
            key={t.id}
            className={`glass-btn ${inspectorTab === t.id ? 'glass-btn-active' : ''}`}
            style={{ padding: '5px 2px', fontSize: 9.5, flexDirection: 'column', gap: 2, minWidth: 0 }}
            onClick={() => setInspectorTab(t.id)}
          >
            {t.icon}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="glass-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!clip ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            Chọn 1 clip trên Timeline hoặc Player để tinh chỉnh thuộc tính.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 230 }}>{clip.name}</span>
              <span className="mono" style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>
                {clip.kind.toUpperCase()}
              </span>
            </div>

            {clip.kind === 'text' && clip.text && (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.28)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24' }}>Nội dung Text / Phụ đề</label>
                <textarea
                  className="glass-textarea"
                  rows={2}
                  value={clip.text.text}
                  onChange={(e) => {
                    const v = e.target.value;
                    previewSelectedClip((c) => {
                      if (c.text) {
                        c.text.text = v;
                        c.name = v.slice(0, 24);
                      }
                    });
                  }}
                  onBlur={() => void commitCurrentProject('Sửa nội dung Text')}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11 }}>Cỡ chữ</span>
                  <input
                    type="range"
                    className="glass-slider"
                    min={20}
                    max={140}
                    value={clip.text.fontSize}
                    onChange={(e) => {
                      const sz = Number(e.target.value);
                      previewSelectedClip((c) => {
                        if (c.text) c.text.fontSize = sz;
                      });
                    }}
                    onPointerUp={() => void commitCurrentProject('Chỉnh cỡ chữ')}
                  />
                  <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={clip.text.karaokeEnabled}
                      onChange={(e) => {
                        const chk = e.target.checked;
                        void updateSelectedClip('Bật/tắt Karaoke', (c) => {
                          if (c.text) c.text.karaokeEnabled = chk;
                        });
                      }}
                    />
                    Karaoke
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                  <span>Màu chữ / Active</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="color"
                      value={clip.text.color}
                      onChange={(e) => {
                        const hex = e.target.value;
                        void updateSelectedClip('Màu chữ', (c) => {
                          if (c.text) c.text.color = hex;
                        });
                      }}
                    />
                    <input
                      type="color"
                      value={clip.text.karaokeActiveColor}
                      onChange={(e) => {
                        const hex = e.target.value;
                        void updateSelectedClip('Màu Karaoke Active', (c) => {
                          if (c.text) c.text.karaokeActiveColor = hex;
                        });
                      }}
                    />
                  </div>
                </div>

                {/* Karaoke Preset + In/Out/Loop Animations + Badge Tag */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Kiểu Karaoke</label>
                    <select
                      className="glass-select"
                      style={{ fontSize: 10.5 }}
                      value={clip.text.karaokePreset || 'classic-pill'}
                      onChange={(e) => {
                        const kp = e.target.value as TextStyleState['karaokePreset'];
                        void updateSelectedClip('Kiểu Karaoke', (c) => {
                          if (c.text) c.text.karaokePreset = kp;
                        });
                      }}
                    >
                      <option value="classic-pill">Classic Pill</option>
                      <option value="hormozi-pop">Hormozi Pop</option>
                      <option value="liquid-glass">Liquid Glass</option>
                      <option value="sweep-fill">Sweep Fill</option>
                      <option value="neon-cyber">Neon Cyber</option>
                      <option value="minimal-podcast">Podcast Clean</option>
                      <option value="comic-punch">Comic Punch</option>
                      <option value="doc-serif">Documentary Serif</option>
                      <option value="capcut-yellow">CapCut Yellow</option>
                      <option value="neon-cyan">Neon Cyan</option>
                      <option value="pop-bounce">Pop Bounce</option>
                      <option value="word-highlight">Word Highlight</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Hiệu ứng Vào (In)</label>
                    <select
                      className="glass-select"
                      style={{ fontSize: 10.5 }}
                      value={clip.text.animationIn || 'pop'}
                      onChange={(e) => {
                        const val = e.target.value as TextStyleState['animationIn'];
                        void updateSelectedClip('Text Animation In', (c) => {
                          if (c.text) c.text.animationIn = val;
                        });
                      }}
                    >
                      <option value="none">Không</option>
                      <option value="pop">Pop Bật</option>
                      <option value="fade">Fade Mờ</option>
                      <option value="slide-up">Trượt Lên</option>
                      <option value="slide-down">Trượt Xuống</option>
                      <option value="slide-left">Trượt Trái</option>
                      <option value="slide-right">Trượt Phải</option>
                      <option value="typewriter">Typewriter Gõ Chữ</option>
                      <option value="blur-in">Blur Mờ Dần Rõ</option>
                      <option value="zoom-slam">Zoom Slam</option>
                      <option value="glitch">Glitch Nháy</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Hiệu ứng Ra (Out)</label>
                    <select
                      className="glass-select"
                      style={{ fontSize: 10.5 }}
                      value={clip.text.animationOut || 'fade'}
                      onChange={(e) => {
                        const val = e.target.value as TextStyleState['animationOut'];
                        void updateSelectedClip('Text Animation Out', (c) => {
                          if (c.text) c.text.animationOut = val;
                        });
                      }}
                    >
                      <option value="none">Không</option>
                      <option value="fade">Fade Mờ</option>
                      <option value="pop">Thu Nhỏ</option>
                      <option value="slide-down">Trượt Xuống</option>
                      <option value="zoom-out">Zoom Out</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Lặp Liên Tục (Loop)</label>
                    <select
                      className="glass-select"
                      style={{ fontSize: 10.5 }}
                      value={clip.text.animationLoop || 'none'}
                      onChange={(e) => {
                        const val = e.target.value as TextStyleState['animationLoop'];
                        void updateSelectedClip('Text Animation Loop', (c) => {
                          if (c.text) c.text.animationLoop = val;
                        });
                      }}
                    >
                      <option value="none">Không</option>
                      <option value="pulse">Nhịp Tim Pulse</option>
                      <option value="float">Lơ Lửng Float</option>
                      <option value="wave">Lượn Sóng Wave</option>
                      <option value="shake">Rung Nhẹ Shake</option>
                      <option value="neon-flicker">Chớp Neon</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Font Hệ Thống macOS</label>
                    <select
                      className="glass-select"
                      style={{ fontSize: 10.5 }}
                      value={clip.text.fontFamily}
                      onChange={(e) => {
                        const ff = e.target.value;
                        void updateSelectedClip(`Đổi font ${ff}`, (c) => {
                          if (c.text) c.text.fontFamily = ff;
                        });
                      }}
                    >
                      <option value="Inter, -apple-system, BlinkMacSystemFont, sans-serif">SF Pro / Inter (Mặc định)</option>
                      {systemFonts.slice(0, 80).map((f) => (
                        <option key={f} value={`"${f}", sans-serif`}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, marginTop: 2 }}>
                    <button
                      className={`glass-btn ${clip.text.behindSubject ? 'glass-btn-active' : ''}`}
                      style={{ flex: 1, fontSize: 10.5 }}
                      onClick={() => void setTextBehindSubject(clip.id, !clip.text?.behindSubject)}
                      title="Đưa lớp chữ ra sau người/vật thể tách bằng Apple Vision"
                    >
                      {clip.text.behindSubject ? '✓ Chữ Sau Chủ Thể' : 'Chữ Sau Chủ Thể'}
                    </button>
                    <button
                      className="glass-btn"
                      style={{ flex: 1, fontSize: 10.5 }}
                      onClick={() => void translateSelectedSubtitle('en')}
                      title="Thêm phụ đề song ngữ Việt + Anh"
                    >
                      Song ngữ VI/EN
                    </button>
                  </div>
                  <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
                    <button
                      className="glass-btn glass-btn-primary"
                      style={{ width: '100%', fontSize: 10.5 }}
                      onClick={() => clip.text?.text && void generateAiVoiceover(clip.text.text, 'vi')}
                    >
                      <Volume2 size={11} /> Đọc Text Thành Giọng AI (TTS Offline)
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Nhãn Badge (Lower-Third)</label>
                  <input
                    className="glass-input"
                    style={{ fontSize: 11 }}
                    placeholder="VD: GUEST, LIVE, PRO..."
                    value={clip.text.badgeText ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      previewSelectedClip((c) => {
                        if (c.text) c.text.badgeText = val;
                      });
                    }}
                    onBlur={() => void commitCurrentProject('Sửa Badge Tag')}
                  />
                </div>
              </div>
            )}

            {clip.kind === 'sticker' && clip.sticker && (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.28)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#f472b6' }}>
                  Sticker / Hạt Bay: {clip.sticker.name}
                </label>
                {!clip.sticker.particleType && (
                  <input
                    className="glass-input"
                    value={clip.sticker.label ?? ''}
                    placeholder="Nhãn Sticker..."
                    onChange={(e) => {
                      const val = e.target.value;
                      previewSelectedClip((c) => {
                        if (c.sticker) c.sticker.label = val;
                      });
                    }}
                    onBlur={() => void commitCurrentProject('Sửa nhãn Sticker')}
                  />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                  <span>Màu chính / Màu phụ</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="color"
                      value={clip.sticker.primaryColor}
                      onChange={(e) => {
                        const hex = e.target.value;
                        void updateSelectedClip('Màu chính Sticker', (c) => {
                          if (c.sticker) c.sticker.primaryColor = hex;
                        });
                      }}
                    />
                    <input
                      type="color"
                      value={clip.sticker.secondaryColor}
                      onChange={(e) => {
                        const hex = e.target.value;
                        void updateSelectedClip('Màu phụ Sticker', (c) => {
                          if (c.sticker) c.sticker.secondaryColor = hex;
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {clip.effects && clip.effects.length > 0 && (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.28)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#c084fc' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={12} /> Multi-FX GPU Stack ({clip.effects.length})
                  </span>
                  <button
                    className="glass-btn"
                    style={{ fontSize: 10, padding: '2px 7px' }}
                    onClick={() => void applyClipColorAndFxToAll('fx')}
                    title="Sao chép chuỗi hiệu ứng sang tất cả clip Video/Ảnh"
                  >
                    <CopyCheck size={11} /> Áp All
                  </button>
                </div>
                {clip.effects.map((fx, fxIdx) => (
                  <div key={fx.id} style={{ padding: 7, borderRadius: 8, background: 'rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={fx.enabled !== false}
                          onChange={(e) => {
                            const chk = e.target.checked;
                            void updateSelectedClip(`Toggle VFX ${fx.name}`, (c) => {
                              if (c.effects[fxIdx]) c.effects[fxIdx].enabled = chk;
                            });
                          }}
                        />
                        <span>{fx.name}</span>
                      </label>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button
                          className="glass-btn"
                          style={{ padding: '2px 4px' }}
                          disabled={fxIdx === 0}
                          onClick={() =>
                            void updateSelectedClip(`Đưa ${fx.name} lên`, (c) => {
                              if (fxIdx > 0) {
                                const [moved] = c.effects.splice(fxIdx, 1);
                                c.effects.splice(fxIdx - 1, 0, moved!);
                              }
                            })
                          }
                          title="Đưa lên trước"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button
                          className="glass-btn"
                          style={{ padding: '2px 4px' }}
                          disabled={fxIdx === clip.effects.length - 1}
                          onClick={() =>
                            void updateSelectedClip(`Đưa ${fx.name} xuống`, (c) => {
                              if (fxIdx < c.effects.length - 1) {
                                const [moved] = c.effects.splice(fxIdx, 1);
                                c.effects.splice(fxIdx + 1, 0, moved!);
                              }
                            })
                          }
                          title="Đưa xuống sau"
                        >
                          <ArrowDown size={10} />
                        </button>
                        <button
                          className="glass-btn"
                          style={{ padding: '2px 5px' }}
                          onClick={() =>
                            void updateSelectedClip(`Xóa VFX ${fx.name}`, (c) => {
                              c.effects.splice(fxIdx, 1);
                            })
                          }
                          title="Xóa FX khỏi stack"
                        >
                          <Trash2 size={11} color="#fb7185" />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                      <span>Cường độ: {(fx.intensity * 100).toFixed(0)}%</span>
                      <span>Tốc độ: {(fx.speed || 1).toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={0}
                      max={1.5}
                      step={0.02}
                      value={fx.intensity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        previewSelectedClip((c) => {
                          if (c.effects[fxIdx]) c.effects[fxIdx].intensity = v;
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject(`Chỉnh Intensity ${fx.name}`)}
                    />
                    <input
                      type="range"
                      className="glass-slider"
                      min={0.2}
                      max={3}
                      step={0.1}
                      value={fx.speed || 1}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        previewSelectedClip((c) => {
                          if (c.effects[fxIdx]) c.effects[fxIdx].speed = v;
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject(`Chỉnh Speed ${fx.name}`)}
                    />
                  </div>
                ))}
              </div>
            )}

            {inspectorTab === 'transform' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {(
                    [
                      { id: 'basic', label: 'Basic' },
                      { id: 'remove_bg', label: 'Remove BG' },
                      { id: 'mask', label: 'Mask' },
                      { id: 'retouch', label: 'Retouch' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      className={`glass-btn ${videoSubTab === st.id ? 'glass-btn-active' : ''}`}
                      style={{ fontSize: 10, padding: '5px 3px', justifyContent: 'center' }}
                      onClick={() => setVideoSubTab(st.id)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {videoSubTab === 'basic' && (
                  <>
                {(
                  [
                    { label: 'Vị trí X', prop: 'x', val: clip.transform.x, min: -1.5, max: 1.5, step: 0.01 },
                    { label: 'Vị trí Y', prop: 'y', val: clip.transform.y, min: -1.5, max: 1.5, step: 0.01 },
                    { label: 'Tỉ lệ Scale', prop: 'scaleX', val: clip.transform.scaleX, min: 0.1, max: 3, step: 0.02 },
                    { label: 'Xoay (độ)', prop: 'rotation', val: clip.transform.rotation, min: -180, max: 180, step: 1 },
                    { label: 'Độ mờ (Opacity)', prop: 'opacity', val: clip.transform.opacity, min: 0, max: 1, step: 0.02 },
                  ] as const
                ).map((item) => (
                  <div key={item.prop} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                      <span>{item.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono">{item.val.toFixed(2)}</span>
                        <button
                          onClick={() => void addKeyframeAtPlayhead(item.prop, item.val)}
                          title="Thêm Keyframe tại Playhead"
                          style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', padding: 1 }}
                        >
                          <Diamond size={12} />
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={item.min}
                      max={item.max}
                      step={item.step}
                      value={item.val}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        previewSelectedClip((c) => {
                          if (item.prop === 'scaleX') {
                            c.transform.scaleX = v;
                            c.transform.scaleY = v;
                          } else {
                            c.transform[item.prop] = v;
                          }
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject(`Chỉnh ${item.label}`)}
                    />
                  </div>
                ))}

                {/* Flip H / V */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    className={`glass-btn ${clip.transform.flipH ? 'glass-btn-active' : ''}`}
                    onClick={() =>
                      void updateSelectedClip('Lật ngang Flip H', (c) => {
                        c.transform.flipH = !c.transform.flipH;
                      })
                    }
                  >
                    <FlipHorizontal size={13} /> Flip Ngang
                  </button>
                  <button
                    className={`glass-btn ${clip.transform.flipV ? 'glass-btn-active' : ''}`}
                    onClick={() =>
                      void updateSelectedClip('Lật dọc Flip V', (c) => {
                        c.transform.flipV = !c.transform.flipV;
                      })
                    }
                  >
                    <FlipVertical size={13} /> Flip Dọc
                  </button>
                  {(clip.kind === 'video' || clip.kind === 'image') && (
                    <button
                      className={`glass-btn ${clip.transform.fillMode === 'cover' ? 'glass-btn-active' : ''}`}
                      style={{ gridColumn: '1 / -1' }}
                      onClick={() =>
                        void updateSelectedClip(
                          clip.transform.fillMode === 'cover' ? 'Vừa Khung (Fit)' : 'Lấp Đầy Khung (Cover)',
                          (c) => {
                            c.transform.fillMode = c.transform.fillMode === 'cover' ? 'fit' : 'cover';
                          }
                        )
                      }
                    >
                      <Maximize size={13} color={clip.transform.fillMode === 'cover' ? '#22d3ee' : undefined} />
                      <span>{clip.transform.fillMode === 'cover' ? 'Đang bật: Lấp Đầy Khung (Cover)' : 'Mặc định: Vừa Khung (Fit)'}</span>
                    </button>
                  )}
                </div>

                {/* Crop 4 Edges */}
                <div style={{ padding: 9, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>Cắt Khung Hình (Crop L/R/T/B)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(
                      [
                        { label: 'Trái', key: 'cropLeft' },
                        { label: 'Phải', key: 'cropRight' },
                        { label: 'Trên', key: 'cropTop' },
                        { label: 'Dưới', key: 'cropBottom' },
                      ] as const
                    ).map((cr) => (
                      <div key={cr.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {cr.label}: {Math.round(clip.transform[cr.key] * 100)}%
                        </span>
                        <input
                          type="range"
                          className="glass-slider"
                          min={0}
                          max={0.45}
                          step={0.01}
                          value={clip.transform[cr.key]}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            previewSelectedClip((c) => {
                              c.transform[cr.key] = v;
                            });
                          }}
                          onPointerUp={() => void commitCurrentProject(`Crop ${cr.label}`)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11 }}>Chế độ hòa trộn (Blend Mode)</label>
                  <select
                    className="glass-select"
                    value={clip.transform.blendMode}
                    onChange={(e) => {
                      const bm = e.target.value as BlendMode;
                      void updateSelectedClip(`Blend Mode ${bm}`, (c) => {
                        c.transform.blendMode = bm;
                      });
                    }}
                  >
                    {BLEND_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const firstKf = Object.values(clip.keyframes).find((arr) => arr && arr.length > 0)?.[0];
                  const [x1, y1, x2, y2] = firstKf?.easing ?? [0.42, 0, 0.58, 1];
                  const sx = (v: number) => 10 + v * 80;
                  const sy = (v: number) => 90 - v * 80;
                  return (
                    <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>Đồ thị Cubic Bezier</span>
                        <span className="mono" style={{ fontSize: 10, color: '#67e8f9' }}>
                          [{x1.toFixed(2)}, {y1.toFixed(2)}, {x2.toFixed(2)}, {y2.toFixed(2)}]
                        </span>
                      </div>
                      <svg viewBox="0 0 100 100" style={{ width: '100%', height: 76, background: 'rgba(0,0,0,0.35)', borderRadius: 8, marginBottom: 8 }}>
                        <line x1="10" y1="90" x2="90" y2="10" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
                        <line x1="10" y1="90" x2={sx(x1)} y2={sy(y1)} stroke="#fbbf24" strokeWidth="1.2" />
                        <line x1="90" y1="10" x2={sx(x2)} y2={sy(y2)} stroke="#a78bfa" strokeWidth="1.2" />
                        <path
                          d={`M 10 90 C ${sx(x1)} ${sy(y1)}, ${sx(x2)} ${sy(y2)}, 90 10`}
                          fill="none"
                          stroke="#22d3ee"
                          strokeWidth="2.4"
                        />
                        <circle cx={sx(x1)} cy={sy(y1)} r="3.2" fill="#fbbf24" />
                        <circle cx={sx(x2)} cy={sy(y2)} r="3.2" fill="#a78bfa" />
                      </svg>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {Object.entries(EASING_PRESETS).map(([name, pts]) => (
                          <button
                            key={name}
                            className="glass-btn"
                            style={{ fontSize: 10, padding: '4px 7px' }}
                            onClick={() => {
                              void updateSelectedClip(`Easing ${name}`, (c) => {
                                Object.values(c.keyframes).forEach((list) =>
                                  list?.forEach((k) => {
                                    k.easing = pts;
                                  })
                                );
                              });
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                  </>
                )}

                {videoSubTab === 'remove_bg' && (
                  <>
                    <div style={{ padding: 10, borderRadius: 12, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.28)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#67e8f9', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <UserCheck size={13} /> Tách Nền Thông Minh (Auto Cutout / SAM)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        <button
                          className="glass-btn glass-btn-primary"
                          style={{ fontSize: 10.5 }}
                          disabled={!clip.assetId}
                          onClick={() => clip.assetId && void runAiTask(clip.assetId, 'matting')}
                        >
                          <Sparkles size={11} /> Auto Portrait Cutout
                        </button>
                        <button
                          className={`glass-btn ${objectSegmentMode ? 'glass-btn-active' : ''}`}
                          style={{ fontSize: 10.5 }}
                          disabled={!clip.assetId}
                          onClick={() => {
                            setObjectSegmentMode(!objectSegmentMode);
                            if (!objectSegmentMode) setStatusMessage('Bấm trực tiếp vào vật thể trên Video Player để tách!');
                          }}
                        >
                          <Crosshair size={11} /> Click-to-Segment
                        </button>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                        <input
                          type="checkbox"
                          checked={clip.aiMattingEnabled}
                          onChange={(e) => {
                            const val = e.target.checked;
                            void updateSelectedClip('Bật/tắt AI Matting', (c) => {
                              c.aiMattingEnabled = val;
                            });
                          }}
                        />
                        Kích hoạt lớp Alpha AI Matting
                      </label>
                    </div>

                    <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                        <span>Phông Xanh (Chroma Key)</span>
                        <input
                          type="checkbox"
                          checked={clip.chromaKey.enabled}
                          onChange={(e) => {
                            const en = e.target.checked;
                            void updateSelectedClip('Toggle Chroma Key', (c) => {
                              c.chromaKey.enabled = en;
                            });
                          }}
                        />
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                        <span>Màu khóa</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            className={`glass-btn ${eyedropperActive ? 'glass-btn-active' : ''}`}
                            style={{ padding: '4px 8px', fontSize: 10.5 }}
                            onClick={() => setEyedropperActive(!eyedropperActive)}
                          >
                            <Pipette size={11} /> Hút màu
                          </button>
                          <input
                            type="color"
                            value={clip.chromaKey.colorHex}
                            onChange={(e) => {
                              const hex = e.target.value;
                              void updateSelectedClip('Chroma Color', (c) => {
                                c.chromaKey.colorHex = hex;
                              });
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: 11 }}>Độ tương đồng ({clip.chromaKey.similarity.toFixed(2)})</div>
                      <input
                        type="range"
                        className="glass-slider"
                        min={0.05}
                        max={0.8}
                        step={0.01}
                        value={clip.chromaKey.similarity}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          previewSelectedClip((c) => {
                            c.chromaKey.similarity = v;
                          });
                        }}
                        onPointerUp={() => void commitCurrentProject('Chroma Similarity')}
                      />
                      <div style={{ fontSize: 11 }}>Làm mịn viền ({clip.chromaKey.smoothness.toFixed(2)})</div>
                      <input
                        type="range"
                        className="glass-slider"
                        min={0.01}
                        max={0.6}
                        step={0.01}
                        value={clip.chromaKey.smoothness}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          previewSelectedClip((c) => {
                            c.chromaKey.smoothness = v;
                          });
                        }}
                        onPointerUp={() => void commitCurrentProject('Chroma Smoothness')}
                      />
                      <div style={{ fontSize: 11 }}>Khử ám viền Spill ({clip.chromaKey.spillSuppression.toFixed(2)})</div>
                      <input
                        type="range"
                        className="glass-slider"
                        min={0}
                        max={1}
                        step={0.02}
                        value={clip.chromaKey.spillSuppression}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          previewSelectedClip((c) => {
                            c.chromaKey.spillSuppression = v;
                          });
                        }}
                        onPointerUp={() => void commitCurrentProject('Chroma Spill Suppression')}
                      />
                    </div>
                  </>
                )}

                {videoSubTab === 'mask' && (
                  <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>Mặt Nạ (Mask Shape)</div>
                    <select
                      className="glass-select"
                      value={clip.mask.shape}
                      onChange={(e) => {
                        const sh = e.target.value as MaskShape;
                        void updateSelectedClip(`Mask ${sh}`, (c) => {
                          c.mask.shape = sh;
                        });
                      }}
                    >
                      <option value="none">Không dùng Mask</option>
                      <option value="circle">Hình Tròn (Circle)</option>
                      <option value="rectangle">Hình Chữ Nhật (Rect)</option>
                      <option value="heart">Trái Tim (Heart SDF)</option>
                      <option value="star">Ngôi Sao (Star SDF)</option>
                      <option value="linear">Chia đôi (Linear)</option>
                      <option value="mirror">Gương (Mirror)</option>
                    </select>
                    <div style={{ fontSize: 11 }}>Feather ({clip.mask.feather.toFixed(2)})</div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={0}
                      max={0.3}
                      step={0.01}
                      value={clip.mask.feather}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        previewSelectedClip((c) => {
                          c.mask.feather = v;
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject('Mask Feather')}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 10 }}>Rộng ({clip.mask.width.toFixed(2)})</div>
                        <input
                          type="range"
                          className="glass-slider"
                          min={0.1}
                          max={1}
                          step={0.02}
                          value={clip.mask.width}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            previewSelectedClip((c) => {
                              c.mask.width = v;
                            });
                          }}
                          onPointerUp={() => void commitCurrentProject('Mask Width')}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 10 }}>Cao ({clip.mask.height.toFixed(2)})</div>
                        <input
                          type="range"
                          className="glass-slider"
                          min={0.1}
                          max={1}
                          step={0.02}
                          value={clip.mask.height}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            previewSelectedClip((c) => {
                              c.mask.height = v;
                            });
                          }}
                          onPointerUp={() => void commitCurrentProject('Mask Height')}
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: 11 }}>Xoay Mask ({clip.mask.rotation}°)</div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={-180}
                      max={180}
                      step={1}
                      value={clip.mask.rotation}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        previewSelectedClip((c) => {
                          c.mask.rotation = v;
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject('Mask Rotation')}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                      <input
                        type="checkbox"
                        checked={clip.mask.inverted}
                        onChange={(e) => {
                          const inv = e.target.checked;
                          void updateSelectedClip('Đảo Mask', (c) => {
                            c.mask.inverted = inv;
                          });
                        }}
                      />
                      Đảo ngược Mask (Invert)
                    </label>
                  </div>
                )}

                {videoSubTab === 'retouch' && (
                  <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#f9a8d4' }}>Làm Đẹp Khuôn Mặt &amp; Da (Retouch)</span>
                      <button
                        className="glass-btn"
                        style={{ padding: '3px 7px', fontSize: 10 }}
                        onClick={() =>
                          void updateSelectedClip('Reset Retouch', (c) => {
                            c.retouch = { smoothSkin: 0, brighten: 0, glow: 0 };
                          })
                        }
                      >
                        Reset
                      </button>
                    </div>
                    {(
                      [
                        { key: 'smoothSkin', label: 'Mịn da tự nhiên (Smooth Skin)' },
                        { key: 'brighten', label: 'Sáng tông da (Brighten)' },
                        { key: 'glow', label: 'Rạng rỡ hào quang (Beauty Glow)' },
                      ] as const
                    ).map((item) => {
                      const val = clip.retouch?.[item.key] ?? 0;
                      return (
                        <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span>{item.label}</span>
                            <span className="mono">{Math.round(val * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            className="glass-slider"
                            min={0}
                            max={1}
                            step={0.02}
                            value={val}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              previewSelectedClip((c) => {
                                c.retouch = {
                                  smoothSkin: c.retouch?.smoothSkin ?? 0,
                                  brighten: c.retouch?.brighten ?? 0,
                                  glow: c.retouch?.glow ?? 0,
                                  [item.key]: v,
                                };
                              });
                            }}
                            onPointerUp={() => void commitCurrentProject(`Retouch ${item.key}`)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {inspectorTab === 'color' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {(
                    [
                      { id: 'basic', label: 'Basic' },
                      { id: 'hsl', label: 'HSL' },
                      { id: 'curves', label: 'Curves' },
                      { id: 'wheels', label: 'Wheels' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      className={`glass-btn ${adjustSubTab === st.id ? 'glass-btn-active' : ''}`}
                      style={{ fontSize: 10, padding: '5px 3px', justifyContent: 'center' }}
                      onClick={() => setAdjustSubTab(st.id)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                  <button className="glass-btn" style={{ fontSize: 10 }} onClick={() => void applyClipColorAndFxToAll('color')}>
                    <CopyCheck size={11} color="#22d3ee" /> Áp All
                  </button>
                  <button className="glass-btn" style={{ fontSize: 10 }} onClick={() => void autoColorMatchToPreviousClip()} title="Tự cân màu khớp clip liền trước">
                    <Sparkles size={11} color="#a78bfa" /> Match
                  </button>
                  <button
                    className="glass-btn"
                    style={{ fontSize: 10 }}
                    onClick={() =>
                      void updateSelectedClip('Reset Màu & LUT', (c) => {
                        c.colorGrade.exposure = 0;
                        c.colorGrade.brightness = 0;
                        c.colorGrade.contrast = 0;
                        c.colorGrade.saturation = 0;
                        c.colorGrade.vibrance = 0;
                        c.colorGrade.temperature = 0;
                        c.colorGrade.tint = 0;
                        c.colorGrade.sharpness = 0;
                        c.colorGrade.vignette = 0;
                        c.colorGrade.lutId = null;
                        c.colorGrade.lutName = null;
                      })
                    }
                  >
                    <RotateCcw size={11} color="#fb7185" /> Reset
                  </button>
                </div>

                {clip.colorGrade.lutName && (
                  <div style={{ padding: 8, borderRadius: 10, background: 'rgba(34,211,238,0.1)', fontSize: 11 }}>
                    <div className="mono" style={{ color: '#67e8f9', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>LUT: {clip.colorGrade.lutName}</span>
                      <span>{Math.round(clip.colorGrade.lutIntensity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={0}
                      max={1}
                      step={0.02}
                      value={clip.colorGrade.lutIntensity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        previewSelectedClip((c) => {
                          c.colorGrade.lutIntensity = v;
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject('LUT Intensity')}
                    />
                  </div>
                )}

                {adjustSubTab === 'basic' && (
                  <>
                    {(
                      [
                        { label: 'Phơi sáng (Exposure)', key: 'exposure', min: -1, max: 1 },
                        { label: 'Độ sáng (Brightness)', key: 'brightness', min: -0.6, max: 0.6 },
                        { label: 'Tương phản (Contrast)', key: 'contrast', min: -0.8, max: 1 },
                        { label: 'Độ bão hòa (Saturation)', key: 'saturation', min: -1, max: 1 },
                        { label: 'Vibrance', key: 'vibrance', min: -1, max: 1 },
                        { label: 'Nhiệt màu (Temperature)', key: 'temperature', min: -1, max: 1 },
                        { label: 'Tint', key: 'tint', min: -1, max: 1 },
                        { label: 'Độ nét (Sharpness)', key: 'sharpness', min: 0, max: 1 },
                        { label: 'Tối góc (Vignette)', key: 'vignette', min: 0, max: 1 },
                      ] as const
                    ).map((item) => (
                      <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span>{item.label}</span>
                          <span className="mono">{clip.colorGrade[item.key].toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          className="glass-slider"
                          min={item.min}
                          max={item.max}
                          step={0.02}
                          value={clip.colorGrade[item.key]}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            previewSelectedClip((c) => {
                              c.colorGrade[item.key] = v;
                            });
                          }}
                          onPointerUp={() => void commitCurrentProject(`Màu ${item.label}`)}
                        />
                      </div>
                    ))}
                  </>
                )}

                {adjustSubTab === 'curves' && (
                  <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>RGB Curves (Click thêm / kéo)</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['master', 'red', 'green', 'blue'] as const).map((ch) => (
                          <button
                            key={ch}
                            onClick={() => setCurveChannel(ch)}
                            style={{
                              padding: '2px 6px',
                              borderRadius: 6,
                              border: 'none',
                              fontSize: 10,
                              cursor: 'pointer',
                              background: curveChannel === ch ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.06)',
                              color: '#fff',
                            }}
                          >
                            {ch.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(() => {
                      const pts = [...clip.colorGrade.curves[curveChannel]].sort((a, b) => a[0] - b[0]);
                      const stroke =
                        curveChannel === 'red'
                          ? '#ef4444'
                          : curveChannel === 'green'
                            ? '#22c55e'
                            : curveChannel === 'blue'
                              ? '#3b82f6'
                              : '#e2e8f0';
                      const poly = pts.map(([x, y]) => `${x * 100},${(1 - y) * 100}`).join(' ');
                      return (
                        <svg
                          viewBox="0 0 100 100"
                          style={{ width: '100%', height: 110, background: 'rgba(0,0,0,0.4)', borderRadius: 8, cursor: 'crosshair' }}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const nx = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width));
                            const ny = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
                            void updateSelectedClip(`RGB Curve ${curveChannel}`, (c) => {
                              const nextPts = c.colorGrade.curves[curveChannel].filter((p) => Math.abs(p[0] - nx) > 0.08);
                              nextPts.push([Number(nx.toFixed(2)), Number(ny.toFixed(2))]);
                              c.colorGrade.curves[curveChannel] = nextPts.sort((a, b) => a[0] - b[0]);
                            });
                          }}
                        >
                          <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
                          <polyline points={poly} fill="none" stroke={stroke} strokeWidth="2.2" />
                          {pts.map(([px, py], i) => (
                            <circle key={i} cx={px * 100} cy={(1 - py) * 100} r="3.4" fill={stroke} />
                          ))}
                        </svg>
                      );
                    })()}
                    <button
                      className="glass-btn"
                      style={{ width: '100%', marginTop: 6, fontSize: 10 }}
                      onClick={() =>
                        void updateSelectedClip(`Reset Curve ${curveChannel}`, (c) => {
                          c.colorGrade.curves[curveChannel] = [[0, 0], [1, 1]];
                        })
                      }
                    >
                      Reset đường cong {curveChannel.toUpperCase()}
                    </button>
                  </div>
                )}

                {adjustSubTab === 'hsl' && (
                  <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>HSL 8 Kênh Màu</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                      {HSL_CHANNELS.map((ch) => (
                        <button
                          key={ch.key}
                          onClick={() => setHslChannel(ch.key)}
                          title={ch.label}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: ch.color,
                            border: hslChannel === ch.key ? '2.5px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                    {(['hue', 'sat', 'lum'] as const).map((prop) => {
                      const val = clip.colorGrade.hsl[hslChannel]?.[prop] ?? 0;
                      return (
                        <div key={prop} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
                            <span>{prop.toUpperCase()}</span>
                            <span className="mono">{val.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            className="glass-slider"
                            min={-1}
                            max={1}
                            step={0.05}
                            value={val}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              previewSelectedClip((c) => {
                                c.colorGrade.hsl[hslChannel] = {
                                  ...(c.colorGrade.hsl[hslChannel] ?? { hue: 0, sat: 0, lum: 0 }),
                                  [prop]: v,
                                };
                              });
                            }}
                            onPointerUp={() => void commitCurrentProject(`HSL ${hslChannel}.${prop}`)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {adjustSubTab === 'wheels' && (
                  <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>Color Wheels (Lift / Gamma / Gain)</div>
                    {(['lift', 'gamma', 'gain'] as const).map((wheel) => (
                      <div key={wheel} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: '#94a3b8' }}>{wheel}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                          {(['R', 'G', 'B'] as const).map((ch, idx) => (
                            <div key={ch} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span className="mono" style={{ fontSize: 9.5, color: idx === 0 ? '#fb7185' : idx === 1 ? '#34d399' : '#60a5fa' }}>
                                {ch} {clip.colorGrade.wheels[wheel][idx].toFixed(2)}
                              </span>
                              <input
                                type="range"
                                className="glass-slider"
                                min={-0.5}
                                max={0.5}
                                step={0.02}
                                value={clip.colorGrade.wheels[wheel][idx]}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  previewSelectedClip((c) => {
                                    c.colorGrade.wheels[wheel][idx] = val;
                                  });
                                }}
                                onPointerUp={() => void commitCurrentProject(`Wheel ${wheel} ${ch}`)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {inspectorTab === 'speed' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>Tốc độ phát</span>
                  <span className="mono">{clip.speed.rate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  className="glass-slider"
                  min={0.2}
                  max={8}
                  step={0.1}
                  value={clip.speed.rate}
                  onChange={(e) => {
                    const rate = Number(e.target.value);
                    previewSelectedClip((c) => {
                      c.speed.mode = 'uniform';
                      c.speed.rate = rate;
                      c.durationUs = computeDurationFromSpeed(c.sourceDurationUs, c.speed);
                    });
                  }}
                  onPointerUp={() => void commitCurrentProject(`Speed ${clip.speed.rate}x`)}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={clip.speed.reverse}
                    onChange={(e) => {
                      const rev = e.target.checked;
                      void updateSelectedClip('Đảo ngược video (Reverse)', (c) => {
                        c.speed.reverse = rev;
                      });
                    }}
                  />
                  Phát ngược (Reverse)
                </label>

                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>Đồ thị Speed Curve (Kéo điểm để chỉnh)</div>
                {(() => {
                  const pts = [...clip.speed.curvePoints].sort((a, b) => a.position - b.position);
                  const toY = (spd: number) => 92 - ((Math.min(5, Math.max(0.2, spd)) - 0.2) / 4.8) * 84;
                  const fromY = (py: number) => Number((0.2 + ((92 - py) / 84) * 4.8).toFixed(2));
                  const poly = pts.map((p) => `${p.position * 100},${toY(p.speed)}`).join(' ');
                  return (
                    <svg
                      viewBox="0 0 100 100"
                      style={{ width: '100%', height: 90, background: 'rgba(0,0,0,0.4)', borderRadius: 10 }}
                      onPointerMove={(e) => {
                        if (draggingSpeedIdx.current === null) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = Math.min(92, Math.max(8, ((e.clientY - rect.top) / rect.height) * 100));
                        const spd = Math.max(0.2, Math.min(5, fromY(y)));
                        const idx = draggingSpeedIdx.current;
                        previewSelectedClip((c) => {
                          c.speed.mode = 'curve';
                          c.speed.presetName = 'custom';
                          const nextPts = [...c.speed.curvePoints].sort((a, b) => a.position - b.position);
                          if (nextPts[idx]) nextPts[idx] = { ...nextPts[idx], speed: spd };
                          c.speed.curvePoints = nextPts;
                          c.durationUs = computeDurationFromSpeed(c.sourceDurationUs, c.speed);
                        });
                      }}
                      onPointerUp={() => {
                        if (draggingSpeedIdx.current !== null) {
                          draggingSpeedIdx.current = null;
                          void commitCurrentProject('Chỉnh Speed Curve');
                        }
                      }}
                    >
                      <line x1="0" y1={toY(1)} x2="100" y2={toY(1)} stroke="rgba(255,255,255,0.16)" strokeDasharray="3 3" />
                      <polyline points={poly} fill="none" stroke="#22d3ee" strokeWidth="2.2" />
                      {pts.map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.position * 100}
                          cy={toY(pt.speed)}
                          r="4"
                          fill="#fbbf24"
                          style={{ cursor: 'ns-resize' }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            draggingSpeedIdx.current = i;
                          }}
                        />
                      ))}
                    </svg>
                  );
                })()}

                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>Speed Curve Presets (Chuẩn CapCut)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {SPEED_PRESETS.map((sp) => (
                    <button
                      key={sp.id}
                      className={`glass-btn ${clip.speed.presetName === sp.id ? 'glass-btn-active' : ''}`}
                      onClick={() =>
                        void updateSelectedClip(`Speed Curve ${sp.label}`, (c) => {
                          c.speed.mode = 'curve';
                          c.speed.presetName = sp.id;
                          c.speed.curvePoints = sp.points;
                          c.durationUs = computeDurationFromSpeed(c.sourceDurationUs, c.speed);
                        })
                      }
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {inspectorTab === 'animation' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {(
                    [
                      { id: 'in', label: 'In (Vào)' },
                      { id: 'out', label: 'Out (Ra)' },
                      { id: 'combo', label: 'Combo' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      className={`glass-btn ${animSubTab === st.id ? 'glass-btn-active' : ''}`}
                      style={{ fontSize: 10.5, padding: '6px 4px', justifyContent: 'center' }}
                      onClick={() => setAnimSubTab(st.id)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {animSubTab === 'in' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Thời lượng vào (Duration)</span>
                      <span className="mono">{((clip.animation?.inDurationUs ?? 500_000) / US_PER_SEC).toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={0.15}
                      max={3.0}
                      step={0.05}
                      value={(clip.animation?.inDurationUs ?? 500_000) / US_PER_SEC}
                      onChange={(e) => {
                        const durUs = Math.round(Number(e.target.value) * US_PER_SEC);
                        previewSelectedClip((c) => {
                          c.animation = { ...(c.animation ?? {}), inDurationUs: durUs };
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject('Animation In Duration')}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {ANIM_IN_LIST.map((item) => {
                        const active = (clip.animation?.in ?? 'none') === item.id;
                        return (
                          <button
                            key={item.id}
                            className={`glass-btn ${active ? 'glass-btn-active' : ''}`}
                            style={{ fontSize: 11, justifyContent: 'center', padding: '7px 6px' }}
                            onClick={() =>
                              void updateSelectedClip(`Anim In ${item.label}`, (c) => {
                                c.animation = { ...(c.animation ?? {}), in: item.id };
                              })
                            }
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {animSubTab === 'out' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Thời lượng ra (Duration)</span>
                      <span className="mono">{((clip.animation?.outDurationUs ?? 500_000) / US_PER_SEC).toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={0.15}
                      max={3.0}
                      step={0.05}
                      value={(clip.animation?.outDurationUs ?? 500_000) / US_PER_SEC}
                      onChange={(e) => {
                        const durUs = Math.round(Number(e.target.value) * US_PER_SEC);
                        previewSelectedClip((c) => {
                          c.animation = { ...(c.animation ?? {}), outDurationUs: durUs };
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject('Animation Out Duration')}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {ANIM_OUT_LIST.map((item) => {
                        const active = (clip.animation?.out ?? 'none') === item.id;
                        return (
                          <button
                            key={item.id}
                            className={`glass-btn ${active ? 'glass-btn-active' : ''}`}
                            style={{ fontSize: 11, justifyContent: 'center', padding: '7px 6px' }}
                            onClick={() =>
                              void updateSelectedClip(`Anim Out ${item.label}`, (c) => {
                                c.animation = { ...(c.animation ?? {}), out: item.id };
                              })
                            }
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {animSubTab === 'combo' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {ANIM_COMBO_LIST.map((item) => {
                      const active = (clip.animation?.combo ?? 'none') === item.id;
                      return (
                        <button
                          key={item.id}
                          className={`glass-btn ${active ? 'glass-btn-active' : ''}`}
                          style={{ fontSize: 11, justifyContent: 'center', padding: '7px 6px' }}
                          onClick={() =>
                            void updateSelectedClip(`Anim Combo ${item.label}`, (c) => {
                              c.animation = { ...(c.animation ?? {}), combo: item.id };
                            })
                          }
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {inspectorTab === 'tracking' && (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#67e8f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Crosshair size={13} /> Motion Tracking (Bám Chuyển Động)
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Tạo điểm bám chuyển động cho Sticker / Text hoặc dùng Apple Vision Auto-Reframe.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    className="glass-btn glass-btn-primary"
                    style={{ fontSize: 10.5 }}
                    onClick={() => {
                      const localUs = Math.max(0, Math.min(clip.durationUs, playheadUs - clip.timelineStartUs));
                      void updateSelectedClip('Thêm điểm Motion Track', (c) => {
                        const list = [...(c.motionTrackPoints ?? [])];
                        list.push({ timeUs: localUs, x: 0.5, y: 0.5, scale: 1 });
                        list.sort((a, b) => a.timeUs - b.timeUs);
                        c.motionTrackPoints = list;
                      });
                    }}
                  >
                    + Thêm Điểm Track
                  </button>
                  <button
                    className="glass-btn"
                    style={{ fontSize: 10.5 }}
                    disabled={!clip.assetId}
                    onClick={() => clip.assetId && void runAiTask(clip.assetId, 'face-track')}
                  >
                    Auto Face Track
                  </button>
                </div>
                {(clip.motionTrackPoints ?? []).length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                    Chưa có điểm Track trên clip này.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {(clip.motionTrackPoints ?? []).map((pt, idx) => (
                      <div key={idx} style={{ padding: 7, borderRadius: 8, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10.5 }}>
                        <span className="mono" style={{ color: '#22d3ee' }}>{(pt.timeUs / US_PER_SEC).toFixed(2)}s</span>
                        <span className="mono">X:{pt.x.toFixed(2)} Y:{pt.y.toFixed(2)}</span>
                        <button
                          className="glass-btn"
                          style={{ padding: '2px 5px' }}
                          onClick={() =>
                            void updateSelectedClip('Xóa điểm Track', (c) => {
                              c.motionTrackPoints = (c.motionTrackPoints ?? []).filter((_, i) => i !== idx);
                            })
                          }
                        >
                          <Trash2 size={10} color="#fb7185" />
                        </button>
                      </div>
                    ))}
                    <button
                      className="glass-btn"
                      style={{ fontSize: 10.5 }}
                      onClick={() =>
                        void updateSelectedClip('Reset Tracking', (c) => {
                          c.motionTrackPoints = [];
                        })
                      }
                    >
                      Xóa Toàn Bộ Điểm Track
                    </button>
                  </div>
                )}
              </div>
            )}

            {inspectorTab === 'audio' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {(
                    [
                      { id: 'basic', label: 'Basic' },
                      { id: 'voice', label: 'Voice FX' },
                      { id: 'eq', label: 'EQ & Pitch' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      className={`glass-btn ${audioSubTab === st.id ? 'glass-btn-active' : ''}`}
                      style={{ fontSize: 10.5, padding: '6px 4px', justifyContent: 'center' }}
                      onClick={() => setAudioSubTab(st.id)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {audioSubTab === 'basic' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Âm lượng (Live WebAudio)</span>
                      <span className="mono">{Math.round(clip.audio.volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={0}
                      max={2}
                      step={0.05}
                      value={clip.audio.volume}
                      onChange={(e) => {
                        const vol = Number(e.target.value);
                        previewSelectedClip((c) => {
                          c.audio.volume = vol;
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject('Chỉnh âm lượng')}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Cân bằng Pan (L / R)</span>
                      <span className="mono">{clip.audio.pan === 0 ? 'Center' : clip.audio.pan.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={clip.audio.pan}
                      onChange={(e) => {
                        const pan = Number(e.target.value);
                        previewSelectedClip((c) => {
                          c.audio.pan = pan;
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject('Audio Pan')}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Fade In ({(clip.audio.fadeInUs / 1_000_000).toFixed(2)}s)</span>
                      <span>Fade Out ({(clip.audio.fadeOutUs / 1_000_000).toFixed(2)}s)</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input
                        type="range"
                        className="glass-slider"
                        min={0}
                        max={2_000_000}
                        step={100_000}
                        value={clip.audio.fadeInUs}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          previewSelectedClip((c) => {
                            c.audio.fadeInUs = v;
                          });
                        }}
                        onPointerUp={() => void commitCurrentProject('Fade In')}
                      />
                      <input
                        type="range"
                        className="glass-slider"
                        min={0}
                        max={2_000_000}
                        step={100_000}
                        value={clip.audio.fadeOutUs}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          previewSelectedClip((c) => {
                            c.audio.fadeOutUs = v;
                          });
                        }}
                        onPointerUp={() => void commitCurrentProject('Fade Out')}
                      />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={clip.audio.denoise}
                        onChange={(e) => {
                          const dn = e.target.checked;
                          void updateSelectedClip('Khử ồn giọng nói', (c) => {
                            c.audio.denoise = dn;
                          });
                        }}
                      />
                      Khử tiếng ồn AI (RNNoise / FFmpeg FFT)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={clip.audio.autoDucking}
                        onChange={(e) => {
                          const dk = e.target.checked;
                          void updateSelectedClip('Auto-Ducking', (c) => {
                            c.audio.autoDucking = dk;
                          });
                        }}
                      />
                      Auto-Ducking (Sidechain tự nhỏ nhạc)
                    </label>

                    {clip.kind === 'audio' && (
                      <button className="glass-btn glass-btn-primary" style={{ fontSize: 11 }} onClick={() => void smartRemixSelectedMusic()}>
                        <Sparkles size={13} /> Smart Music Remix (Tự khớp độ dài + Outro)
                      </button>
                    )}
                  </>
                )}

                {audioSubTab === 'voice' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(
                      [
                        { id: 'none', label: 'Gốc (Natural)' },
                        { id: 'podcast', label: 'Podcast Studio' },
                        { id: 'megaphone', label: 'Loa Phóng Thanh' },
                        { id: 'deep', label: 'Giọng Trầm (Deep)' },
                        { id: 'chipmunk', label: 'Sóc Nhí (Chipmunk)' },
                        { id: 'robot', label: 'Robot Synth' },
                      ] as const
                    ).map((vp) => (
                      <button
                        key={vp.id}
                        className={`glass-btn ${clip.audio.voicePreset === vp.id ? 'glass-btn-active' : ''}`}
                        style={{ fontSize: 11, justifyContent: 'center', padding: '8px 6px' }}
                        onClick={() =>
                          void updateSelectedClip(`Voice ${vp.label}`, (c) => {
                            c.audio.voicePreset = vp.id;
                          })
                        }
                      >
                        {vp.label}
                      </button>
                    ))}
                  </div>
                )}

                {audioSubTab === 'eq' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(clip.audio.compressorEnabled)}
                          onChange={(e) => {
                            const val = e.target.checked;
                            void updateSelectedClip('Audio Compressor', (c) => {
                              c.audio.compressorEnabled = val;
                            });
                          }}
                        />
                        Compressor
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(clip.audio.noiseGateEnabled)}
                          onChange={(e) => {
                            const val = e.target.checked;
                            void updateSelectedClip('Noise Gate', (c) => {
                              c.audio.noiseGateEnabled = val;
                            });
                          }}
                        />
                        Noise Gate
                      </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Chỉnh Cao Độ (Pitch Semitones)</span>
                      <span className="mono">{clip.audio.pitchSemitones ?? 0} st</span>
                    </div>
                    <input
                      type="range"
                      className="glass-slider"
                      min={-12}
                      max={12}
                      step={1}
                      value={clip.audio.pitchSemitones ?? 0}
                      onChange={(e) => {
                        const pVal = Number(e.target.value);
                        previewSelectedClip((c) => {
                          c.audio.pitchSemitones = pVal;
                        });
                      }}
                      onPointerUp={() => void commitCurrentProject('Chỉnh Pitch Semitones')}
                    />

                    <div style={{ padding: 8, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 600, marginBottom: 6 }}>
                        <span>5-Band Parametric EQ (dB)</span>
                        <button
                          style={{ background: 'none', border: 'none', color: '#22d3ee', cursor: 'pointer', fontSize: 10 }}
                          onClick={() =>
                            void updateSelectedClip('Reset 5-Band EQ', (c) => {
                              c.audio.eqBands = [0, 0, 0, 0, 0];
                            })
                          }
                        >
                          Flat
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                        {(['80', '250', '1k', '4k', '12k'] as const).map((hz, idx) => {
                          const val = clip.audio.eqBands?.[idx] ?? 0;
                          return (
                            <div key={hz} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                              <span className="mono" style={{ fontSize: 9.5, color: '#67e8f9' }}>{val > 0 ? `+${val}` : val}</span>
                              <input
                                type="range"
                                min={-12}
                                max={12}
                                step={1}
                                value={val}
                                onChange={(e) => {
                                  const gDb = Number(e.target.value);
                                  previewSelectedClip((c) => {
                                    const bands = [...(c.audio.eqBands ?? [0, 0, 0, 0, 0])] as [number, number, number, number, number];
                                    bands[idx] = gDb;
                                    c.audio.eqBands = bands;
                                  });
                                }}
                                onPointerUp={() => void commitCurrentProject(`EQ ${hz}Hz`)}
                                style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 22, height: 64 }}
                              />
                              <span className="mono" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{hz}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
