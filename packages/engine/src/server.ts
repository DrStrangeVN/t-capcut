import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
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

const execFileAsync = promisify(execFile);
import { applyChatCutPlan, buildChatCutPlan } from './chatcut.js';
import { ProjectDatabase } from './db.js';
import { exportProject, prerenderSegment, type ExportOptions } from './exporter.js';
import {
  createDemoMediaSample,
  extractWaveformPeaks,
  generateProxy,
  generateThumbnailStrip,
  probeMedia,
} from './media.js';

export interface EnginePaths {
  projectRoot: string;
  dataDir: string;
  studioDistDir?: string;
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

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return (text ? JSON.parse(text) : {}) as T;
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(body);
}

function serveMediaWithRange(req: http.IncomingMessage, res: http.ServerResponse, filePath: string): void {
  if (!fs.existsSync(filePath)) {
    sendJson(res, 404, { error: 'File not found' });
    return;
  }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream';
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const [startRaw, endRaw] = range.replace(/bytes=/, '').split('-');
  const start = Number.parseInt(startRaw, 10) || 0;
  const end = endRaw ? Math.min(stat.size - 1, Number.parseInt(endRaw, 10)) : stat.size - 1;
  if (start >= stat.size || start > end) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
    res.end();
    return;
  }

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
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
  readonly tempDir: string;
  private server: http.Server | null = null;

  constructor(paths: EnginePaths) {
    this.paths = paths;
    this.cacheDir = path.join(paths.dataDir, 'cache');
    this.mediaDir = path.join(paths.dataDir, 'media');
    this.exportsDir = path.join(paths.dataDir, 'exports');
    this.modelsDir = path.join(paths.dataDir, 'models');
    this.tempDir = path.join(paths.dataDir, 'tmp');
    [this.cacheDir, this.mediaDir, this.exportsDir, this.modelsDir, this.tempDir].forEach((d) =>
      fs.mkdirSync(d, { recursive: true })
    );
    this.db = new ProjectDatabase(path.join(paths.dataDir, 'tcapcut.sqlite'));

    if (this.db.listProjects().length === 0) {
      this.db.createProject('proj_default', 'T-CapCut Studio Demo');
    }
  }

  async start(port = 47890): Promise<{ port: number; url: string }> {
    if (this.server) {
      const addr = this.server.address() as { port: number };
      return { port: addr.port, url: `http://127.0.0.1:${addr.port}` };
    }

    this.server = http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        });
        res.end();
        return;
      }

      try {
        await this.handleRequest(req, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { error: message });
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, '127.0.0.1', () => resolve());
    });
    const addr = this.server.address() as { port: number };
    return { port: addr.port, url: `http://127.0.0.1:${addr.port}` };
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    this.db.close();
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        version: '1.0.0',
        dataDir: this.paths.dataDir,
        ai: getAiCapabilities(this.paths.projectRoot, this.modelsDir),
      });
      return;
    }

    if (pathname === '/api/projects' && req.method === 'GET') {
      sendJson(res, 200, { projects: this.db.listProjects() });
      return;
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      const body = await readJsonBody<{ id?: string; name?: string }>(req);
      const id = body.id || `proj_${Date.now()}`;
      const project = this.db.createProject(id, body.name || 'Dự án T-CapCut Mới');
      sendJson(res, 201, { project });
      return;
    }

    const projMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projMatch) {
      const id = decodeURIComponent(projMatch[1]);
      if (req.method === 'GET') {
        const project = this.db.getProject(id);
        if (!project) return sendJson(res, 404, { error: 'Project not found' });
        return sendJson(res, 200, { project, history: this.db.getHistory(id) });
      }
      if (req.method === 'DELETE') {
        return sendJson(res, 200, { deleted: this.db.deleteProject(id) });
      }
    }

    const mutateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/mutate$/);
    if (mutateMatch && req.method === 'POST') {
      const id = decodeURIComponent(mutateMatch[1]);
      const body = await readJsonBody<{ label?: string; project: Project }>(req);
      const saved = this.db.applyProjectSnapshot(id, body.label || 'Edit Timeline', body.project);
      return sendJson(res, 200, { project: saved, history: this.db.getHistory(id) });
    }

    const undoMatch = pathname.match(/^\/api\/projects\/([^/]+)\/(undo|redo)$/);
    if (undoMatch && req.method === 'POST') {
      const id = decodeURIComponent(undoMatch[1]);
      const action = undoMatch[2];
      const result = action === 'undo' ? this.db.undo(id) : this.db.redo(id);
      return sendJson(res, 200, { ...result, history: this.db.getHistory(id) });
    }

    // Stream local media / proxy / waveform / thumbnail strip securely
    if (pathname === '/api/media/stream' && req.method === 'GET') {
      const filePath = reqUrl.searchParams.get('path');
      if (!filePath) return sendJson(res, 400, { error: 'Missing path parameter' });
      return serveMediaWithRange(req, res, filePath);
    }

    // Upload raw media file from browser File picker into managed mediaDir
    if (pathname === '/api/media/upload' && req.method === 'POST') {
      const filename = reqUrl.searchParams.get('name') || `upload_${Date.now()}.mp4`;
      const safeName = `${Date.now()}_${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const destPath = path.join(this.mediaDir, safeName);
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      fs.writeFileSync(destPath, Buffer.concat(chunks));
      const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const asset = await probeMedia(destPath, assetId);
      const [stripPath, waveformPath] = await Promise.all([
        asset.kind !== 'audio' ? generateThumbnailStrip(asset, this.cacheDir).catch(() => null) : Promise.resolve(null),
        asset.hasAudio ? extractWaveformPeaks(asset, this.cacheDir).catch(() => null) : Promise.resolve(null),
      ]);
      asset.thumbnailStripPath = stripPath;
      asset.waveformPath = waveformPath;
      return sendJson(res, 200, { asset });
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
      return sendJson(res, 200, { asset });
    }

    // Create sample demo video for immediate onboarding
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
      return sendJson(res, 200, { asset });
    }

    // Generate proxy on demand
    if (pathname === '/api/media/proxy' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; assetId: string }>(req);
      const project = this.db.getProject(body.projectId);
      const asset = project?.assets[body.assetId];
      if (!project || !asset) return sendJson(res, 404, { error: 'Asset not found' });
      const proxyPath = await generateProxy(asset, this.cacheDir);
      asset.proxyPath = proxyPath;
      asset.proxyStatus = 'ready';
      const updated = this.db.applyProjectSnapshot(project.id, `Generate Proxy: ${asset.name}`, project);
      return sendJson(res, 200, { proxyPath, project: updated });
    }

    // Freeze Frame extraction at exact source timestamp
    if (pathname === '/api/media/freeze-frame' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; assetId: string; sourceTimeUs: number }>(req);
      const project = this.db.getProject(body.projectId);
      const asset = project?.assets[body.assetId];
      if (!project || !asset) return sendJson(res, 404, { error: 'Asset not found' });
      const framePath = path.join(this.mediaDir, `freeze_${asset.id}_${Date.now()}.png`);
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        Math.max(0, body.sourceTimeUs / US_PER_SEC).toFixed(3),
        '-i',
        asset.sourcePath,
        '-frames:v',
        '1',
        framePath,
      ]);
      const freezeAsset = await probeMedia(framePath, `asset_freeze_${Date.now()}`);
      freezeAsset.durationUs = 2 * US_PER_SEC;
      freezeAsset.thumbnailStripPath = await generateThumbnailStrip(freezeAsset, this.cacheDir).catch(() => null);
      return sendJson(res, 200, { asset: freezeAsset });
    }

    // Download Whisper GGML model (tiny / base) for offline Vietnamese/English ASR
    if (pathname === '/api/ai/download-whisper' && req.method === 'POST') {
      const body = await readJsonBody<{ variant?: 'tiny' | 'base' }>(req);
      const resModel = await downloadWhisperModel(this.modelsDir, body.variant ?? 'tiny');
      return sendJson(res, 200, resModel);
    }

    // AI Endpoints: Silence, Scenes, Beats, Transcribe, Apple Vision Matting & Face Track
    if (pathname === '/api/ai/analyze' && req.method === 'POST') {
      const body = await readJsonBody<{
        projectId: string;
        assetId: string;
        task: 'silence' | 'scenes' | 'beats' | 'transcribe' | 'matting' | 'face-track';
        language?: string;
      }>(req);
      const project = this.db.getProject(body.projectId);
      const asset = project?.assets[body.assetId];
      if (!project || !asset) return sendJson(res, 404, { error: 'Asset not found' });

      const caps = getAiCapabilities(this.paths.projectRoot, this.modelsDir);

      if (body.task === 'silence') {
        const silences = await detectSilence(asset.sourcePath);
        return sendJson(res, 200, { silences });
      }
      if (body.task === 'scenes') {
        const scenesUs = await detectScenes(asset.sourcePath);
        asset.scenesUs = scenesUs;
        this.db.applyProjectSnapshot(project.id, `AI Scene Detect: ${asset.name}`, project);
        return sendJson(res, 200, { scenesUs });
      }
      if (body.task === 'beats') {
        const beatsUs = await detectBeats(asset.sourcePath, this.tempDir);
        asset.beatsUs = beatsUs;
        this.db.applyProjectSnapshot(project.id, `AI Beat Detect: ${asset.name}`, project);
        return sendJson(res, 200, { beatsUs });
      }
      if (body.task === 'transcribe') {
        const result = await transcribeMedia(asset, this.tempDir, this.modelsDir, body.language ?? 'vi');
        asset.transcript = result.segments;
        this.db.applyProjectSnapshot(project.id, `AI Transcribe: ${asset.name}`, project);
        return sendJson(res, 200, result);
      }
      if (body.task === 'matting') {
        if (!caps.visionBinaryPath) {
          return sendJson(res, 503, { error: 'Apple Vision native binary not compiled' });
        }
        const maskPath = await runAppleVisionMatting(asset, this.cacheDir, caps.visionBinaryPath);
        asset.mattingMaskPath = maskPath;
        this.db.applyProjectSnapshot(project.id, `AI Person Matting: ${asset.name}`, project);
        return sendJson(res, 200, { mattingMaskPath: maskPath });
      }
      if (body.task === 'face-track') {
        if (!caps.visionBinaryPath) {
          return sendJson(res, 503, { error: 'Apple Vision native binary not compiled' });
        }
        const track = await runAppleVisionFaceTrack(asset, this.cacheDir, caps.visionBinaryPath);
        return sendJson(res, 200, { track });
      }
    }

    // Segment Pre-Render Cache
    if (pathname === '/api/prerender' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; clipId: string }>(req);
      const project = this.db.getProject(body.projectId);
      const clip = project?.clips[body.clipId];
      if (!project || !clip) return sendJson(res, 404, { error: 'Clip not found' });
      const resCache = await prerenderSegment(project, clip, path.join(this.cacheDir, 'prerender'), this.db);
      clip.prerenderHash = resCache.hash;
      const updated = this.db.applyProjectSnapshot(project.id, `Pre-render Segment: ${clip.name}`, project);
      return sendJson(res, 200, { ...resCache, project: updated });
    }

    // Export Video / Audio / Subtitles / Interop
    if (pathname === '/api/export' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; options: Partial<ExportOptions> }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
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
          outputPath: outPath,
        },
        this.tempDir,
        this.db
      );
      return sendJson(res, 200, { result });
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
            outputPath: outPath,
          },
          this.tempDir,
          this.db
        );
        results.push({ projectId: project.id, name: project.name, ...resExport });
      }
      return sendJson(res, 200, { results });
    }

    // Interop: CapCut draft_content.json, FCPXML, OTIO, .cube LUT, .srt
    if (pathname === '/api/interop/export' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; format: 'capcut' | 'fcpxml' | 'otio' }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      if (body.format === 'capcut') {
        return sendJson(res, 200, { filename: `${project.name}_draft_content.json`, content: JSON.stringify(exportToCapCutDraft(project), null, 2) });
      }
      if (body.format === 'fcpxml') {
        return sendJson(res, 200, { filename: `${project.name}.fcpxml`, content: exportToFCPXML(project) });
      }
      return sendJson(res, 200, { filename: `${project.name}.otio`, content: exportToOTIO(project) });
    }

    if (pathname === '/api/interop/import-capcut' && req.method === 'POST') {
      const body = await readJsonBody<{ draft: CapCutDraftContent; projectId?: string }>(req);
      const project = importFromCapCutDraft(body.draft, body.projectId);
      this.db.saveImportedProject(project);
      return sendJson(res, 200, { project });
    }

    if (pathname === '/api/interop/parse-lut' && req.method === 'POST') {
      const body = await readJsonBody<{ content: string }>(req);
      const parsed = parseCubeLUT(body.content);
      return sendJson(res, 200, {
        title: parsed.title,
        size: parsed.size,
        data: Array.from(parsed.data),
      });
    }

    if (pathname === '/api/interop/parse-srt' && req.method === 'POST') {
      const body = await readJsonBody<{ content: string }>(req);
      return sendJson(res, 200, { segments: parseSRT(body.content) });
    }

    // T-ChatCut Copilot endpoints
    if (pathname === '/api/chatcut/plan' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; prompt: string }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      const plan = await buildChatCutPlan(project, body.prompt, this.tempDir, this.modelsDir);
      return sendJson(res, 200, { plan });
    }

    if (pathname === '/api/chatcut/apply' && req.method === 'POST') {
      const body = await readJsonBody<{ projectId: string; plan: Parameters<typeof applyChatCutPlan>[1] }>(req);
      const project = this.db.getProject(body.projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      const next = applyChatCutPlan(project, body.plan);
      const saved = this.db.applyProjectSnapshot(project.id, `T-ChatCut: ${body.plan.prompt.slice(0, 40)}`, next);
      return sendJson(res, 200, { project: saved, history: this.db.getHistory(project.id) });
    }

    // Serve built Studio frontend when studioDistDir exists
    if (this.paths.studioDistDir && fs.existsSync(this.paths.studioDistDir)) {
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      let target = path.join(this.paths.studioDistDir, rel);
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        target = path.join(this.paths.studioDistDir, 'index.html');
      }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_MAP[ext] ?? 'application/octet-stream' });
      fs.createReadStream(target).pipe(res);
      return;
    }

    sendJson(res, 404, { error: `Unknown route: ${pathname}` });
  }
}
