import React, { useState } from 'react';
import { Bot, Check, Settings2, Sparkles, X } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';

const QUICK_PROMPTS = [
  'Cắt hết khoảng lặng và thêm phụ đề karaoke màu vàng',
  'Chuyển khung hình 9:16 cho TikTok và chỉnh màu cinematic ấm',
  'Tách cảnh tự động, gắn beat markers và Beat-Cut khớp nhịp',
  'Khử ồn giọng nói Podcast Studio và đưa chữ ra sau chủ thể',
  'Kịch bản: 3 bí quyết quay vlog đẹp. Ánh sáng tự nhiên luôn thắng. Dùng LUT Kodak 2383 ngay hôm nay.',
];

export const ChatCutModal: React.FC = () => {
  const open = useEditorStore((s) => s.chatCutOpen);
  const pendingPlan = useEditorStore((s) => s.pendingPlan);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const llmConfig = useEditorStore((s) => s.llmConfig);

  const setChatCutOpen = useEditorStore((s) => s.setChatCutOpen);
  const requestChatCutPlan = useEditorStore((s) => s.requestChatCutPlan);
  const applyPendingPlan = useEditorStore((s) => s.applyPendingPlan);
  const discardPendingPlan = useEditorStore((s) => s.discardPendingPlan);
  const setLlmConfig = useEditorStore((s) => s.setLlmConfig);

  const [prompt, setPrompt] = useState('');
  const [showLlmSettings, setShowLlmSettings] = useState(false);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(4, 6, 12, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={() => setChatCutOpen(false)}
    >
      <div
        className="liquid-glass-modal"
        style={{ width: 640, maxWidth: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
            <Bot size={18} color="#22d3ee" />
            <span>T-ChatCut v3 Agentic Director ({llmConfig ? llmConfig.provider.toUpperCase() : 'Offline Smart Planner'})</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`glass-btn ${showLlmSettings ? 'glass-btn-active' : ''}`}
              onClick={() => setShowLlmSettings(!showLlmSettings)}
              title="Cấu hình AI (Local Ollama / OpenAI / Gemini)"
            >
              <Settings2 size={14} /> AI Model
            </button>
            <button className="glass-btn" onClick={() => setChatCutOpen(false)}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          Phạm vi tác động: {selectedClipId ? 'Clip đang chọn trên Timeline' : 'Toàn bộ Main Track'}
        </div>

        {showLlmSettings && (
          <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Provider</label>
              <select
                className="glass-select"
                value={llmConfig?.provider ?? 'offline'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'offline') setLlmConfig(null);
                  else setLlmConfig({ provider: v as 'ollama' | 'openai' | 'gemini', model: v === 'ollama' ? 'qwen2.5:7b' : '' });
                }}
              >
                <option value="offline">Offline Deterministic (Không cần API)</option>
                <option value="ollama">Local Ollama (127.0.0.1:11434)</option>
                <option value="openai">OpenAI Compatible</option>
                <option value="gemini">Google Gemini API</option>
              </select>
            </div>
            {llmConfig && (
              <>
                <div>
                  <label style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Model Name</label>
                  <input
                    className="glass-input"
                    value={llmConfig.model ?? ''}
                    placeholder={llmConfig.provider === 'ollama' ? 'qwen2.5:7b' : 'gemini-2.5-flash'}
                    onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                  />
                </div>
                {llmConfig.provider !== 'ollama' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>API Key (Lưu cục bộ trên trình duyệt)</label>
                    <input
                      type="password"
                      className="glass-input"
                      value={llmConfig.apiKey ?? ''}
                      onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="glass-input"
            placeholder="Nhập lệnh dựng phim bằng tiếng Việt hoặc English... (vd: cắt khoảng lặng, khử ồn podcast, glitch)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void requestChatCutPlan(prompt);
            }}
          />
          <button className="glass-btn glass-btn-primary" onClick={() => void requestChatCutPlan(prompt)}>
            <Sparkles size={14} /> Lập Kế Hoạch
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp}
              className="glass-btn"
              style={{ fontSize: 11 }}
              onClick={() => {
                setPrompt(qp);
                void requestChatCutPlan(qp);
              }}
            >
              {qp}
            </button>
          ))}
        </div>

        {pendingPlan && (
          <div style={{ padding: 12, borderRadius: 14, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.35)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#67e8f9' }}>{pendingPlan.summary}</div>
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pendingPlan.ops.map((op, i) => (
                <div key={i} style={{ fontSize: 11.5, padding: '5px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.3)' }}>
                  <span className="mono" style={{ color: '#fbbf24', marginRight: 8 }}>[{op.op}]</span>
                  <span>{op.description}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button className="glass-btn" onClick={() => discardPendingPlan()}>
                Hủy (Revert Ghost)
              </button>
              <button
                className="glass-btn glass-btn-primary"
                onClick={async () => {
                  await applyPendingPlan();
                  setChatCutOpen(false);
                }}
              >
                <Check size={14} /> Áp Dụng Lên Timeline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
