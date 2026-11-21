import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  US_PER_SEC,
  createDefaultAudioState,
  createDefaultChromaKey,
  createDefaultColorGrade,
  createDefaultMask,
  createDefaultSpeed,
  createDefaultTextStyle,
  createDefaultTransform,
  exportToCapCutDraft,
  exportToFCPXML,
  exportToOTIO,
  type Clip,
} from '@t-capcut/schema';
import {
  ProjectDatabase,
  applyChatCutPlan,
  buildChatCutPlan,
  detectBeats,
  detectScenes,
  detectSilence,
  exportProject,
  probeMedia,
} from '@t-capcut/engine';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export const MCP_TOOLS = [
  {
    name: 'list_projects',
    description: 'List all T-CapCut projects stored in the local SQLite WAL database.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_timeline',
    description: 'Return full tracks, clips, markers, and settings for a T-CapCut project.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'import_media_to_timeline',
    description: 'Probe a local media file with ffprobe and append it to the Main Track.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        filePath: { type: 'string' },
      },
      required: ['projectId', 'filePath'],
    },
  },
  {
    name: 'add_text_caption',
    description: 'Add a styled text or Karaoke caption clip on the Text Track.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        text: { type: 'string' },
        startSec: { type: 'number' },
        durationSec: { type: 'number' },
        karaokeEnabled: { type: 'boolean' },
      },
      required: ['projectId', 'text', 'startSec', 'durationSec'],
    },
  },
  {
    name: 'chatcut_execute',
    description: 'Plan and apply natural-language ChatCut edits (silence removal, 9:16 reframe, scene split, captions, color) with Undo support.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        prompt: { type: 'string' },
        dryRun: { type: 'boolean' },
      },
      required: ['projectId', 'prompt'],
    },
  },
  {
    name: 'analyze_media_ai',
    description: 'Run on-device AI/DSP analysis (silence, scenes, beats) on a project asset.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        assetId: { type: 'string' },
        task: { type: 'string', enum: ['silence', 'scenes', 'beats'] },
      },
      required: ['projectId', 'assetId', 'task'],
    },
  },
  {
    name: 'export_timeline',
    description: 'Render/export project to MP4 (hardware VideoToolbox or lossless-hybrid), CapCut draft JSON, FCPXML, or OTIO.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        format: { type: 'string', enum: ['mp4-hardware', 'mp4-lossless', 'capcut-draft', 'fcpxml', 'otio'] },
        outputPath: { type: 'string' },
      },
      required: ['projectId', 'format'],
    },
  },
];

export class TCapCutMcpHandler {
  constructor(
    private db: ProjectDatabase,
    private dataDir: string
  ) {}

  async handleRpc(req: JsonRpcRequest): Promise<unknown> {
    if (req.method === 'initialize') {
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'tcapcut-mcp', version: '1.0.0' },
      };
    }

    if (req.method === 'tools/list') {
      return { tools: MCP_TOOLS };
    }

    if (req.method === 'tools/call') {
      const params = req.params ?? {};
      const name = String(params.name ?? '');
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const result = await this.callTool(name, args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    throw new Error(`Unsupported MCP method: ${req.method}`);
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tempDir = path.join(this.dataDir, 'tmp');
    const modelsDir = path.join(this.dataDir, 'models');

    if (name === 'list_projects') {
      return { projects: this.db.listProjects() };
    }

    if (name === 'get_timeline') {
      const project = this.db.getProject(String(args.projectId));
      if (!project) throw new Error('Project not found');
      return { project, history: this.db.getHistory(project.id) };
    }

    if (name === 'import_media_to_timeline') {
      const project = this.db.getProject(String(args.projectId));
      if (!project) throw new Error('Project not found');
      const asset = await probeMedia(String(args.filePath), `asset_${Date.now()}`);
      project.assets[asset.id] = asset;
      const mainTrack = project.tracks.find((t) => t.isMain) ?? project.tracks[0];
      const endUs = Object.values(project.clips)
        .filter((c) => c.trackId === mainTrack.id)
        .reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0);

      const clip: Clip = {
        id: `clip_${Date.now()}`,
        trackId: mainTrack.id,
        assetId: asset.id,
        kind: asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video',
        name: asset.name,
        timelineStartUs: endUs,
        durationUs: asset.durationUs,
        sourceStartUs: 0,
        sourceDurationUs: asset.durationUs,
        locked: false,
        disabled: false,
        transform: createDefaultTransform(),
        colorGrade: createDefaultColorGrade(),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed: createDefaultSpeed(),
        audio: createDefaultAudioState(),
        keyframes: {},
        effects: [],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
      project.clips[clip.id] = clip;
      return this.db.applyProjectSnapshot(project.id, `MCP Import ${asset.name}`, project);
    }

    if (name === 'add_text_caption') {
      const project = this.db.getProject(String(args.projectId));
      if (!project) throw new Error('Project not found');
      const textTrack = project.tracks.find((t) => t.type === 'text') ?? project.tracks[0];
      const text = String(args.text);
      const startUs = Math.round(Number(args.startSec) * US_PER_SEC);
      const durationUs = Math.round(Number(args.durationSec) * US_PER_SEC);
      const clipId = `txt_${Date.now()}`;
      const style = createDefaultTextStyle(text);
      style.karaokeEnabled = Boolean(args.karaokeEnabled ?? true);
      project.clips[clipId] = {
        id: clipId,
        trackId: textTrack.id,
        assetId: null,
        kind: 'text',
        name: text.slice(0, 28),
        timelineStartUs: startUs,
        durationUs,
        sourceStartUs: 0,
        sourceDurationUs: durationUs,
        locked: false,
        disabled: false,
        transform: { ...createDefaultTransform(), y: 0.34 },
        colorGrade: createDefaultColorGrade(),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed: createDefaultSpeed(),
        audio: createDefaultAudioState(),
        keyframes: {},
        text: style,
        effects: [],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
      return this.db.applyProjectSnapshot(project.id, `MCP Add Text`, project);
    }

    if (name === 'chatcut_execute') {
      const project = this.db.getProject(String(args.projectId));
      if (!project) throw new Error('Project not found');
      const plan = await buildChatCutPlan(project, String(args.prompt), tempDir, modelsDir);
      if (args.dryRun) return { plan };
      const next = applyChatCutPlan(project, plan);
      const saved = this.db.applyProjectSnapshot(project.id, `MCP ChatCut`, next);
      return { plan, project: saved };
    }

    if (name === 'analyze_media_ai') {
      const project = this.db.getProject(String(args.projectId));
      const asset = project?.assets[String(args.assetId)];
      if (!project || !asset) throw new Error('Asset not found');
      if (args.task === 'silence') return { silences: await detectSilence(asset.sourcePath) };
      if (args.task === 'scenes') return { scenesUs: await detectScenes(asset.sourcePath) };
      return { beatsUs: await detectBeats(asset.sourcePath, tempDir) };
    }

    if (name === 'export_timeline') {
      const project = this.db.getProject(String(args.projectId));
      if (!project) throw new Error('Project not found');
      const format = String(args.format);
      if (format === 'capcut-draft') return exportToCapCutDraft(project);
      if (format === 'fcpxml') return { fcpxml: exportToFCPXML(project) };
      if (format === 'otio') return JSON.parse(exportToOTIO(project));
      const outPath =
        (args.outputPath as string) || path.join(this.dataDir, 'exports', `${project.id}_mcp_${Date.now()}.mp4`);
      return exportProject(
        project,
        { mode: format === 'mp4-lossless' ? 'lossless-hybrid' : 'hardware', outputPath: outPath },
        tempDir,
        this.db
      );
    }

    throw new Error(`Unknown MCP tool: ${name}`);
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const dataDir = process.env.TCAPCUT_DATA_DIR || path.join(projectRoot, '.tcapcut-data');
  const db = new ProjectDatabase(path.join(dataDir, 'tcapcut.sqlite'));
  const handler = new TCapCutMcpHandler(db, dataDir);

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let req: JsonRpcRequest | null = null;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
      if (req.id === undefined) return; // Notification
      const result = await handler.handleRpc(req);
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: req?.id ?? null,
          error: { code: -32000, message: msg },
        }) + '\n'
      );
    }
  });
}
