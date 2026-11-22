import type {
  ChatCutPlan,
  MediaAsset,
  Project,
  TranscriptSegment,
} from '@t-capcut/schema';

export const API_BASE =
  (typeof window !== 'undefined' && (window as unknown as { __TCAPCUT_API__?: string }).__TCAPCUT_API__) ||
  '';

export function getSessionToken(): string {
  if (typeof window !== 'undefined') {
    const winTok = (window as unknown as { __TCAPCUT_TOKEN__?: string }).__TCAPCUT_TOKEN__;
    if (winTok) return winTok;
  }
  const envTok = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_TCAPCUT_TOKEN;
  return envTok || '';
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getSessionToken();
  return {
    ...(token ? { 'X-TCapCut-Token': token } : {}),
    ...(extra ?? {}),
  };
}

export function assetMediaUrl(
  assetId: string,
  variant: 'source' | 'proxy' | 'mask' | 'strip' | 'waveform' = 'source'
): string {
  const token = getSessionToken();
  const tokParam = token ? `&token=${encodeURIComponent(token)}` : '';
  return `${API_BASE}/api/media/asset/${encodeURIComponent(assetId)}?variant=${variant}${tokParam}`;
}

export function mediaStreamUrl(filePath: string): string {
  const token = getSessionToken();
  const tokParam = token ? `&token=${encodeURIComponent(token)}` : '';
  return `${API_BASE}/api/media/stream?path=${encodeURIComponent(filePath)}${tokParam}`;
}

export function presetAudioStreamUrl(filename: string): string {
  const token = getSessionToken();
  const tokParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE}/api/presets/audio/${encodeURIComponent(filename)}${tokParam}`;
}

async function reqJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(init?.headers),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export interface EngineHealth {
  ok: boolean;
  version: string;
  dataDir: string;
  ai: {
    visionAvailable: boolean;
    appleSpeechAvailable?: boolean;
    whisperCliPath: string | null;
    whisperModelPath: string | null;
    parakeetCliPath: string | null;
    rnnoiseModelPath?: string | null;
    ffmpegAvailable?: boolean;
    ffprobeAvailable?: boolean;
  };
}

export interface HistoryItem {
  id: string;
  parentId: string | null;
  label: string;
  timestamp: number;
  isCurrent: boolean;
}

export interface ExportProgressPayload {
  percent: number;
  outTimeUs: number;
  fps: number;
  speed: string;
  totalSizeBytes: number;
}

export interface ChatCutLlmConfig {
  provider: 'ollama' | 'openai' | 'gemini';
  endpoint?: string;
  model?: string;
  apiKey?: string;
}

export const engineApi = {
  health: () => reqJson<EngineHealth>('/api/health'),
  listProjects: () =>
    reqJson<{ projects: Array<{ id: string; name: string; updatedAt: number; clipCount: number; aspectRatio: string }> }>(
      '/api/projects'
    ),
  createProject: (name: string) =>
    reqJson<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  getProject: (id: string) =>
    reqJson<{ project: Project; history: HistoryItem[] }>(`/api/projects/${encodeURIComponent(id)}`),
  mutateProject: (id: string, label: string, project: Project) =>
    reqJson<{ project: Project; history: HistoryItem[] }>(`/api/projects/${encodeURIComponent(id)}/mutate`, {
      method: 'POST',
      body: JSON.stringify({ label, project }),
    }),
  undo: (id: string) =>
    reqJson<{ project: Project; undoneLabel: string | null; history: HistoryItem[] }>(
      `/api/projects/${encodeURIComponent(id)}/undo`,
      { method: 'POST', body: '{}' }
    ),
  redo: (id: string) =>
    reqJson<{ project: Project; redoneLabel: string | null; history: HistoryItem[] }>(
      `/api/projects/${encodeURIComponent(id)}/redo`,
      { method: 'POST', body: '{}' }
    ),
  jumpToCommand: (id: string, commandId: string) =>
    reqJson<{ project: Project; history: HistoryItem[] }>(`/api/projects/${encodeURIComponent(id)}/jump`, {
      method: 'POST',
      body: JSON.stringify({ commandId }),
    }),
  createSampleMedia: () => reqJson<{ asset: MediaAsset }>('/api/media/sample', { method: 'POST', body: '{}' }),
  uploadMedia: async (file: File): Promise<{ asset: MediaAsset }> => {
    const res = await fetch(`${API_BASE}/api/media/upload?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: authHeaders(),
      body: file,
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed');
    return data as { asset: MediaAsset };
  },
  importMediaPath: (filePath: string, generateProxy = true) =>
    reqJson<{ asset: MediaAsset }>('/api/media/import-path', {
      method: 'POST',
      body: JSON.stringify({ path: filePath, generateProxy }),
    }),
  generateProxy: (projectId: string, assetId: string) =>
    reqJson<{ proxyPath: string; project: Project }>('/api/media/proxy', {
      method: 'POST',
      body: JSON.stringify({ projectId, assetId }),
    }),
  createFreezeFrame: (projectId: string, assetId: string, sourceTimeUs: number) =>
    reqJson<{ asset: MediaAsset }>('/api/media/freeze-frame', {
      method: 'POST',
      body: JSON.stringify({ projectId, assetId, sourceTimeUs }),
    }),
  uploadLut: (content: string, id?: string) =>
    reqJson<{ id: string; title: string; size: number; filePath: string; data: number[] }>('/api/luts/upload', {
      method: 'POST',
      body: JSON.stringify({ id, content }),
    }),
  getLut: (lutId: string) =>
    reqJson<{ id: string; title: string; size: number; filePath: string; data: number[] }>(
      `/api/luts/${encodeURIComponent(lutId)}`
    ),
  getBuiltinLut: (lutId: string) =>
    reqJson<{ id: string; title: string; size: number; filePath: string; data: number[] }>(
      `/api/presets/luts/${encodeURIComponent(lutId)}`
    ),
  addBuiltinAudio: (presetId: string) =>
    reqJson<{ asset: MediaAsset }>('/api/presets/audio/add', {
      method: 'POST',
      body: JSON.stringify({ presetId }),
    }),
  importLocalPack: (pack: {
    packName?: string;
    luts?: Array<{ id?: string; filename?: string; content: string }>;
    audioFiles?: Array<{ filename: string; base64: string }>;
  }) =>
    reqJson<{
      ok: boolean;
      packName: string;
      importedLuts: Array<{ id: string; title: string; size: number; filePath: string; data: number[] }>;
      importedAudio: MediaAsset[];
    }>('/api/presets/import-pack', {
      method: 'POST',
      body: JSON.stringify(pack),
    }),
  revealInFinder: (filePath: string) =>
    reqJson<{ ok: boolean }>('/api/system/reveal', {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),
  downloadWhisperModel: (variant: 'tiny' | 'base' = 'tiny') =>
    reqJson<{ modelPath: string; bytes: number }>('/api/ai/download-whisper', {
      method: 'POST',
      body: JSON.stringify({ variant }),
    }),
  importCapCutDraft: (draft: unknown, projectId?: string) =>
    reqJson<{ project: Project }>('/api/interop/import-capcut', {
      method: 'POST',
      body: JSON.stringify({ draft, projectId }),
    }),
  batchExport: (jobs: Array<{ projectId: string; options: Record<string, unknown> }>) =>
    reqJson<{ results: Array<{ projectId: string; name: string; outputPath: string; durationMs: number; fileSizeBytes: number }> }>(
      '/api/export/batch',
      { method: 'POST', body: JSON.stringify({ jobs }) }
    ),
  analyzeAi: <T = Record<string, unknown>>(
    projectId: string,
    assetId: string,
    task: 'silence' | 'scenes' | 'beats' | 'transcribe' | 'matting' | 'face-track',
    language = 'vi'
  ) =>
    reqJson<T>('/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ projectId, assetId, task, language }),
    }),
  prerenderClip: (projectId: string, clipId: string) =>
    reqJson<{ hash: string; filePath: string; cacheHit: boolean; project: Project }>('/api/prerender', {
      method: 'POST',
      body: JSON.stringify({ projectId, clipId }),
    }),
  startExport: (projectId: string, options: Record<string, unknown>) =>
    reqJson<{ jobId: string; outputPath: string; mode: string }>('/api/export/start', {
      method: 'POST',
      body: JSON.stringify({ projectId, options }),
    }),
  sendWysiwygFrame: async (jobId: string, rgba: Uint8Array): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/export/${encodeURIComponent(jobId)}/frames`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
      body: rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength) as ArrayBuffer,
    });
    if (!res.ok) throw new Error(`WYSIWYG frame upload failed: ${res.status}`);
  },
  finishWysiwygFrames: (jobId: string) =>
    reqJson<{ result: { outputPath: string; modeUsed: string; durationMs: number; fileSizeBytes: number } }>(
      `/api/export/${encodeURIComponent(jobId)}/finish-frames`,
      { method: 'POST', body: '{}' }
    ),
  cancelExport: (jobId: string) =>
    reqJson<{ cancelled: boolean }>(`/api/export/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      body: '{}',
    }),
  subscribeExportEvents: (
    jobId: string,
    handlers: {
      onProgress?: (ev: ExportProgressPayload) => void;
      onDone?: (result: { outputPath: string; modeUsed: string; durationMs: number; fileSizeBytes: number }) => void;
      onError?: (message: string) => void;
      onCancelled?: () => void;
    }
  ): (() => void) => {
    const token = getSessionToken();
    const tokParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const es = new EventSource(`${API_BASE}/api/export/${encodeURIComponent(jobId)}/events${tokParam}`);
    es.addEventListener('progress', (e) => {
      handlers.onProgress?.(JSON.parse((e as MessageEvent).data) as ExportProgressPayload);
    });
    es.addEventListener('done', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as {
        result: { outputPath: string; modeUsed: string; durationMs: number; fileSizeBytes: number };
      };
      handlers.onDone?.(payload.result);
      es.close();
    });
    es.addEventListener('error', (e) => {
      const dataStr = (e as MessageEvent).data;
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr) as { error?: string };
          handlers.onError?.(parsed.error || 'Export error');
        } catch {
          handlers.onError?.('Export stream error');
        }
        es.close();
      }
    });
    es.addEventListener('cancelled', () => {
      handlers.onCancelled?.();
      es.close();
    });
    return () => es.close();
  },
  exportVideo: (projectId: string, options: Record<string, unknown>) =>
    reqJson<{
      result: {
        outputPath: string;
        modeUsed: string;
        durationMs: number;
        fileSizeBytes: number;
        losslessSpansCount?: number;
      };
    }>('/api/export', { method: 'POST', body: JSON.stringify({ projectId, options }) }),
  exportInterop: (projectId: string, format: 'capcut' | 'fcpxml' | 'otio') =>
    reqJson<{ filename: string; content: string }>('/api/interop/export', {
      method: 'POST',
      body: JSON.stringify({ projectId, format }),
    }),
  parseCubeLut: (content: string) =>
    reqJson<{ title: string; size: number; data: number[] }>('/api/interop/parse-lut', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  parseSrt: (content: string) =>
    reqJson<{ segments: TranscriptSegment[] }>('/api/interop/parse-srt', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  planChatCut: (
    projectId: string,
    prompt: string,
    options?: { selectedClipId?: string | null; llmConfig?: ChatCutLlmConfig | null }
  ) =>
    reqJson<{ plan: ChatCutPlan }>('/api/chatcut/plan', {
      method: 'POST',
      body: JSON.stringify({ projectId, prompt, ...options }),
    }),
  applyChatCut: (projectId: string, plan: ChatCutPlan) =>
    reqJson<{ project: Project; history: HistoryItem[] }>('/api/chatcut/apply', {
      method: 'POST',
      body: JSON.stringify({ projectId, plan }),
    }),
};
