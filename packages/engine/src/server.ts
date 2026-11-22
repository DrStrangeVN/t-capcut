import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  US_PER_SEC,
  buildTemplatePackageFromProject,
  exportToCapCutDraft,
  exportToFCPXML,
  exportToOTIO,
  importFromCapCutDraftDetailed,
  importFromFCPXML,
  importFromOTIO,
  parseCubeLUT,
  parseSRT,
  type CapCutDraftContent,
  type CapCutImportReport,
  type MediaAsset,
  type Project,
  type TCapCutTemplatePackage,
} from '@t-capcut/schema';
import { AUDIO_BY_ID, LUT_BY_ID } from '@t-capcut/presets';
import {
  detectBeats,
  detectScenes,
  detectSilence,
  detectViralHighlights,
  downloadWhisperModel,
  findFillerWordSpans,
  generateLocalTtsVoiceover,
  getAiCapabilities,
  listSystemFonts,
  runAppleVisionFaceTrack,
  runAppleVisionMatting,
  runAppleVisionObjectMatting,
  scanLocalCapCutDrafts,
  separateAudioStems,
  smartRemixAudio,
  stabilizeVideoFfmpeg,
  transcribeMedia,
  upscaleVideoFfmpeg,
} from './ai.js';
import { createZipBuffer, unzipBufferToMap } from './zip.js';
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
  presetsAssetsDir?: string;
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
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.cube': 'text/plain; charset=utf-8',
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
  readonly presetsAssetsDir: string;
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
    const assetCandidates = [
      paths.presetsAssetsDir,
      process.env.TCAPCUT_PRESETS_ASSETS,
      path.join(paths.projectRoot, 'packages', 'presets', 'assets'),
      path.join(paths.projectRoot, 'presets-assets'),
    ].filter((x): x is string => Boolean(x));
    this.presetsAssetsDir = assetCandidates.find((d) => fs.existsSync(d)) ?? assetCandidates[0]!;
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

    try {
      const realPresetsDir = fs.realpathSync(this.presetsAssetsDir);
      if (realTarget === realPresetsDir || realTarget.startsWith(realPresetsDir + path.sep)) {
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

    // High-speed Binary WebSocket Pipe for Exact WYSIWYG Export (/ws/export/:jobId?token=...)
    this.server.on('upgrade', (req, socket) => {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      const wsMatch = reqUrl.pathname.match(/^\/ws\/export\/([^/]+)$/);
      if (!wsMatch || !this.isAuthorized(req, reqUrl)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const job = this.exportJobs.get(decodeURIComponent(wsMatch[1]));
      const wsKey = req.headers['sec-websocket-key'];
      if (!job || !job.pipeSession || !wsKey || Array.isArray(wsKey)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      const accept = crypto
        .createHash('sha1')
        .update(`${wsKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
      );

      let buf = Buffer.alloc(0);
      let processing = false;
      const sendAck = (text: string) => {
        const p = Buffer.from(text, 'utf8');
        const hdr = p.length < 126 ? Buffer.from([0x81, p.length]) : Buffer.from([0x81, 126, (p.length >> 8) & 0xff, p.length & 0xff]);
        socket.write(Buffer.concat([hdr, p]));
      };

      const drainFrames = async () => {
        if (processing) return;
        processing = true;
        try {
          while (buf.length >= 2) {
            const b0 = buf[0]!;
            const b1 = buf[1]!;
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            let payloadLen = b1 & 0x7f;
            let offset = 2;
            if (payloadLen === 126) {
              if (buf.length < 4) break;
              payloadLen = buf.readUInt16BE(2);
              offset = 4;
            } else if (payloadLen === 127) {
              if (buf.length < 10) break;
              payloadLen = Number(buf.readBigUInt64BE(2));
              offset = 10;
            }
            const maskLen = masked ? 4 : 0;
            if (buf.length < offset + maskLen + payloadLen) break;

            const payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + payloadLen));
            if (masked) {
              const mask = buf.subarray(offset, offset + 4);
              for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i % 4]!;
            }
            buf = buf.subarray(offset + maskLen + payloadLen);

            if (opcode === 0x8) {
              socket.end();
              return;
            }
            if (opcode === 0x2 && job.pipeSession) {
              await job.pipeSession.writeFrame(payload);
              sendAck('ok');
            }
          }
        } catch {
          socket.destroy();
        } finally {
          processing = false;
        }
      };

      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        void drainFrames();
      });
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
        version: '4.0.0',
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
      const cleanId = lutId.replace(/\.cube$/i, '');
      const userCube = path.join(this.lutsDir, `${cleanId}.cube`);
      const builtinCube = path.join(this.presetsAssetsDir, 'luts', `${cleanId}.cube`);
      const cubePath = fs.existsSync(userCube) ? userCube : fs.existsSync(builtinCube) ? builtinCube : null;
      if (!cubePath) return sendJson(req, res, 404, { error: 'LUT not found' });
      const parsed = parseCubeLUT(fs.readFileSync(cubePath, 'utf8'));
      return sendJson(req, res, 200, {
        id: cleanId,
        title: parsed.title,
        size: parsed.size,
        filePath: cubePath,
        data: Array.from(parsed.data),
      });
    }

    // Embedded Offline Presets API (LUTs, Audio/SFX Stream + MediaAsset Registration, Pack Importer)
    const presetLutMatch = pathname.match(/^\/api\/presets\/luts\/([^/]+)$/);
    if (presetLutMatch && req.method === 'GET') {
      const rawId = path.basename(decodeURIComponent(presetLutMatch[1])).replace(/[^a-zA-Z0-9._-]/g, '');
      const cleanId = rawId.replace(/\.cube$/i, '');
      const preset = LUT_BY_ID[cleanId];
      const cubePath = path.join(this.presetsAssetsDir, 'luts', preset ? preset.filename : `${cleanId}.cube`);
      if (!fs.existsSync(cubePath)) return sendJson(req, res, 404, { error: 'Built-in LUT not found' });
      const parsed = parseCubeLUT(fs.readFileSync(cubePath, 'utf8'));
      return sendJson(req, res, 200, {
        id: cleanId,
        title: preset?.title || parsed.title,
        size: parsed.size,
        filePath: cubePath,
        data: Array.from(parsed.data),
      });
    }

    const presetAudioMatch = pathname.match(/^\/api\/presets\/audio\/([^/]+)$/);
    if (presetAudioMatch && req.method === 'GET') {
      const rawName = path.basename(decodeURIComponent(presetAudioMatch[1])).replace(/[^a-zA-Z0-9._-]/g, '');
      const cleanId = rawName.replace(/\.m4a$/i, '');
      const preset = AUDIO_BY_ID[cleanId];
      const audioPath = path.join(this.presetsAssetsDir, 'audio', preset ? preset.filename : `${cleanId}.m4a`);
      if (!fs.existsSync(audioPath)) return sendJson(req, res, 404, { error: 'Built-in audio not found' });
      serveMediaWithRange(req, res, audioPath);
      return;
    }

    if (pathname === '/api/presets/audio/add' && req.method === 'POST') {
      const body = await readJsonBody<{ presetId: string }>(req);
      const preset = AUDIO_BY_ID[body.presetId];
      if (!preset) return sendJson(req, res, 404, { error: 'Unknown audio presetId' });
      const audioPath = path.join(this.presetsAssetsDir, 'audio', preset.filename);
      if (!fs.existsSync(audioPath)) {
        return sendJson(req, res, 404, { error: `Built-in audio missing on disk: ${preset.filename}` });
      }
      const stat = fs.statSync(audioPath);
      const assetId = `preset_${preset.id}`;
      const asset: MediaAsset = {
        id: assetId,
        name: preset.name,
        kind: 'audio',
        sourcePath: audioPath,
        durationUs: Math.round(preset.durationSec * US_PER_SEC),
        width: 0,
        height: 0,
        fps: 30,
        hasAudio: true,
        codecAudio: 'aac',
        fileSizeBytes: stat.size,
        createdAt: Date.now(),
        proxyStatus: 'ready',
        beatsUs: preset.beatsUs.length > 0 ? [...preset.beatsUs] : undefined,
      };
      asset.waveformPath = await extractWaveformPeaks(asset, this.cacheDir).catch(() => null);
      this.registeredAssets.set(asset.id, asset);
      return sendJson(req, res, 200, { asset, preset });
    }

    if (pathname === '/api/presets/import-pack' && req.method === 'POST') {
      const body = await readJsonBody<{
        packName?: string;
        luts?: Array<{ id?: string; filename?: string; content: string }>;
        audioFiles?: Array<{ filename: string; base64: string }>;
      }>(req);
      const importedLuts: Array<{ id: string; title: string; size: number; filePath: string; data: number[] }> = [];
      for (const lut of body.luts ?? []) {
        const cleanId = (lut.id || lut.filename || `pack_lut_${Date.now()}`)
          .replace(/\.cube$/i, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const parsed = parseCubeLUT(lut.content);
        const cubePath = path.join(this.lutsDir, `${cleanId}.cube`);
        fs.writeFileSync(cubePath, lut.content, 'utf8');
        importedLuts.push({
          id: cleanId,
          title: parsed.title || cleanId,
          size: parsed.size,
          filePath: cubePath,
          data: Array.from(parsed.data),
        });
      }
      const importedAudio: MediaAsset[] = [];
      for (const af of body.audioFiles ?? []) {
        const safeName = path.basename(af.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const outAudio = path.join(this.mediaDir, `pack_${Date.now()}_${safeName}`);
        fs.writeFileSync(outAudio, Buffer.from(af.base64, 'base64'));
        const probed = await probeMedia(outAudio, `pack_aud_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`);
        probed.waveformPath = await extractWaveformPeaks(probed, this.cacheDir).catch(() => null);
        this.registeredAssets.set(probed.id, probed);
        importedAudio.push(probed);
      }
      return sendJson(req, res, 200, {
        ok: true,
        packName: body.packName || 'Local Pack',
        importedLuts,
        importedAudio,
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

    // System Fonts
    if (pathname === '/api/system/fonts' && req.method === 'GET') {
      const caps = getAiCapabilities(this.paths.projectRoot, this.modelsDir);
      const fonts = await listSystemFonts(caps.visionBinaryPath);
      return sendJson(req, res, 200, { fonts });
    }

    // Download Whisper GGML model
    if (pathname === '/api/ai/download-whisper' && req.method === 'POST') {
      const body = await readJsonBody<{ variant?: 'tiny' | 'base' }>(req);
      const resModel = await downloadWhisperModel(this.modelsDir, body.variant ?? 'tiny');
      return sendJson(req, res, 200, resModel);
    }

    // Offline AI Voiceover (TTS)
    if (pathname === '/api/ai/tts' && req.method === 'POST') {
      const body = await readJsonBody<{ text: string; language?: 'vi' | 'en'; voice?: string }>(req);
      if (!body.text?.trim()) return sendJson(req, res, 400, { error: 'Missing TTS text' });
      const resTts = await generateLocalTtsVoiceover(
        body.text.trim(),
        body.language ?? 'vi',
        this.mediaDir,
        body.voice
      );
      const assetId = `asset_tts_${Date.now()}`;
      const asset = await probeMedia(resTts.audioPath, assetId);
      asset.name = `AI Voice: ${body.text.trim().slice(0, 22)}`;
      asset.transcript = [resTts.segment];
      asset.waveformPath = await extractWaveformPeaks(asset, this.cacheDir).catch(() => null);
      this.registeredAssets.set(asset.id, asset);
      return sendJson(req, res, 200, { asset, segment: resTts.segment });
    }

    // Smart Music Remix (auto-stretch/loop body + snap Outro to exact video duration)
    if (pathname === '/api/audio/smart-remix' && req.method === 'POST') {
      const body = await readJsonBody<{ assetId: string; targetDurationUs: number; outroStartUs?: number }>(req);
      const srcAsset = this.registeredAssets.get(body.assetId) ?? this.db.findAssetById(body.assetId);
      if (!srcAsset) return sendJson(req, res, 404, { error: 'Audio asset not found' });
      const outPath = path.join(this.mediaDir, `${srcAsset.id}_remix_${Date.now()}.m4a`);
      await smartRemixAudio(srcAsset.sourcePath, srcAsset.durationUs, body.targetDurationUs, body.outroStartUs, outPath);
      const remixAsset = await probeMedia(outPath, `asset_remix_${Date.now()}`);
      remixAsset.name = `${srcAsset.name} (Remix)`;
      remixAsset.waveformPath = await extractWaveformPeaks(remixAsset, this.cacheDir).catch(() => null);
      this.registeredAssets.set(remixAsset.id, remixAsset);
      return sendJson(req, res, 200, { asset: remixAsset });
    }

    // AI Endpoints
    if (pathname === '/api/ai/analyze' && req.method === 'POST') {
      const body = await readJsonBody<{
        projectId: string;
        assetId: string;
        task:
          | 'silence'
          | 'scenes'
          | 'beats'
          | 'transcribe'
          | 'matting'
          | 'object-matting'
          | 'face-track'
          | 'highlights'
          | 'remove-fillers'
          | 'stabilize'
          | 'upscale'
          | 'stem-separate';
        language?: string;
        normX?: number;
        normY?: number;
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
      if (body.task === 'highlights') {
        const highlights = await detectViralHighlights(asset, this.tempDir);
        return sendJson(req, res, 200, { highlights });
      }
      if (body.task === 'remove-fillers') {
        const tx = asset.transcript
          ? asset.transcript
          : (await transcribeMedia(asset, this.tempDir, this.modelsDir, body.language ?? 'vi', caps.visionBinaryPath)).segments;
        asset.transcript = tx;
        const fillers = findFillerWordSpans(tx);
        return sendJson(req, res, 200, { fillers });
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
      if (body.task === 'object-matting') {
        if (!caps.visionBinaryPath) {
          return sendJson(req, res, 503, { error: 'Apple Vision native binary not compiled' });
        }
        const maskPath = await runAppleVisionObjectMatting(
          asset,
          this.cacheDir,
          caps.visionBinaryPath,
          body.normX ?? 0.5,
          body.normY ?? 0.5
        );
        asset.mattingMaskPath = maskPath;
        asset.objectMaskPath = maskPath;
        this.registeredAssets.set(asset.id, asset);
        this.db.applyProjectSnapshot(project.id, `AI Object Segment: ${asset.name}`, project);
        return sendJson(req, res, 200, { mattingMaskPath: maskPath });
      }
      if (body.task === 'face-track') {
        if (!caps.visionBinaryPath) {
          return sendJson(req, res, 503, { error: 'Apple Vision native binary not compiled' });
        }
        const track = await runAppleVisionFaceTrack(asset, this.cacheDir, caps.visionBinaryPath);
        return sendJson(req, res, 200, { track });
      }
      if (body.task === 'stabilize') {
        const stabPath = await stabilizeVideoFfmpeg(asset, this.cacheDir);
        const stabAsset = await probeMedia(stabPath, `asset_stab_${Date.now()}`);
        stabAsset.name = `${asset.name} (Chống rung)`;
        stabAsset.thumbnailStripPath = await generateThumbnailStrip(stabAsset, this.cacheDir).catch(() => null);
        this.registeredAssets.set(stabAsset.id, stabAsset);
        asset.stabilizedPath = stabPath;
        return sendJson(req, res, 200, { asset: stabAsset });
      }
      if (body.task === 'upscale') {
        const upPath = await upscaleVideoFfmpeg(asset, this.cacheDir);
        const upAsset = await probeMedia(upPath, `asset_up2x_${Date.now()}`);
        upAsset.name = `${asset.name} (2× Crisp)`;
        upAsset.thumbnailStripPath = await generateThumbnailStrip(upAsset, this.cacheDir).catch(() => null);
        this.registeredAssets.set(upAsset.id, upAsset);
        asset.upscaledPath = upPath;
        return sendJson(req, res, 200, { asset: upAsset });
      }
      if (body.task === 'stem-separate') {
        const { vocalsPath, instrumentalPath } = await separateAudioStems(asset, this.mediaDir);
        const vocalAsset = await probeMedia(vocalsPath, `asset_voc_${Date.now()}`);
        vocalAsset.name = `${asset.name} (Vocals)`;
        vocalAsset.waveformPath = await extractWaveformPeaks(vocalAsset, this.cacheDir).catch(() => null);
        const instAsset = await probeMedia(instrumentalPath, `asset_inst_${Date.now()}`);
        instAsset.name = `${asset.name} (Nhạc Nền)`;
        instAsset.waveformPath = await extractWaveformPeaks(instAsset, this.cacheDir).catch(() => null);
        this.registeredAssets.set(vocalAsset.id, vocalAsset);
        this.registeredAssets.set(instAsset.id, instAsset);
        return sendJson(req, res, 200, { vocalAsset, instrumentalAsset: instAsset });
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
        presetsAssetsDir: this.presetsAssetsDir,
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
          presetsAssetsDir: this.presetsAssetsDir,
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
            presetsAssetsDir: this.presetsAssetsDir,
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
      const { project, report } = importFromCapCutDraftDetailed(body.draft, body.projectId, (p) => fs.existsSync(p));
      this.db.saveImportedProject(project);
      return sendJson(req, res, 200, { project, report });
    }

    if (pathname === '/api/interop/scan-capcut-local' && req.method === 'GET') {
      return sendJson(req, res, 200, { drafts: scanLocalCapCutDrafts() });
    }

    if (pathname === '/api/interop/import-path-draft' && req.method === 'POST') {
      const body = await readJsonBody<{ draftPath: string }>(req);
      const drafts = scanLocalCapCutDrafts();
      const matched = drafts.find((d) => d.draftPath === body.draftPath);
      if (!matched || !fs.existsSync(matched.draftPath)) {
        return sendJson(req, res, 404, { error: 'CapCut draft not found in CapCut projects folder' });
      }
      const rawDraft = JSON.parse(fs.readFileSync(matched.draftPath, 'utf8')) as CapCutDraftContent;
      const { project, report } = importFromCapCutDraftDetailed(rawDraft, `proj_cc_${Date.now()}`, (p) => fs.existsSync(p));
      project.name = matched.name || project.name;
      Object.values(project.assets).forEach((a) => this.registeredAssets.set(a.id, a));
      this.db.saveImportedProject(project);
      return sendJson(req, res, 200, { project, report });
    }

    if (pathname === '/api/interop/import-universal' && req.method === 'POST') {
      const body = await readJsonBody<{ filename: string; contentBase64: string }>(req);
      const buf = Buffer.from(body.contentBase64, 'base64');
      const ext = path.extname(body.filename).toLowerCase();
      let importedProject: Project;
      let report: CapCutImportReport | undefined;

      if (ext === '.fcpxml' || ext === '.xml') {
        importedProject = importFromFCPXML(buf.toString('utf8'));
      } else if (ext === '.otio') {
        importedProject = importFromOTIO(buf.toString('utf8'));
      } else if (ext === '.tcapcut-tpl' || ext === '.capcut' || ext === '.zip' || ext === '.lottie') {
        const files = unzipBufferToMap(buf);
        const tplEntry = files.get('manifest.json');
        const ccEntry = Array.from(files.entries()).find(([k]) => k.endsWith('draft_content.json'))?.[1];
        const lottieEntry = Array.from(files.entries()).find(([k]) => k.endsWith('.json'))?.[1];
        if (tplEntry) {
          const pkg = JSON.parse(tplEntry.toString('utf8')) as TCapCutTemplatePackage;
          importedProject = { ...pkg.project, id: `proj_tpl_${Date.now()}`, name: pkg.name };
        } else if (ccEntry) {
          const parsed = importFromCapCutDraftDetailed(
            JSON.parse(ccEntry.toString('utf8')) as CapCutDraftContent,
            `proj_cczip_${Date.now()}`,
            (p) => fs.existsSync(p)
          );
          importedProject = parsed.project;
          report = parsed.report;
        } else if (lottieEntry) {
          return sendJson(req, res, 200, { kind: 'lottie', lottieJson: lottieEntry.toString('utf8'), name: path.basename(body.filename, ext) });
        } else {
          return sendJson(req, res, 400, { error: 'Không tìm thấy manifest.json / draft_content.json / Lottie JSON trong gói zip' });
        }
      } else {
        const rawText = buf.toString('utf8');
        const parsedJson = JSON.parse(rawText) as Record<string, unknown>;
        if (parsedJson.OTIO_SCHEMA) {
          importedProject = importFromOTIO(rawText);
        } else if (parsedJson.format === 'tcapcut-template-v1' && parsedJson.project) {
          const pkg = parsedJson as unknown as TCapCutTemplatePackage;
          importedProject = { ...pkg.project, id: `proj_tpl_${Date.now()}`, name: pkg.name };
        } else if (parsedJson.layers && Array.isArray(parsedJson.layers)) {
          return sendJson(req, res, 200, { kind: 'lottie', lottieJson: rawText, name: path.basename(body.filename, ext) });
        } else {
          const detailed = importFromCapCutDraftDetailed(parsedJson as unknown as CapCutDraftContent, `proj_cc_${Date.now()}`, (p) => fs.existsSync(p));
          importedProject = detailed.project;
          report = detailed.report;
        }
      }

      Object.values(importedProject.assets).forEach((a) => this.registeredAssets.set(a.id, a));
      this.db.saveImportedProject(importedProject);
      return sendJson(req, res, 200, { kind: 'project', project: importedProject, report });
    }

    if (pathname === '/api/templates/export-pack' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; templateName?: string }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(req, res, 404, { error: 'Project not found' });
      const pkg = buildTemplatePackageFromProject(project, body.templateName);
      const entries: Array<{ name: string; data: Buffer | string }> = [
        { name: 'manifest.json', data: JSON.stringify(pkg, null, 2) },
      ];
      Object.values(project.luts ?? {}).forEach((lut) => {
        if (lut.filePath && fs.existsSync(lut.filePath)) {
          entries.push({ name: `luts/${lut.id}.cube`, data: fs.readFileSync(lut.filePath) });
        }
      });
      const zipBuf = createZipBuffer(entries);
      return sendJson(req, res, 200, {
        filename: `${(body.templateName || project.name).replace(/[^a-zA-Z0-9_-]/g, '_')}.tcapcut-tpl`,
        contentBase64: zipBuf.toString('base64'),
      });
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
