import React, { useMemo, useState } from 'react';
import { Command, Palette, Sparkles, X } from 'lucide-react';
import { LUTS_CATALOG, TRANSITIONS_CATALOG, VFX_CATALOG, VIDEO_TEMPLATES_CATALOG } from '@t-capcut/presets';
import { useEditorStore } from '../store/useEditorStore';

interface PaletteAction {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

export const CommandPaletteModal: React.FC = () => {
  const open = useEditorStore((s) => s.commandPaletteOpen);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const setCommandPaletteOpen = useEditorStore((s) => s.setCommandPaletteOpen);
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen);
  const setChatCutOpen = useEditorStore((s) => s.setChatCutOpen);
  const setFullscreenPreview = useEditorStore((s) => s.setFullscreenPreview);
  const fullscreenPreview = useEditorStore((s) => s.fullscreenPreview);
  const addVfxPreset = useEditorStore((s) => s.addVfxPreset);
  const applyBuiltinLut = useEditorStore((s) => s.applyBuiltinLut);
  const setClipTransition = useEditorStore((s) => s.setClipTransition);
  const setTemplateModalPreset = useEditorStore((s) => s.setTemplateModalPreset);
  const autoCutSelectedClipToBeats = useEditorStore((s) => s.autoCutSelectedClipToBeats);
  const autoSyncSfxAtCuts = useEditorStore((s) => s.autoSyncSfxAtCuts);
  const autoColorMatchToPreviousClip = useEditorStore((s) => s.autoColorMatchToPreviousClip);
  const smartRemixSelectedMusic = useEditorStore((s) => s.smartRemixSelectedMusic);
  const exportCurrentAsTemplatePack = useEditorStore((s) => s.exportCurrentAsTemplatePack);

  const [query, setQuery] = useState('');

  const actions = useMemo<PaletteAction[]>(() => {
    const base: PaletteAction[] = [
      { id: 'cmd_export', group: 'Studio', label: 'Mở Hộp Thoại Xuất Video WYSIWYG', hint: 'Export', run: () => setExportModalOpen(true) },
      { id: 'cmd_chatcut', group: 'AI', label: 'Mở T-ChatCut v3 Agentic Director', hint: '⌘K', run: () => setChatCutOpen(true) },
      { id: 'cmd_full', group: 'View', label: 'Bật/Tắt Toàn Màn Hình Preview', hint: '⌘⇧F', run: () => setFullscreenPreview(!fullscreenPreview) },
      { id: 'cmd_beatcut', group: 'Timeline', label: '⚡ Beat-Cut: Tự cắt clip khớp Beat Markers', run: () => void autoCutSelectedClipToBeats() },
      { id: 'cmd_autosfx', group: 'Audio', label: '🔊 Auto-SFX: Tự chèn Whoosh vào vết cắt', run: () => void autoSyncSfxAtCuts() },
      { id: 'cmd_remix', group: 'Audio', label: '🎵 Smart Music Remix (Tự khớp độ dài + Outro)', run: () => void smartRemixSelectedMusic() },
      { id: 'cmd_colormatch', group: 'Color', label: '🎨 Auto Color Match (Khớp màu clip liền trước)', run: () => void autoColorMatchToPreviousClip() },
      { id: 'cmd_tpl_pack', group: 'Template', label: '📦 Lưu Dự Án Thành Gói Mẫu (.tcapcut-tpl)', run: () => void exportCurrentAsTemplatePack() },
    ];

    VIDEO_TEMPLATES_CATALOG.forEach((tpl) => {
      base.push({ id: `tpl_${tpl.id}`, group: 'Template', label: `Mẫu: ${tpl.name}`, hint: tpl.aspectRatio, run: () => setTemplateModalPreset(tpl) });
    });
    LUTS_CATALOG.forEach((lut) => {
      base.push({ id: `lut_${lut.id}`, group: '3D LUT', label: `Áp LUT: ${lut.title}`, hint: '17³ CUBE', run: () => void applyBuiltinLut(lut) });
    });
    VFX_CATALOG.forEach((vfx) => {
      base.push({ id: `vfx_${vfx.id}`, group: 'VFX GPU', label: `Gắn VFX #${vfx.shaderIndex}: ${vfx.name}`, run: () => void addVfxPreset(vfx) });
    });
    if (selectedClipId) {
      TRANSITIONS_CATALOG.forEach((tr) => {
        base.push({ id: `tr_${tr.id}`, group: 'Transition', label: `Chuyển cảnh: ${tr.name}`, run: () => void setClipTransition(selectedClipId, tr.id, true) });
      });
    }
    return base;
  }, [selectedClipId, fullscreenPreview, setExportModalOpen, setChatCutOpen, setFullscreenPreview, autoCutSelectedClipToBeats, autoSyncSfxAtCuts, smartRemixSelectedMusic, autoColorMatchToPreviousClip, exportCurrentAsTemplatePack, setTemplateModalPreset, applyBuiltinLut, addVfxPreset, setClipTransition]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q ? actions.filter((a) => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q)) : actions.slice(0, 16);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 90 }}
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="liquid-glass-modal"
        style={{ width: 'min(580px, 92vw)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Command size={16} color="#22d3ee" />
          <input
            id="tcapcut-cmd-search"
            name="cmd_search"
            aria-label="Tìm nhanh lệnh, hiệu ứng VFX, 3D LUT hoặc mẫu"
            autoFocus
            className="glass-input"
            placeholder="Gõ tên lệnh, VFX, 3D LUT, Transition, Template..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCommandPaletteOpen(false);
              if (e.key === 'Enter' && filtered[0]) {
                filtered[0].run();
                setCommandPaletteOpen(false);
              }
            }}
          />
          <button className="glass-btn" onClick={() => setCommandPaletteOpen(false)} aria-label="Đóng Command Palette">
            <X size={14} />
          </button>
        </div>
        <div className="glass-scroll" style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map((item) => (
            <button
              key={item.id}
              className="glass-btn"
              style={{ justifyContent: 'space-between', padding: '7px 10px', fontSize: 12 }}
              onClick={() => {
                item.run();
                setCommandPaletteOpen(false);
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {item.group === '3D LUT' ? <Palette size={13} color="#a78bfa" /> : <Sparkles size={13} color="#22d3ee" />}
                <span>{item.label}</span>
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                {item.group} {item.hint ? `· ${item.hint}` : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
