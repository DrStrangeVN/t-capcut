import React, { useMemo, useState } from 'react';
import { Film, Sparkles, Wand2, X } from 'lucide-react';
import { US_PER_SEC, type MediaAsset } from '@t-capcut/schema';
import { AUDIO_BY_ID, LUT_BY_ID } from '@t-capcut/presets';
import { useEditorStore } from '../store/useEditorStore';

export const TemplateModal: React.FC = () => {
  const project = useEditorStore((s) => s.project);
  const template = useEditorStore((s) => s.templateModalPreset);
  const setTemplateModalPreset = useEditorStore((s) => s.setTemplateModalPreset);
  const applyTemplateProject = useEditorStore((s) => s.applyTemplateProject);
  const createDemoSample = useEditorStore((s) => s.createDemoSample);

  const [slotMap, setSlotMap] = useState<Record<number, string>>({});

  const visualAssets: MediaAsset[] = useMemo(() => {
    if (!project) return [];
    return Object.values(project.assets).filter((a) => a.kind === 'video' || a.kind === 'image');
  }, [project]);

  if (!template) return null;

  const lutInfo = LUT_BY_ID[template.lutId];
  const musicInfo = AUDIO_BY_ID[template.musicId];

  const handleAutoFill = () => {
    if (visualAssets.length === 0) return;
    const filled: Record<number, string> = {};
    template.slots.forEach((_, idx) => {
      filled[idx] = visualAssets[idx % visualAssets.length]!.id;
    });
    setSlotMap(filled);
  };

  const handleBuild = async () => {
    const resolved: Array<MediaAsset | null> = template.slots.map((_, idx) => {
      const explicitId = slotMap[idx];
      if (explicitId && project?.assets[explicitId]) return project.assets[explicitId]!;
      return visualAssets.length > 0 ? visualAssets[idx % visualAssets.length]! : null;
    });
    await applyTemplateProject(template, resolved);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 85,
        background: 'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={() => setTemplateModalPreset(null)}
    >
      <div
        className="nle-content-surface"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 95vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 20,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.16)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            background: template.previewGradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, color: '#fff' }}>
              <Wand2 size={18} />
              <span>{template.name}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 2 }}>{template.desc}</div>
          </div>
          <button
            className="glass-btn"
            style={{ background: 'rgba(0,0,0,0.45)', padding: '6px 8px' }}
            onClick={() => setTemplateModalPreset(null)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="glass-scroll" style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11.5 }}>
            <span className="liquid-glass-pill" style={{ padding: '4px 10px' }}>
              Khung: <strong>{template.aspectRatio}</strong>
            </span>
            <span className="liquid-glass-pill" style={{ padding: '4px 10px' }}>
              Nhịp: <strong>{template.bpm} BPM</strong>
            </span>
            {lutInfo && (
              <span className="liquid-glass-pill" style={{ padding: '4px 10px' }}>
                3D LUT: <strong>{lutInfo.title}</strong>
              </span>
            )}
            {musicInfo && (
              <span className="liquid-glass-pill" style={{ padding: '4px 10px' }}>
                Nhạc: <strong>{musicInfo.name}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Chọn Video / Ảnh cho {template.slots.length} cảnh (Slot Replacement):
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {visualAssets.length === 0 && (
                <button className="glass-btn" onClick={() => void createDemoSample()}>
                  <Sparkles size={13} color="#22d3ee" /> Tạo Video Mẫu Trước
                </button>
              )}
              <button className="glass-btn" disabled={visualAssets.length === 0} onClick={handleAutoFill}>
                Auto-Fill Từ Media Bin
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {template.slots.map((slot, idx) => {
              const selectedId =
                slotMap[idx] ?? (visualAssets.length > 0 ? visualAssets[idx % visualAssets.length]!.id : '');
              return (
                <div
                  key={slot.id}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 600 }}>
                    <span>
                      #{idx + 1} · {slot.label}
                    </span>
                    <span className="mono" style={{ color: '#67e8f9' }}>
                      {(slot.durationUs / US_PER_SEC).toFixed(2)}s
                    </span>
                  </div>
                  <select
                    className="glass-input"
                    value={selectedId}
                    onChange={(e) => setSlotMap((prev) => ({ ...prev, [idx]: e.target.value }))}
                  >
                    {visualAssets.length === 0 && <option value="">-- Chưa có video/ảnh trong Media Bin --</option>}
                    {visualAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({(a.durationUs / US_PER_SEC).toFixed(1)}s)
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {slot.transitionId && <span>⇄ {slot.transitionId}</span>}
                    {slot.vfxId && <span>✨ {slot.vfxId}</span>}
                    {slot.speedMode === 'curve' && <span>⚡ Curve ({slot.speedPreset})</span>}
                    {slot.kenBurnsZoom && <span>🔍 Ken Burns</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button className="glass-btn" onClick={() => setTemplateModalPreset(null)}>
            Hủy
          </button>
          <button
            className="glass-btn glass-btn-primary"
            disabled={visualAssets.length === 0}
            onClick={() => void handleBuild()}
          >
            <Film size={14} /> Tạo Video Ngay (Full Timeline)
          </button>
        </div>
      </div>
    </div>
  );
};
