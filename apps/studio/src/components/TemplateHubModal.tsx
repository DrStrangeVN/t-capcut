import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileJson,
  FolderSearch,
  LayoutTemplate,
  Music,
  Search,
  Sparkles,
  Star,
  Upload,
  X,
} from 'lucide-react';
import { US_PER_SEC } from '@t-capcut/schema';
import { AUDIO_BY_ID, LUT_BY_ID, TEMPLATE_CATEGORIES, VIDEO_TEMPLATES_CATALOG } from '@t-capcut/presets';
import { engineApi } from '../engine/api';
import { useEditorStore } from '../store/useEditorStore';

const RATIO_FILTERS = ['all', '9:16', '16:9', '1:1', '2.35:1'] as const;

export const TemplateHubModal: React.FC = () => {
  const project = useEditorStore((s) => s.project);
  const templateHubOpen = useEditorStore((s) => s.templateHubOpen);
  const favoritePresetIds = useEditorStore((s) => s.favoritePresetIds);
  const setTemplateHubOpen = useEditorStore((s) => s.setTemplateHubOpen);
  const setTemplateModalPreset = useEditorStore((s) => s.setTemplateModalPreset);
  const toggleFavoritePreset = useEditorStore((s) => s.toggleFavoritePreset);
  const importUniversalTemplateFile = useEditorStore((s) => s.importUniversalTemplateFile);
  const importLocalCapCutDraft = useEditorStore((s) => s.importLocalCapCutDraft);
  const exportCurrentAsTemplatePack = useEditorStore((s) => s.exportCurrentAsTemplatePack);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);
  const setErrorMessage = useEditorStore((s) => s.setErrorMessage);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [hubTab, setHubTab] = useState<'builtin' | 'external'>('builtin');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [ratio, setRatio] = useState<(typeof RATIO_FILTERS)[number]>('all');
  const [customDir, setCustomDir] = useState('');
  const [directFilePath, setDirectFilePath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [localDrafts, setLocalDrafts] = useState<
    Array<{ name: string; draftPath: string; modifiedAt: number; source?: string; clipCount?: number }>
  >([]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return VIDEO_TEMPLATES_CATALOG.filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (ratio !== 'all' && t.aspectRatio !== ratio) return false;
      if (q) {
        const hay = `${t.name} ${t.desc} ${t.categoryLabel} ${t.aspectRatio} ${t.bpm}bpm`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, cat, ratio]);

  if (!templateHubOpen) return null;

  const runScan = async (dir?: string) => {
    setScanning(true);
    try {
      const res = await engineApi.scanLocalCapCutDrafts(dir);
      setLocalDrafts(res.drafts);
      if (res.drafts.length === 0) {
        setStatusMessage('Không tìm thấy dự án CapCut / JianYing nào trong thư mục đã quét.');
      } else {
        setStatusMessage(`Tìm thấy ${res.drafts.length} dự án CapCut / JianYing trên máy!`);
      }
    } catch (err) {
      setErrorMessage(`Lỗi quét CapCut: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const handleExportCapCutJson = async () => {
    if (!project) return;
    try {
      const res = await engineApi.exportInterop(project.id, 'capcut');
      const blob = new Blob([res.content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Đã xuất dự án thành CapCut "${res.filename}"!`);
    } catch (err) {
      setErrorMessage(`Lỗi xuất CapCut JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 82,
        background: 'rgba(2, 6, 23, 0.78)',
        backdropFilter: 'blur(18px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
      onClick={() => setTemplateHubOpen(false)}
    >
      <div
        className="nle-content-surface"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1140px, 96vw)',
          height: 'min(820px, 88vh)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 20,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.16)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            flexShrink: 0,
            padding: '14px 20px',
            background: 'linear-gradient(135deg, rgba(14,165,233,0.28), rgba(168,85,247,0.28))',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #22d3ee, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#04111d',
              }}
            >
              <LayoutTemplate size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 800 }}>Kho Mẫu CapCut &amp; Universal Template Hub</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                24 Mẫu dựng sẵn chuẩn CapCut · Nhập trực tiếp .capcut, draft_content.json, draft_info.json, .tcapcut-tpl
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className={`glass-btn ${hubTab === 'builtin' ? 'glass-btn-active' : ''}`}
              onClick={() => setHubTab('builtin')}
            >
              <Sparkles size={13} color="#22d3ee" /> Kho Mẫu CapCut (24+)
            </button>
            <button
              className={`glass-btn ${hubTab === 'external' ? 'glass-btn-active' : ''}`}
              onClick={() => setHubTab('external')}
            >
              <FileJson size={13} color="#c084fc" /> Mẫu CapCut Ngoài &amp; Dự Án Mac
            </button>
            <button className="glass-btn" onClick={() => setTemplateHubOpen(false)} title="Đóng">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        {hubTab === 'builtin' ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Search & Filters */}
            <div style={{ flexShrink: 0, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-secondary)' }} />
                  <input
                    className="glass-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm mẫu CapCut: Beat-Sync, Velocity, Vlog, Hormozi, Gaming, Polaroid..."
                    style={{ width: '100%', paddingLeft: 30 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 2 }}>Tỉ lệ:</span>
                  {RATIO_FILTERS.map((r) => (
                    <button
                      key={r}
                      className={`glass-btn ${ratio === r ? 'glass-btn-active' : ''}`}
                      style={{ padding: '4px 9px', fontSize: 11 }}
                      onClick={() => setRatio(r)}
                    >
                      {r === 'all' ? 'Tất cả' : r}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    className={`glass-btn ${cat === c.id ? 'glass-btn-active' : ''}`}
                    style={{ padding: '4px 10px', fontSize: 11, borderRadius: 999 }}
                    onClick={() => setCat(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards Grid */}
            <div className="glass-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                  gap: 14,
                  alignContent: 'start',
                }}
              >
              {filteredTemplates.map((tpl) => {
                const totalSec = (tpl.slots.reduce((s, sl) => s + sl.durationUs, 0) / US_PER_SEC).toFixed(1);
                const lutName = LUT_BY_ID[tpl.lutId]?.title ?? tpl.lutId;
                const musicName = AUDIO_BY_ID[tpl.musicId]?.name ?? tpl.musicId;
                const isFav = favoritePresetIds.includes(tpl.id);

                return (
                  <div
                    key={tpl.id}
                    style={{
                      borderRadius: 14,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'transform 0.16s ease, border-color 0.16s ease',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          height: 108,
                          background: tpl.previewGradient,
                          padding: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="mono" style={{ fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,0.6)', padding: '2px 7px', borderRadius: 6, color: '#fff' }}>
                            {tpl.aspectRatio} · {totalSec}s
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavoritePreset(tpl.id);
                            }}
                            style={{
                              background: 'rgba(0,0,0,0.45)',
                              border: 'none',
                              borderRadius: 6,
                              padding: 4,
                              cursor: 'pointer',
                              color: isFav ? '#facc15' : '#e2e8f0',
                            }}
                            title="Yêu thích"
                          >
                            <Star size={12} fill={isFav ? '#facc15' : 'none'} />
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <span className="mono" style={{ fontSize: 9.5, background: 'rgba(0,0,0,0.58)', padding: '2px 6px', borderRadius: 5, color: '#e2e8f0' }}>
                            {tpl.slots.length} Clips
                          </span>
                          <span className="mono" style={{ fontSize: 9.5, background: 'rgba(0,0,0,0.58)', padding: '2px 6px', borderRadius: 5, color: '#67e8f9' }}>
                            {tpl.bpm} BPM
                          </span>
                          <span style={{ fontSize: 9.5, background: 'rgba(0,0,0,0.58)', padding: '2px 6px', borderRadius: 5, color: '#fde68a' }}>
                            {tpl.categoryLabel}
                          </span>
                        </div>
                      </div>

                      <div style={{ padding: '10px 12px 6px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{tpl.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{tpl.desc}</div>
                        <div style={{ marginTop: 7, fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Music size={10} color="#34d399" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{musicName} · {lutName}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '8px 12px 12px' }}>
                      <button
                        className="glass-btn glass-btn-primary"
                        style={{ width: '100%', justifyContent: 'center', fontWeight: 700, fontSize: 11.5 }}
                        onClick={() => {
                          setTemplateHubOpen(false);
                          setTemplateModalPreset(tpl);
                        }}
                      >
                        <Sparkles size={13} /> Dùng Mẫu Ngay
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Dropzone for .capcut, .zip, draft_content.json, draft_info.json */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) await importUniversalTemplateFile(f);
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: 24,
                borderRadius: 16,
                border: dragOver ? '2px dashed #22d3ee' : '1.5px dashed rgba(255,255,255,0.2)',
                background: dragOver ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <Upload size={26} color="#22d3ee" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Kéo thả hoặc bấm để mở Mẫu CapCut / Dự án Ngoài</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                Hỗ trợ `.capcut`, `draft_content.json`, `draft_info.json`, `.zip` (tự giải nén cả video/nhạc đi kèm), `.tcapcut-tpl`, `.fcpxml`, `.otio`
              </div>
              <input
                ref={fileInputRef}
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

            {/* Scanner on Mac */}
            <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#67e8f9' }}>Quét Dự Án CapCut / JianYing Cài Trên Máy Mac</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Tự động kiểm tra `~/Movies/CapCut/...`, App Store Container (`com.lemon.lvoverseas`) và JianYing Pro.
                  </div>
                </div>
                <button className="glass-btn glass-btn-primary" disabled={scanning} onClick={() => void runScan(customDir || undefined)}>
                  <FolderSearch size={13} /> {scanning ? 'Đang quét...' : 'Quét Dự Án CapCut Ngay'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  className="glass-input"
                  value={customDir}
                  onChange={(e) => setCustomDir(e.target.value)}
                  placeholder="Hoặc dán thư mục dự án CapCut khác (ví dụ ~/Movies/CapCut/User Data/Projects/com.lveditor.draft)"
                  style={{ flex: 1, minWidth: 260 }}
                />
                <button className="glass-btn" disabled={scanning} onClick={() => void runScan(customDir)}>
                  Quét Thư Mục Này
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  className="glass-input"
                  value={directFilePath}
                  onChange={(e) => setDirectFilePath(e.target.value)}
                  placeholder="Hoặc dán đường dẫn trực tiếp tới file draft_content.json / draft_info.json"
                  style={{ flex: 1, minWidth: 260 }}
                />
                <button
                  className="glass-btn"
                  disabled={!directFilePath.trim()}
                  onClick={() => void importLocalCapCutDraft(directFilePath.trim())}
                >
                  Mở File Này →
                </button>
              </div>

              {localDrafts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                  {localDrafts.map((d) => (
                    <div
                      key={d.draftPath}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                          [{d.source ?? 'CapCut'}] {d.name} {typeof d.clipCount === 'number' ? `· ${d.clipCount} segments` : ''}
                        </div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.draftPath}
                        </div>
                      </div>
                      <button className="glass-btn glass-btn-primary" style={{ flexShrink: 0 }} onClick={() => void importLocalCapCutDraft(d.draftPath)}>
                        Mở Sang T-CapCut →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Export Shareable / CapCut */}
            <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Lưu Dự Án Hiện Tại Thành Mẫu Dùng Lại / Chia Sẻ</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Đóng gói thành file `.tcapcut-tpl` hoặc xuất ngược về CapCut `draft_content.json`.</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="glass-btn" onClick={() => void handleExportCapCutJson()}>
                  <FileJson size={13} color="#fbbf24" /> Xuất CapCut JSON
                </button>
                <button className="glass-btn glass-btn-primary" onClick={() => void exportCurrentAsTemplatePack()}>
                  <Download size={13} /> Lưu Gói `.tcapcut-tpl`
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
