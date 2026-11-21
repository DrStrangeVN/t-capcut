import type {
  ChatCutPlan,
  MediaAsset,
  Project,
  TranscriptSegment,
} from '@t-capcut/schema';

export const API_BASE =
  (typeof window !== 'undefined' && (window as unknown as { __TCAPCUT_API__?: string }).__TCAPCUT_API__) ||
  '';

export function mediaStreamUrl(filePath: string): string {
  return `${API_BASE}/api/media/stream?path=${encodeURIComponent(filePath)}`;
}

async function reqJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
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
    whisperCliPath: string | null;
    whisperModelPath: string | null;
    parakeetCliPath: string | null;
  };
}

export interface HistoryItem {
  id: string;
  parentId: string | null;
  label: string;
  timestamp: number;
  isCurrent: boolean;
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
  createSampleMedia: () => reqJson<{ asset: MediaAsset }>('/api/media/sample', { method: 'POST', body: '{}' }),
  uploadMedia: async (file: File): Promise<{ asset: MediaAsset }> => {
    const res = await fetch(`${API_BASE}/api/media/upload?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
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
  planChatCut: (projectId: string, prompt: string) =>
    reqJson<{ plan: ChatCutPlan }>('/api/chatcut/plan', {
      method: 'POST',
      body: JSON.stringify({ projectId, prompt }),
    }),
  applyChatCut: (projectId: string, plan: ChatCutPlan) =>
    reqJson<{ project: Project; history: HistoryItem[] }>('/api/chatcut/apply', {
      method: 'POST',
      body: JSON.stringify({ projectId, plan }),
    }),
};
