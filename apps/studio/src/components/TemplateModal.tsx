import React, { useMemo, useRef, useState } from 'react';
import { Film, Sparkles, Type, Upload, Wand2, X } from 'lucide-react';
import { US_PER_SEC, type MediaAsset } from '@t-capcut/schema';
import { AUDIO_BY_ID, LUT_BY_ID } from '@t-capcut/presets';
import { useEditorStore } from '../store/useEditorStore';

export const TemplateModal: React.FC = () => {
  const project = useEditorStore((s) => s.project);
  const template = useEditorStore((s) => s.templateModalPreset);
  const importReport = useEditorStore((s) => s.importReport);
  const setTemplateModalPreset = useEditorStore((s) => s.setTemplateModalPreset);
  const setImportReport = useEditorStore((s) => s.setImportReport);
  const applyTemplateProject = useEditorStore((s) => s.applyTemplateProject);
  const replaceClipAsset = useEditorStore((s) => s.replaceClipAsset);
  const createDemoSample = useEditorStore((s) => s.createDemoSample);
  const uploadMediaFile = useEditorStore((s) => s.uploadMediaFile);

  const slotUploadRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotIdxRef = useRef<number | 'bulk'>('bulk');

  const [modalTab, setModalTab] = useState<'slots' | 'text'>('slots');
  const [slotMap, setSlotMap] = useState<Record<number, string>>({});
  const [slotSlipUs, setSlotSlipUs] = useState<Record<number, number>>({});
  const [textOverrides, setTextOverrides] = useState<Record<number, string>>({});

  const visualAssets: MediaAsset[] = useMemo(() => {
    if (!project) return [];
    return Object.values(project.assets).filter((a) => a.kind === 'video' || a.kind === 'image');
  }, [project]);

  if (!template && !importReport) return null;

  if (!template && importReport) {
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
        onClick={() => setImportReport(null)}
      >
        <div
          className="nle-content-surface"
          onClick={(e) => e.stopPropagation()}
          style={{ width: 'min(640px, 95vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.16)' }}
        >
          <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Báo Cáo Tương Thích Mẫu Ngoài: {importReport.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>Độ tương thích ánh xạ hiệu ứng/chuyển cảnh: {importReport.compatibilityPct}%</div>
            </div>
            <button className="glass-btn" onClick={() => setImportReport(null)}>
              <X size={15} />
            </button>
          </div>
          <div className="glass-scroll" style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {importReport.mappedItems.length > 0 && (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.28)', fontSize: 11.5 }}>
                <div style={{ fontWeight: 700, color: '#34d399', marginBottom: 4 }}>✓ Đã ánh xạ 1:1 ({importReport.mappedItems.length})</div>
                <div style={{ color: 'var(--text-secondary)' }}>{importReport.mappedItems.slice(0, 8).join(' · ')}</div>
              </div>
            )}
            {importReport.fallbackItems.length > 0 && (
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.28)', fontSize: 11.5 }}>
                <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>⚠ Fallback ({importReport.fallbackItems.length})</div>
                <div>{importReport.fallbackItems.join(' · ')}</div>
              </div>
            )}
            {importReport.missingMediaSlots.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#67e8f9' }}>
                  Auto-Slot Replacement ({importReport.missingMediaSlots.length} clip gốc chưa có trên máy — chọn clip thay thế bên dưới):
                </div>
                {importReport.missingMediaSlots.map((slot) => (
                  <div key={slot.clipId} style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>#{slot.slotIndex + 1} · {slot.label}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{(slot.durationUs / US_PER_SEC).toFixed(2)}s</div>
                    </div>
                    <select
                      className="glass-select"
                      style={{ width: 220 }}
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) void replaceClipAsset(slot.clipId, e.target.value);
                      }}
                    >
                      <option value="">-- Chọn clip thay thế --</option>
                      {visualAssets.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="glass-btn glass-btn-primary" onClick={() => setImportReport(null)}>Xong & Chỉnh Trên Timeline</button>
          </div>
        </div>
      </div>
    );
  }

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
    await applyTemplateProject(template, resolved, { slotSlipUs, textOverrides });
  };

  const handleQuickDemoBuild = async () => {
    await createDemoSample();
    const freshProj = useEditorStore.getState().project;
    const assets = freshProj
      ? Object.values(freshProj.assets).filter((a) => a.kind === 'video' || a.kind === 'image')
      : [];
    if (assets.length > 0) {
      const resolved = template.slots.map((_, idx) => assets[idx % assets.length]!);
      await applyTemplateProject(template, resolved, { slotSlipUs, textOverrides });
    }
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <button
                className={`glass-btn ${modalTab === 'slots' ? 'glass-btn-active' : ''}`}
                style={{ fontSize: 11.5 }}
                onClick={() => setModalTab('slots')}
              >
                <Film size={12} /> Cảnh ({template.slots.length} Slots)
              </button>
              <button
                className={`glass-btn ${modalTab === 'text' ? 'glass-btn-active' : ''}`}
                style={{ fontSize: 11.5 }}
                onClick={() => setModalTab('text')}
              >
                <Type size={12} /> Chữ trong Mẫu ({template.texts.length})
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                className="glass-btn"
                onClick={() => {
                  pendingSlotIdxRef.current = 'bulk';
                  slotUploadRef.current?.click();
                }}
              >
                <Upload size={12} color="#22d3ee" /> Tải Media Từ Máy
              </button>
              {visualAssets.length === 0 && (
                <button className="glass-btn glass-btn-primary" onClick={() => void handleQuickDemoBuild()}>
                  <Sparkles size={13} /> Dùng Thử Với Video Mẫu
                </button>
              )}
              {visualAssets.length > 0 && (
                <button className="glass-btn" onClick={handleAutoFill}>
                  Auto-Fill ({visualAssets.length})
                </button>
              )}
            </div>
          </div>

          <input
            ref={slotUploadRef}
            type="file"
            multiple
            accept="video/*,image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length === 0) return;
              const uploaded: MediaAsset[] = [];
              for (const f of files) {
                const a = await uploadMediaFile(f);
                if (a) uploaded.push(a);
              }
              if (uploaded.length > 0) {
                if (pendingSlotIdxRef.current === 'bulk') {
                  setSlotMap((prev) => {
                    const next = { ...prev };
                    uploaded.forEach((a, ui) => {
                      const targetSlot = ui % template.slots.length;
                      next[targetSlot] = a.id;
                    });
                    return next;
                  });
                } else {
                  const targetIdx = pendingSlotIdxRef.current;
                  setSlotMap((prev) => ({ ...prev, [targetIdx]: uploaded[0]!.id }));
                }
              }
            }}
          />

          {modalTab === 'slots' ? (
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, fontWeight: 600 }}>
                      <span>
                        #{idx + 1} · {slot.label}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono" style={{ color: '#67e8f9' }}>
                          {(slot.durationUs / US_PER_SEC).toFixed(2)}s
                        </span>
                        <button
                          className="glass-btn"
                          style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() => {
                            pendingSlotIdxRef.current = idx;
                            slotUploadRef.current?.click();
                          }}
                          title="Tải video/ảnh riêng cho cảnh này"
                        >
                          <Upload size={10} /> Tải
                        </button>
                      </div>
                    </div>
                    <select
                      className="glass-input"
                      value={selectedId}
                      onChange={(e) => setSlotMap((prev) => ({ ...prev, [idx]: e.target.value }))}
                    >
                      {visualAssets.length === 0 && <option value="">-- Bấm + Tải hoặc Dùng Thử Với Video Mẫu --</option>}
                      {visualAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({(a.durationUs / US_PER_SEC).toFixed(1)}s)
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const matchedAsset = visualAssets.find((a) => a.id === selectedId);
                      const maxSlipSec = Math.max(0, ((matchedAsset?.durationUs ?? 0) - slot.durationUs) / US_PER_SEC);
                      if (!matchedAsset || maxSlipSec <= 0.2) return null;
                      const curSlipSec = (slotSlipUs[idx] ?? 0) / US_PER_SEC;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
                          <span>In: {curSlipSec.toFixed(1)}s</span>
                          <input
                            type="range"
                            className="glass-slider"
                            min={0}
                            max={maxSlipSec}
                            step={0.1}
                            value={curSlipSec}
                            onChange={(e) => setSlotSlipUs((prev) => ({ ...prev, [idx]: Math.round(Number(e.target.value) * US_PER_SEC) }))}
                          />
                        </div>
                      );
                    })()}
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
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {template.texts.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Mẫu này không có lớp chữ mặc định — bạn có thể tự thêm chữ trên Timeline sau khi dựng.
                </div>
              ) : (
                template.texts.map((ts, ti) => (
                  <div
                    key={ti}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>
                      <span>Dòng chữ #{ti + 1} {ts.karaoke ? '· Karaoke Pop' : '· Tiêu đề'}</span>
                      <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                        {(ts.startUs / US_PER_SEC).toFixed(1)}s → {((ts.startUs + ts.durationUs) / US_PER_SEC).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      className="glass-input"
                      value={textOverrides[ti] ?? ts.text}
                      onChange={(e) => setTextOverrides((prev) => ({ ...prev, [ti]: e.target.value }))}
                      placeholder={ts.text}
                    />
                  </div>
                ))
              )}
            </div>
          )}
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
