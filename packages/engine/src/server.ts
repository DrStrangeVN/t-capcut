import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  US_PER_SEC,
  exportToCapCutDraft,
  exportToFCPXML,
  exportToOTIO,
  importFromCapCutDraft,
  parseCubeLUT,
  parseSRT,
  type CapCutDraftContent,
  type MediaAsset,
  type Project,
} from '@t-capcut/schema';
import {
  detectBeats,
  detectScenes,
  detectSilence,
  downloadWhisperModel,
  getAiCapabilities,
  runAppleVisionFaceTrack,
  runAppleVisionMatting,
  transcribeMedia,
} from './ai.js';
import { applyChatCutPlan, buildChatCutPlan, type ChatCutLlmConfig } from './chatcut.js';
import { ProjectDatabase } from './db.js';
import {
  exportProject,
  prerenderSegment,
  startWysiwygPipeExport,
  type ExportOptions,
  type ExportProgressEvent,
  type ExportResult,
  type WysiwygPipeSession,
} from './exporter.js';
import {
  createDemoMediaSample,
  extractWaveformPeaks,
  generateProxy,
  generateThumbnailStrip,
  probeMedia,
} from './media.js';

const execFileAsync = promisify(execFile);

export interface EnginePaths {
  projectRoot: string;
  dataDir: string;
  studioDistDir?: string;
}

interface ActiveExportJob {
  id: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: ExportProgressEvent;
  result?: ExportResult;
  error?: string;
  abortController: AbortController;
  pipeSession?: WysiwygPipeSession;
  listeners: Set<(event: string, data: unknown) => void>;
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeadersFor(req: http.IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  if (origin && LOCAL_ORIGIN_RE.test(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'Content-Type, X-TCapCut-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    };
  }
  return {};
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return (text ? JSON.parse(text) : {}) as T;
}

async function readRawBuffer(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sendJson(req: http.IncomingMessage, res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeadersFor(req),
  });
  res.end(body);
}

function serveMediaWithRange(req: http.IncomingMessage, res: http.ServerResponse, filePath: string): void {
  if (!fs.existsSync(filePath)) {
    sendJson(req, res, 404, { error: 'File not found' });
    return;
  }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream';
  const range = req.headers.range;
  const cors = corsHeadersFor(req);

  if (!range) {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      ...cors,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const [startRaw, endRaw] = range.replace(/bytes=/, '').split('-');
  const start = Number.parseInt(startRaw, 10) || 0;
  const end = endRaw ? Math.min(stat.size - 1, Number.parseInt(endRaw, 10)) : stat.size - 1;
  if (start >= stat.size || start > end) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, ...cors });
    res.end();
    return;
  }

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': contentType,
    ...cors,
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

export class TCapCutEngineServer {
  readonly db: ProjectDatabase;
  readonly paths: EnginePaths;
  readonly cacheDir: string;
  readonly mediaDir: string;
  readonly exportsDir: string;
  readonly modelsDir: string;
  readonly lutsDir: string;
  readonly tempDir: string;
  readonly sessionToken: string;
  private registeredAssets = new Map<string, MediaAsset>();
  private exportJobs = new Map<string, ActiveExportJob>();
  private server: http.Server | null = null;

  constructor(paths: EnginePaths, sessionToken?: string) {
    this.paths = paths;
    this.sessionToken =
      sessionToken || process.env.TCAPCUT_SESSION_TOKEN || crypto.randomBytes(24).toString('hex');
    this.cacheDir = path.join(paths.dataDir, 'cache');
    this.mediaDir = path.join(paths.dataDir, 'media');
    this.exportsDir = path.join(paths.dataDir, 'exports');
    this.modelsDir = path.join(paths.dataDir, 'models');
    this.lutsDir = path.join(paths.dataDir, 'luts');
    this.tempDir = path.join(paths.dataDir, 'tmp');
    [this.cacheDir, this.mediaDir, this.exportsDir, this.modelsDir, this.lutsDir, this.tempDir].forEach((d) =>
      fs.mkdirSync(d, { recursive: true })
    );
    this.db = new ProjectDatabase(path.join(paths.dataDir, 'tcapcut.sqlite'));

    if (this.db.listProjects().length === 0) {
      this.db.createProject('proj_default', 'T-CapCut Studio Demo');
    }
  }

  private isAuthorized(req: http.IncomingMessage, reqUrl: URL): boolean {
    const headerToken = req.headers['x-tcapcut-token'];
    const queryToken = reqUrl.searchParams.get('token');
    return headerToken === this.sessionToken || queryToken === this.sessionToken;
  }

  private resolveAssetVariantPath(assetId: string, variant: string): string | null {
    const asset = this.registeredAssets.get(assetId) ?? this.db.findAssetById(assetId);
    if (!asset) return null;
    this.registeredAssets.set(assetId, asset);
    if (variant === 'proxy' && asset.proxyPath) return asset.proxyPath;
    if (variant === 'mask' && asset.mattingMaskPath) return asset.mattingMaskPath;
    if (variant === 'strip' && asset.thumbnailStripPath) return asset.thumbnailStripPath;
    if (variant === 'waveform' && asset.waveformPath) return asset.waveformPath;
    return asset.sourcePath;
  }

  private isAllowedStreamPath(candidatePath: string): boolean {
    let realTarget: string;
    try {
      realTarget = fs.realpathSync(candidatePath);
    } catch {
      return false;
    }

    try {
      const realDataDir = fs.realpathSync(this.paths.dataDir);
      if (realTarget === realDataDir || realTarget.startsWith(realDataDir + path.sep)) {
        return true;
      }
    } catch {
      // ignore
    }

    for (const asset of this.registeredAssets.values()) {
      const paths = [
        asset.sourcePath,
        asset.proxyPath,
        asset.mattingMaskPath,
        asset.thumbnailStripPath,
        asset.waveformPath,
      ].filter((p): p is string => Boolean(p));
      for (const p of paths) {
        try {
          if (fs.realpathSync(p) === realTarget) return true;
        } catch {
          // ignore
        }
      }
    }

    for (const summary of this.db.listProjects()) {
      const proj = this.db.getProject(summary.id);
      if (!proj) continue;
      for (const asset of Object.values(proj.assets)) {
        this.registeredAssets.set(asset.id, asset);
        if (asset.sourcePath) {
          try {
            if (fs.realpathSync(asset.sourcePath) === realTarget) return true;
          } catch {
            // ignore
          }
        }
      }
    }

    return false;
  }

  async start(port = 47890): Promise<{ port: number; url: string }> {
    if (this.server) {
      const addr = this.server.address() as { port: number };
      return { port: addr.port, url: `http://127.0.0.1:${addr.port}` };
    }

    this.server = http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeadersFor(req));
        res.end();
        return;
      }

      try {
        await this.handleRequest(req, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(req, res, 500, { error: message });
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, '127.0.0.1', () => resolve());
    });
    const addr = this.server.address() as { port: number };
    return { port: addr.port, url: `http://127.0.0.1:${addr.port}` };
  }

  async stop(): Promise<void> {
    for (const job of this.exportJobs.values()) {
      if (job.status === 'running') {
        job.abortController.abort();
        job.pipeSession?.cancel();
      }
    }
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    this.db.close();
  }

  private emitJobEvent(job: ActiveExportJob, event: string, data: unknown): void {
    for (const listener of job.listeners) {
      listener(event, data);
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    // Public lightweight health check (redacts raw disk paths unless authorized)
    if (pathname === '/api/health' && req.method === 'GET') {
      const caps = getAiCapabilities(this.paths.projectRoot, this.modelsDir);
      const authed = this.isAuthorized(req, reqUrl);
      sendJson(req, res, 200, {
        ok: true,
        version: '2.0.0',
        dataDir: authed ? this.paths.dataDir : '[redacted]',
        ai: {
          visionAvailable: caps.visionAvailable,
          appleSpeechAvailable: caps.appleSpeechAvailable,
          whisperCliPath: caps.whisperCliPath,
          whisperModelPath: caps.whisperModelPath,
          parakeetCliPath: caps.parakeetCliPath,
          rnnoiseModelPath: caps.rnnoiseModelPath,
          ffmpegAvailable: Boolean(caps.ffmpegPath),
          ffprobeAvailable: Boolean(caps.ffprobePath),
          ffmpegFilters: caps.ffmpegFilters,
        },
      });
      return;
    }

    // All /api/* endpoints enforce session token
    if (pathname.startsWith('/api/') && !this.isAuthorized(req, reqUrl)) {
      sendJson(req, res, 401, { error: 'Unauthorized: missing or invalid session token' });
      return;
    }

    if (pathname === '/api/projects' && req.method === 'GET') {
      sendJson(req, res, 200, { projects: this.db.listProjects() });
      return;
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      const body = await readJsonBody<{ id?: string; name?: string }>(req);
      const id = body.id || `proj_${Date.now()}`;
      const project = this.db.createProject(id, body.name || 'Dự án T-CapCut Mới');
      sendJson(req, res, 201, { project });
      return;
    }

    const projMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projMatch) {
      const id = decodeURIComponent(projMatch[1]);
      if (req.method === 'GET') {
        const project = this.db.getProject(id);
        if (!project) return sendJson(req, res, 404, { error: 'Project not found' });
        Object.values(project.assets).forEach((a) => this.registeredAssets.set(a.id, a));
        return sendJson(req, res, 200, { project, history: this.db.getHistory(id) });
      }
      if (req.method === 'DELETE') {
        return sendJson(req, res, 200, { deleted: this.db.deleteProject(id) });
      }
    }

    const mutateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/mutate$/);
    if (mutateMatch && req.method === 'POST') {
      const id = decodeURIComponent(mutateMatch[1]);
      const body = await readJsonBody<{ label?: string; project: Project }>(req);
      const saved = this.db.applyProjectSnapshot(id, body.label || 'Edit Timeline', body.project);
      return sendJson(req, res, 200, { project: saved, history: this.db.getHistory(id) });
    }

    const undoMatch = pathname.match(/^\/api\/projects\/([^/]+)\/(undo|redo)$/);
    if (undoMatch && req.method === 'POST') {
      const id = decodeURIComponent(undoMatch[1]);
      const action = undoMatch[2];
      const result = action === 'undo' ? this.db.undo(id) : this.db.redo(id);
      return sendJson(req, res, 200, { ...result, history: this.db.getHistory(id) });
    }

    const jumpMatch = pathname.match(/^\/api\/projects\/([^/]+)\/jump$/);
    if (jumpMatch && req.method === 'POST') {
      const id = decodeURIComponent(jumpMatch[1]);
      const body = await readJsonBody<{ commandId: string }>(req);
      const project = this.db.jumpToCommand(id, body.commandId);
      return sendJson(req, res, 200, { project, history: this.db.getHistory(id) });
    }

    // Asset-ID scoped secure media streaming
    const assetStreamMatch = pathname.match(/^\/api\/media\/asset\/([^/]+)$/);
    if (assetStreamMatch && req.method === 'GET') {
      const assetId = decodeURIComponent(assetStreamMatch[1]);
      const variant = reqUrl.searchParams.get('variant') || 'source';
      const target = this.resolveAssetVariantPath(assetId, variant);
      if (!target) return sendJson(req, res, 404, { error: 'Asset not found' });
      return serveMediaWithRange(req, res, target);
    }

    // Allowlist-confined stream route (rejects arbitrary paths like /etc/passwd)
    if (pathname === '/api/media/stream' && req.method === 'GET') {
      const filePath = reqUrl.searchParams.get('path');
      if (!filePath) return sendJson(req, res, 400, { error: 'Missing path parameter' });
      if (!this.isAllowedStreamPath(filePath)) {
        return sendJson(req, res, 403, { error: 'Forbidden: path outside registered media/cache allowlist' });
      }
      return serveMediaWithRange(req, res, filePath);
    }

    // Reveal file in macOS Finder
    if (pathname === '/api/system/reveal' && req.method === 'POST') {
      const body = await readJsonBody<{ path: string }>(req);
      if (body.path && fs.existsSync(body.path) && this.isAllowedStreamPath(body.path)) {
        await execFileAsync('open', ['-R', body.path]);
        return sendJson(req, res, 200, { ok: true });
      }
      return sendJson(req, res, 404, { error: 'File not found or not allowed' });
    }

    // Zero-OOM Streaming Upload directly to disk via node:stream/promises pipeline
    if (pathname === '/api/media/upload' && req.method === 'POST') {
      const filename = reqUrl.searchParams.get('name') || `upload_${Date.now()}.mp4`;
      const safeName = `${Date.now()}_${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const destPath = path.join(this.mediaDir, safeName);
      const writeStream = fs.createWriteStream(destPath);
      try {
        await pipeline(req, writeStream);
      } catch (err) {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        throw err;
      }

      const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const asset = await probeMedia(destPath, assetId);
      const [stripPath, waveformPath] = await Promise.all([
        asset.kind !== 'audio' ? generateThumbnailStrip(asset, this.cacheDir).catch(() => null) : Promise.resolve(null),
        asset.hasAudio ? extractWaveformPeaks(asset, this.cacheDir).catch(() => null) : Promise.resolve(null),
      ]);
      asset.thumbnailStripPath = stripPath;
      asset.waveformPath = waveformPath;
      this.registeredAssets.set(asset.id, asset);
      return sendJson(req, res, 200, { asset });
    }

    // Import existing file path on disk
    if (pathname === '/api/media/import-path' && req.method === 'POST') {
      const body = await readJsonBody<{ path: string; generateProxy?: boolean }>(req);
      const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const asset = await probeMedia(body.path, assetId);
      const [stripPath, waveformPath] = await Promise.all([
        asset.kind !== 'audio' ? generateThumbnailStrip(asset, this.cacheDir).catch(() => null) : Promise.resolve(null),
        asset.hasAudio ? extractWaveformPeaks(asset, this.cacheDir).catch(() => null) : Promise.resolve(null),
      ]);
      asset.thumbnailStripPath = stripPath;
      asset.waveformPath = waveformPath;
      if (body.generateProxy && asset.kind === 'video') {
        asset.proxyPath = await generateProxy(asset, this.cacheDir);
        asset.proxyStatus = 'ready';
      }
      this.registeredAssets.set(asset.id, asset);
      return sendJson(req, res, 200, { asset });
    }

    // Sample demo video
    if (pathname === '/api/media/sample' && req.method === 'POST') {
      const samplePath = await createDemoMediaSample(this.mediaDir);
      const assetId = `asset_demo_${Date.now()}`;
      const asset = await probeMedia(samplePath, assetId);
      const [stripPath, waveformPath, proxyPath] = await Promise.all([
        generateThumbnailStrip(asset, this.cacheDir).catch(() => null),
        extractWaveformPeaks(asset, this.cacheDir).catch(() => null),
        generateProxy(asset, this.cacheDir).catch(() => null),
      ]);
      asset.thumbnailStripPath = stripPath;
      asset.waveformPath = waveformPath;
      asset.proxyPath = proxyPath;
      asset.proxyStatus = proxyPath ? 'ready' : 'none';
      this.registeredAssets.set(asset.id, asset);
      return sendJson(req, res, 200, { asset });
    }

    // Persistent 3D LUT (.cube) Upload & Reload Retrieval
    if (pathname === '/api/luts/upload' && req.method === 'POST') {
      const body = await readJsonBody<{ id?: string; content: string }>(req);
      const parsed = parseCubeLUT(body.content);
      const lutId = body.id || `lut_${Date.now()}`;
      const cubePath = path.join(this.lutsDir, `${lutId}.cube`);
      fs.writeFileSync(cubePath, body.content, 'utf8');
      return sendJson(req, res, 200, {
        id: lutId,
        title: parsed.title,
        size: parsed.size,
        filePath: cubePath,
        data: Array.from(parsed.data),
      });
    }

    const lutGetMatch = pathname.match(/^\/api\/luts\/([^/]+)$/);
    if (lutGetMatch && req.method === 'GET') {
      const lutId = path.basename(decodeURIComponent(lutGetMatch[1])).replace(/[^a-zA-Z0-9._-]/g, '');
      const cubePath = path.join(this.lutsDir, `${lutId}.cube`);
      if (!fs.existsSync(cubePath)) return sendJson(req, res, 404, { error: 'LUT not found' });
      const parsed = parseCubeLUT(fs.readFileSync(cubePath, 'utf8'));
      return sendJson(req, res, 200, {
        id: lutId,
        title: parsed.title,
        size: parsed.size,
        filePath: cubePath,
        data: Array.from(parsed.data),
      });
    }

    // Generate proxy on demand
    if (pathname === '/api/media/proxy' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; assetId: string }>(req);
      const project = this.db.getProject(body.projectId);
      const asset = project?.assets[body.assetId];
      if (!project || !asset) return sendJson(req, res, 404, { error: 'Asset not found' });
      const proxyPath = await generateProxy(asset, this.cacheDir);
      asset.proxyPath = proxyPath;
      asset.proxyStatus = 'ready';
      this.registeredAssets.set(asset.id, asset);
      const updated = this.db.applyProjectSnapshot(project.id, `Generate Proxy: ${asset.name}`, project);
      return sendJson(req, res, 200, { proxyPath, project: updated });
    }

    // Freeze Frame extraction at exact source timestamp
    if (pathname === '/api/media/freeze-frame' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; assetId: string; sourceTimeUs: number }>(req);
      const project = this.db.getProject(body.projectId);
      const asset = project?.assets[body.assetId];
      if (!project || !asset) return sendJson(req, res, 404, { error: 'Asset not found' });
      const framePath = path.join(this.mediaDir, `freeze_${asset.id}_${Date.now()}.png`);
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', Math.max(0, body.sourceTimeUs / US_PER_SEC).toFixed(3),
        '-i', asset.sourcePath,
        '-frames:v', '1',
        framePath,
      ]);
      const freezeAsset = await probeMedia(framePath, `asset_freeze_${Date.now()}`);
      freezeAsset.durationUs = 2 * US_PER_SEC;
      freezeAsset.thumbnailStripPath = await generateThumbnailStrip(freezeAsset, this.cacheDir).catch(() => null);
      this.registeredAssets.set(freezeAsset.id, freezeAsset);
      return sendJson(req, res, 200, { asset: freezeAsset });
    }

    // Download Whisper GGML model
    if (pathname === '/api/ai/download-whisper' && req.method === 'POST') {
      const body = await readJsonBody<{ variant?: 'tiny' | 'base' }>(req);
      const resModel = await downloadWhisperModel(this.modelsDir, body.variant ?? 'tiny');
      return sendJson(req, res, 200, resModel);
    }

    // AI Endpoints
    if (pathname === '/api/ai/analyze' && req.method === 'POST') {
      const body = await readJsonBody<{
        projectId: string;
        assetId: string;
        task: 'silence' | 'scenes' | 'beats' | 'transcribe' | 'matting' | 'face-track';
        language?: string;
      }>(req);
      const project = this.db.getProject(body.projectId);
      const asset = project?.assets[body.assetId];
      if (!project || !asset) return sendJson(req, res, 404, { error: 'Asset not found' });

      const caps = getAiCapabilities(this.paths.projectRoot, this.modelsDir);

      if (body.task === 'silence') {
        const silences = await detectSilence(asset.sourcePath);
        return sendJson(req, res, 200, { silences });
      }
      if (body.task === 'scenes') {
        const scenesUs = await detectScenes(asset.sourcePath);
        asset.scenesUs = scenesUs;
        this.db.applyProjectSnapshot(project.id, `AI Scene Detect: ${asset.name}`, project);
        return sendJson(req, res, 200, { scenesUs });
      }
      if (body.task === 'beats') {
        const beatsUs = await detectBeats(asset.sourcePath, this.tempDir);
        asset.beatsUs = beatsUs;
        this.db.applyProjectSnapshot(project.id, `AI Beat Detect: ${asset.name}`, project);
        return sendJson(req, res, 200, { beatsUs });
      }
      if (body.task === 'transcribe') {
        const result = await transcribeMedia(
          asset,
          this.tempDir,
          this.modelsDir,
          body.language ?? 'vi',
          caps.visionBinaryPath
        );
        asset.transcript = result.segments;
        this.db.applyProjectSnapshot(project.id, `AI Transcribe: ${asset.name}`, project);
        return sendJson(req, res, 200, result);
      }
      if (body.task === 'matting') {
        if (!caps.visionBinaryPath) {
          return sendJson(req, res, 503, { error: 'Apple Vision native binary not compiled' });
        }
        const maskPath = await runAppleVisionMatting(asset, this.cacheDir, caps.visionBinaryPath);
        asset.mattingMaskPath = maskPath;
        this.registeredAssets.set(asset.id, asset);
        this.db.applyProjectSnapshot(project.id, `AI Person Matting: ${asset.name}`, project);
        return sendJson(req, res, 200, { mattingMaskPath: maskPath });
      }
      if (body.task === 'face-track') {
        if (!caps.visionBinaryPath) {
          return sendJson(req, res, 503, { error: 'Apple Vision native binary not compiled' });
        }
        const track = await runAppleVisionFaceTrack(asset, this.cacheDir, caps.visionBinaryPath);
        return sendJson(req, res, 200, { track });
      }
    }

    // Segment Pre-Render Cache
    if (pathname === '/api/prerender' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; clipId: string }>(req);
      const project = this.db.getProject(body.projectId);
      const clip = project?.clips[body.clipId];
      if (!project || !clip) return sendJson(req, res, 404, { error: 'Clip not found' });
      const resCache = await prerenderSegment(project, clip, path.join(this.cacheDir, 'prerender'), this.db);
      clip.prerenderHash = resCache.hash;
      const updated = this.db.applyProjectSnapshot(project.id, `Pre-render Segment: ${clip.name}`, project);
      return sendJson(req, res, 200, { ...resCache, project: updated });
    }

    // Start Async / SSE Export Job (Fast Path or Exact WYSIWYG Frame Pipe)
    if (pathname === '/api/export/start' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; options: Partial<ExportOptions> }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(req, res, 404, { error: 'Project not found' });

      const safeTitle = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const mode = body.options.mode ?? 'hardware';
      const ext =
        mode === 'audio-only' ? 'wav' : mode === 'subtitle-only' ? body.options.subtitleFormat ?? 'srt' : 'mp4';
      const outPath = body.options.outputPath || path.join(this.exportsDir, `${safeTitle}_${Date.now()}.${ext}`);
      const jobId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const abortController = new AbortController();

      const job: ActiveExportJob = {
        id: jobId,
        status: 'running',
        progress: { percent: 0, outTimeUs: 0, fps: 0, speed: '0x', totalSizeBytes: 0 },
        abortController,
        listeners: new Set(),
      };
      this.exportJobs.set(jobId, job);

      const fullOpts: ExportOptions = {
        mode,
        codec: body.options.codec ?? 'h264',
        width: body.options.width ?? project.settings.width,
        height: body.options.height ?? project.settings.height,
        fps: body.options.fps ?? project.settings.fps,
        bitrateKbps: body.options.bitrateKbps ?? 10000,
        burnSubtitles: body.options.burnSubtitles ?? true,
        loudnorm: body.options.loudnorm ?? true,
        subtitleFormat: body.options.subtitleFormat,
        rangeStartUs: body.options.rangeStartUs ?? null,
        rangeEndUs: body.options.rangeEndUs ?? null,
        lutsDir: this.lutsDir,
        modelsDir: this.modelsDir,
        outputPath: outPath,
        abortSignal: abortController.signal,
        onProgress: (ev) => {
          job.progress = ev;
          this.emitJobEvent(job, 'progress', ev);
        },
      };

      if (mode === 'wysiwyg-pipe') {
        job.pipeSession = startWysiwygPipeExport(project, fullOpts);
        return sendJson(req, res, 200, { jobId, outputPath: outPath, mode: 'wysiwyg-pipe' });
      }

      void exportProject(project, fullOpts, this.tempDir, this.db)
        .then((result) => {
          job.status = 'done';
          job.result = result;
          job.progress = {
            percent: 100,
            outTimeUs: job.progress.outTimeUs,
            fps: fullOpts.fps ?? 30,
            speed: '100%',
            totalSizeBytes: result.fileSizeBytes,
          };
          this.emitJobEvent(job, 'done', { result });
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          job.status = abortController.signal.aborted ? 'cancelled' : 'error';
          job.error = msg;
          this.emitJobEvent(job, job.status, { error: msg });
        });

      return sendJson(req, res, 200, { jobId, outputPath: outPath, mode });
    }

    // Receive raw RGBA frame buffers for Exact WYSIWYG Frame-Pipe export
    const framesMatch = pathname.match(/^\/api\/export\/([^/]+)\/frames$/);
    if (framesMatch && req.method === 'POST') {
      const job = this.exportJobs.get(decodeURIComponent(framesMatch[1]));
      if (!job || !job.pipeSession) return sendJson(req, res, 404, { error: 'WYSIWYG job not found' });
      const buf = await readRawBuffer(req);
      await job.pipeSession.writeFrame(buf);
      return sendJson(req, res, 200, { ok: true, bytes: buf.byteLength });
    }

    const finishFramesMatch = pathname.match(/^\/api\/export\/([^/]+)\/finish-frames$/);
    if (finishFramesMatch && req.method === 'POST') {
      const job = this.exportJobs.get(decodeURIComponent(finishFramesMatch[1]));
      if (!job || !job.pipeSession) return sendJson(req, res, 404, { error: 'WYSIWYG job not found' });
      const result = await job.pipeSession.finish();
      job.status = 'done';
      job.result = result;
      this.emitJobEvent(job, 'done', { result });
      return sendJson(req, res, 200, { result });
    }

    // SSE Live Progress Stream
    const sseMatch = pathname.match(/^\/api\/export\/([^/]+)\/events$/);
    if (sseMatch && req.method === 'GET') {
      const job = this.exportJobs.get(decodeURIComponent(sseMatch[1]));
      if (!job) return sendJson(req, res, 404, { error: 'Export job not found' });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeadersFor(req),
      });

      const sendSse = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      sendSse('progress', job.progress);
      if (job.status === 'done') {
        sendSse('done', { result: job.result });
        res.end();
        return;
      }
      if (job.status === 'error' || job.status === 'cancelled') {
        sendSse(job.status, { error: job.error ?? 'Cancelled' });
        res.end();
        return;
      }

      const listener = (event: string, data: unknown) => {
        sendSse(event, data);
        if (event === 'done' || event === 'error' || event === 'cancelled') {
          job.listeners.delete(listener);
          res.end();
        }
      };
      job.listeners.add(listener);
      req.on('close', () => job.listeners.delete(listener));
      return;
    }

    // Cancel running export job
    const cancelMatch = pathname.match(/^\/api\/export\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      const job = this.exportJobs.get(decodeURIComponent(cancelMatch[1]));
      if (!job) return sendJson(req, res, 404, { error: 'Export job not found' });
      job.status = 'cancelled';
      job.abortController.abort();
      job.pipeSession?.cancel();
      this.emitJobEvent(job, 'cancelled', { error: 'Cancelled by user' });
      return sendJson(req, res, 200, { cancelled: true });
    }

    // Synchronous Export endpoint (preserved for scripts / tests)
    if (pathname === '/api/export' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; options: Partial<ExportOptions> }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(req, res, 404, { error: 'Project not found' });
      const safeTitle = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const ext =
        body.options.mode === 'audio-only'
          ? 'wav'
          : body.options.mode === 'subtitle-only'
            ? body.options.subtitleFormat ?? 'srt'
            : 'mp4';
      const outPath = body.options.outputPath || path.join(this.exportsDir, `${safeTitle}_${Date.now()}.${ext}`);
      const result = await exportProject(
        project,
        {
          mode: body.options.mode ?? 'hardware',
          codec: body.options.codec ?? 'h264',
          width: body.options.width ?? project.settings.width,
          height: body.options.height ?? project.settings.height,
          fps: body.options.fps ?? project.settings.fps,
          bitrateKbps: body.options.bitrateKbps ?? 10000,
          burnSubtitles: body.options.burnSubtitles ?? true,
          loudnorm: body.options.loudnorm ?? true,
          subtitleFormat: body.options.subtitleFormat,
          rangeStartUs: body.options.rangeStartUs ?? null,
          rangeEndUs: body.options.rangeEndUs ?? null,
          lutsDir: this.lutsDir,
          modelsDir: this.modelsDir,
          outputPath: outPath,
        },
        this.tempDir,
        this.db
      );
      return sendJson(req, res, 200, { result });
    }

    // Batch Render Queue
    if (pathname === '/api/export/batch' && req.method === 'POST') {
      const body = await readJsonBody<{ jobs: Array<{ projectId: string; options: Partial<ExportOptions> }> }>(req);
      const results = [];
      for (const job of body.jobs ?? []) {
        const project = this.db.getProject(job.projectId);
        if (!project) continue;
        const safeTitle = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const outPath = job.options.outputPath || path.join(this.exportsDir, `${safeTitle}_${Date.now()}.mp4`);
        const resExport = await exportProject(
          project,
          {
            mode: job.options.mode ?? 'hardware',
            codec: job.options.codec ?? 'h264',
            width: job.options.width ?? project.settings.width,
            height: job.options.height ?? project.settings.height,
            fps: job.options.fps ?? project.settings.fps,
            bitrateKbps: job.options.bitrateKbps ?? 10000,
            burnSubtitles: job.options.burnSubtitles ?? true,
            loudnorm: job.options.loudnorm ?? true,
            lutsDir: this.lutsDir,
            modelsDir: this.modelsDir,
            outputPath: outPath,
          },
          this.tempDir,
          this.db
        );
        results.push({ projectId: project.id, name: project.name, ...resExport });
      }
      return sendJson(req, res, 200, { results });
    }

    // Interop
    if (pathname === '/api/interop/export' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; format: 'capcut' | 'fcpxml' | 'otio' }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(req, res, 404, { error: 'Project not found' });
      if (body.format === 'capcut') {
        return sendJson(req, res, 200, { filename: `${project.name}_draft_content.json`, content: JSON.stringify(exportToCapCutDraft(project), null, 2) });
      }
      if (body.format === 'fcpxml') {
        return sendJson(req, res, 200, { filename: `${project.name}.fcpxml`, content: exportToFCPXML(project) });
      }
      return sendJson(req, res, 200, { filename: `${project.name}.otio`, content: exportToOTIO(project) });
    }

    if (pathname === '/api/interop/import-capcut' && req.method === 'POST') {
      const body = await readJsonBody<{ draft: CapCutDraftContent; projectId?: string }>(req);
      const project = importFromCapCutDraft(body.draft, body.projectId);
      this.db.saveImportedProject(project);
      return sendJson(req, res, 200, { project });
    }

    if (pathname === '/api/interop/parse-lut' && req.method === 'POST') {
      const body = await readJsonBody<{ content: string }>(req);
      const parsed = parseCubeLUT(body.content);
      return sendJson(req, res, 200, {
        title: parsed.title,
        size: parsed.size,
        data: Array.from(parsed.data),
      });
    }

    if (pathname === '/api/interop/parse-srt' && req.method === 'POST') {
      const body = await readJsonBody<{ content: string }>(req);
      return sendJson(req, res, 200, { segments: parseSRT(body.content) });
    }

    // T-ChatCut v2 Copilot endpoints (multi-clip + optional LLM)
    if (pathname === '/api/chatcut/plan' && req.method === 'POST') {
      const body = await readJsonBody<{
        projectId: string;
        prompt: string;
        selectedClipId?: string | null;
        llmConfig?: ChatCutLlmConfig | null;
      }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(req, res, 404, { error: 'Project not found' });
      const caps = getAiCapabilities(this.paths.projectRoot, this.modelsDir);
      const plan = await buildChatCutPlan(project, body.prompt, this.tempDir, this.modelsDir, {
        selectedClipId: body.selectedClipId,
        visionBinPath: caps.visionBinaryPath,
        llmConfig: body.llmConfig,
      });
      return sendJson(req, res, 200, { plan });
    }

    if (pathname === '/api/chatcut/apply' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; plan: Parameters<typeof applyChatCutPlan>[1] }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(req, res, 404, { error: 'Project not found' });
      const next = applyChatCutPlan(project, body.plan);
      const saved = this.db.applyProjectSnapshot(project.id, `T-ChatCut: ${body.plan.prompt.slice(0, 40)}`, next);
      return sendJson(req, res, 200, { project: saved, history: this.db.getHistory(project.id) });
    }

    // Serve built Studio frontend with injected session token
    if (this.paths.studioDistDir && fs.existsSync(this.paths.studioDistDir)) {
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      let target = path.join(this.paths.studioDistDir, rel);
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        target = path.join(this.paths.studioDistDir, 'index.html');
      }
      const ext = path.extname(target).toLowerCase();
      if (ext === '.html') {
        const html = fs.readFileSync(target, 'utf8');
        const tokenScript = `<script>window.__TCAPCUT_TOKEN__=${JSON.stringify(this.sessionToken)};</script>`;
        const injected = html.includes('</head>') ? html.replace('</head>', `${tokenScript}</head>`) : `${tokenScript}${html}`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(injected);
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME_MAP[ext] ?? 'application/octet-stream' });
      fs.createReadStream(target).pipe(res);
      return;
    }

    sendJson(req, res, 404, { error: `Unknown route: ${pathname}` });
  }
}
