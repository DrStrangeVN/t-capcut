import React, { useState } from 'react';
import { Diamond, Gauge, Palette, Scissors, Sliders, Volume2 } from 'lucide-react';
import {
  EASING_PRESETS,
  type AudioClipState,
  type BlendMode,
  type MaskShape,
  type SpeedState,
} from '@t-capcut/schema';
import { useEditorStore, type InspectorTab } from '../store/useEditorStore';

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string; icon: React.ReactNode }> = [
  { id: 'transform', label: 'Biến đổi', icon: <Sliders size={13} /> },
  { id: 'color', label: 'Màu/LUT', icon: <Palette size={13} /> },
  { id: 'chroma', label: 'Mask/Key', icon: <Scissors size={13} /> },
  { id: 'speed', label: 'Tốc độ', icon: <Gauge size={13} /> },
  { id: 'audio', label: 'Audio', icon: <Volume2 size={13} /> },
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

export const RightInspector: React.FC = () => {
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const inspectorTab = useEditorStore((s) => s.inspectorTab);
  const setInspectorTab = useEditorStore((s) => s.setInspectorTab);
  const updateSelectedClip = useEditorStore((s) => s.updateSelectedClip);
  const addKeyframeAtPlayhead = useEditorStore((s) => s.addKeyframeAtPlayhead);

  const [curveChannel, setCurveChannel] = useState<'master' | 'red' | 'green' | 'blue'>('master');
  const [hslChannel, setHslChannel] = useState<string>('red');

  const clip = project && selectedClipId ? project.clips[selectedClipId] : null;

  return (
    <div className="liquid-glass-panel" style={{ width: 344, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 3, padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {INSPECTOR_TABS.map((t) => (
          <button
            key={t.id}
            className={`glass-btn ${inspectorTab === t.id ? 'glass-btn-active' : ''}`}
            style={{ flex: 1, padding: '6px 3px', fontSize: 10.5, whiteSpace: 'nowrap' }}
            onClick={() => setInspectorTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
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
              <span style={{ fontSize: 12, fontWeight: 600 }}>{clip.name}</span>
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
                    void updateSelectedClip('Sửa nội dung Text', (c) => {
                      if (c.text) {
                        c.text.text = v;
                        c.name = v.slice(0, 24);
                      }
                    });
                  }}
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
                      void updateSelectedClip('Cỡ chữ', (c) => {
                        if (c.text) c.text.fontSize = sz;
                      });
                    }}
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
              </div>
            )}

            {inspectorTab === 'transform' && (
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
                        void updateSelectedClip(`Chỉnh ${item.label}`, (c) => {
                          if (item.prop === 'scaleX') {
                            c.transform.scaleX = v;
                            c.transform.scaleY = v;
                          } else {
                            c.transform[item.prop] = v;
                          }
                        });
                      }}
                    />
                  </div>
                ))}

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

            {inspectorTab === 'color' && (
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
                        void updateSelectedClip(`Màu ${item.label}`, (c) => {
                          c.colorGrade[item.key] = v;
                        });
                      }}
                    />
                  </div>
                ))}

                {/* RGB Curves Editor */}
                <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>RGB Curves</span>
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
                        style={{ width: '100%', height: 92, background: 'rgba(0,0,0,0.4)', borderRadius: 8, cursor: 'crosshair' }}
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
                          <circle key={i} cx={px * 100} cy={(1 - py) * 100} r="3" fill={stroke} />
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

                {/* 8-Channel Selective HSL */}
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
                            void updateSelectedClip(`HSL ${hslChannel}.${prop}`, (c) => {
                              c.colorGrade.hsl[hslChannel] = {
                                ...(c.colorGrade.hsl[hslChannel] ?? { hue: 0, sat: 0, lum: 0 }),
                                [prop]: v,
                              };
                            });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {clip.colorGrade.lutName && (
                  <div style={{ padding: 8, borderRadius: 10, background: 'rgba(34,211,238,0.1)', fontSize: 11 }}>
                    LUT đang dùng: <strong>{clip.colorGrade.lutName}</strong>
                    <input
                      type="range"
                      className="glass-slider"
                      min={0}
                      max={1}
                      step={0.02}
                      value={clip.colorGrade.lutIntensity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        void updateSelectedClip('LUT Intensity', (c) => {
                          c.colorGrade.lutIntensity = v;
                        });
                      }}
                    />
                  </div>
                )}

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
                                void updateSelectedClip(`Wheel ${wheel} ${ch}`, (c) => {
                                  c.colorGrade.wheels[wheel][idx] = val;
                                });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {inspectorTab === 'chroma' && (
              <>
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
                      void updateSelectedClip('Chroma Similarity', (c) => {
                        c.chromaKey.similarity = v;
                      });
                    }}
                  />
                </div>

                <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Mặt Nạ (Mask)</div>
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
                      void updateSelectedClip('Mask Feather', (c) => {
                        c.mask.feather = v;
                      });
                    }}
                  />
                </div>
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
                    void updateSelectedClip(`Speed ${rate}x`, (c) => {
                      c.speed.mode = 'uniform';
                      c.speed.rate = rate;
                      c.durationUs = Math.max(200_000, Math.round(c.sourceDurationUs / rate));
                    });
                  }}
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
                        })
                      }
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {inspectorTab === 'audio' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>Âm lượng</span>
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
                    void updateSelectedClip('Âm lượng', (c) => {
                      c.audio.volume = vol;
                    });
                  }}
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
                      void updateSelectedClip('Fade In', (c) => {
                        c.audio.fadeInUs = v;
                      });
                    }}
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
                      void updateSelectedClip('Fade Out', (c) => {
                        c.audio.fadeOutUs = v;
                      });
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11 }}>Hiệu ứng Giọng nói (Voice Changer)</label>
                  <select
                    className="glass-select"
                    value={clip.audio.voicePreset}
                    onChange={(e) => {
                      const vp = e.target.value as AudioClipState['voicePreset'];
                      void updateSelectedClip(`Voice ${vp}`, (c) => {
                        c.audio.voicePreset = vp;
                      });
                    }}
                  >
                    <option value="none">Gốc (Natural)</option>
                    <option value="podcast">Podcast Studio (Warm EQ)</option>
                    <option value="megaphone">Loa Phóng Thanh (Megaphone)</option>
                    <option value="deep">Giọng Trầm (Deep)</option>
                    <option value="chipmunk">Sóc Nhí (Chipmunk)</option>
                    <option value="robot">Robot Synth</option>
                  </select>
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
                  Khử tiếng ồn AI (FFmpeg FFT)
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
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
