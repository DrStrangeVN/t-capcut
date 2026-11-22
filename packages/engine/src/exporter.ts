import { execFile, spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  US_PER_SEC,
  exportSubtitlesToASS,
  exportSubtitlesToSRT,
  exportSubtitlesToVTT,
  isClipAudioAudible,
  resolveEffectiveClips,
  type Clip,
  type Project,
} from '@t-capcut/schema';
import { findRnnoiseModel } from './ai.js';
import type { ProjectDatabase } from './db.js';

const execFileAsync = promisify(execFile);

export interface ExportOptions {
  outputPath: string;
  mode: 'hardware' | 'lossless-hybrid' | 'audio-only' | 'subtitle-only' | 'wysiwyg-pipe';
  codec?: 'h264' | 'hevc' | 'prores';
  tenBitHevc?: boolean;
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  burnSubtitles?: boolean;
  loudnorm?: boolean;
  subtitleFormat?: 'srt' | 'ass' | 'vtt';
  rangeStartUs?: number | null;
  rangeEndUs?: number | null;
  lutsDir?: string;
  presetsAssetsDir?: string;
  modelsDir?: string;
  onProgress?: (ev: ExportProgressEvent) => void;
  abortSignal?: AbortSignal;
}

export interface ExportProgressEvent {
  percent: number;
  outTimeUs: number;
  fps: number;
  speed: string;
  totalSizeBytes: number;
}

export interface ExportResult {
  outputPath: string;
  modeUsed: string;
  durationMs: number;
  fileSizeBytes: number;
  losslessSpansCount?: number;
}

function getEffectiveClipsInRange(project: Project, options: ExportOptions): {
  clips: Clip[];
  totalDurationUs: number;
} {
  const flat = resolveEffectiveClips(project);
  const hasRange =
    options.rangeStartUs != null &&
    options.rangeEndUs != null &&
    options.rangeEndUs > options.rangeStartUs + 100_000;
  const rStart = hasRange ? Math.max(0, options.rangeStartUs!) : 0;
  const rEnd = hasRange
    ? options.rangeEndUs!
    : Math.max(US_PER_SEC, flat.reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0));

  if (!hasRange) {
    return { clips: flat, totalDurationUs: rEnd };
  }

  const sliced: Clip[] = [];
  for (const clip of flat) {
    const cEnd = clip.timelineStartUs + clip.durationUs;
    const s = Math.max(rStart, clip.timelineStartUs);
    const e = Math.min(rEnd, cEnd);
    if (e - s <= 20_000) continue;
    const leftTrim = s - clip.timelineStartUs;
    const rate = clip.speed.mode === 'uniform' ? Math.max(0.1, clip.speed.rate || 1) : 1;
    sliced.push({
      ...clip,
      timelineStartUs: s - rStart,
      durationUs: e - s,
      sourceStartUs: clip.sourceStartUs + Math.round(leftTrim * rate),
      sourceDurationUs: Math.max(20_000, Math.round((e - s) * rate)),
    });
  }
  return { clips: sliced, totalDurationUs: Math.max(US_PER_SEC, rEnd - rStart) };
}

function runFfmpegWithProgress(
  args: string[],
  totalDurationUs: number,
  onProgress?: (ev: ExportProgressEvent) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ffArgs = ['-progress', 'pipe:1', '-nostats', ...args];
    const proc = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errLog = '';
    let aborted = false;

    const onAbort = () => {
      aborted = true;
      proc.kill('SIGTERM');
    };
    if (abortSignal) {
      if (abortSignal.aborted) {
        proc.kill('SIGTERM');
        reject(new Error('Export cancelled'));
        return;
      }
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    let outTimeUs = 0;
    let fps = 0;
    let speed = '1.0x';
    let totalSizeBytes = 0;
    let bufTail = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      bufTail += chunk.toString('utf8');
      const lines = bufTail.split(/\r?\n/);
      bufTail = lines.pop() ?? '';
      for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (k === 'out_time_us') outTimeUs = Number(v) || 0;
        else if (k === 'fps') fps = Number(v) || 0;
        else if (k === 'speed') speed = v;
        else if (k === 'total_size') totalSizeBytes = Number(v) || 0;
        else if (k === 'progress') {
          const pct = Math.min(99, Math.max(1, Math.round((outTimeUs / Math.max(1, totalDurationUs)) * 100)));
          onProgress?.({
            percent: v === 'end' ? 100 : pct,
            outTimeUs,
            fps,
            speed,
            totalSizeBytes,
          });
        }
      }
    });

    proc.stderr?.on('data', (d: Buffer) => {
      errLog = (errLog + d.toString('utf8')).slice(-4096);
    });

    proc.on('error', (err) => {
      abortSignal?.removeEventListener('abort', onAbort);
      reject(err);
    });

    proc.on('close', (code) => {
      abortSignal?.removeEventListener('abort', onAbort);
      if (aborted) reject(new Error('Export cancelled'));
      else if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${errLog.trim()}`));
    });
  });
}

function buildAtempoChain(rate: number): string {
  let r = Math.min(8, Math.max(0.2, rate));
  const filters: string[] = [];
  while (r > 2.0) {
    filters.push('atempo=2.0');
    r /= 2.0;
  }
  while (r < 0.5) {
    filters.push('atempo=0.5');
    r *= 2.0;
  }
  if (Math.abs(r - 1) > 0.01) {
    filters.push(`atempo=${r.toFixed(4)}`);
  }
  return filters.join(',');
}

function buildAudioFilterGraph(
  project: Project,
  audioClips: Clip[],
  inputs: string[],
  startInputIdx: number,
  totalSec: string,
  loudnorm: boolean,
  modelsDir?: string
): { filterChains: string[]; audioOutLabel: string; nextInputIdx: number } {
  const filterChains: string[] = [];
  const audioLabels: Array<{ label: string; isVoice: boolean; autoDuck: boolean }> = [];
  let inputIdx = startInputIdx;
  const rnnoiseModel = modelsDir ? findRnnoiseModel(modelsDir) : null;

  for (let i = 0; i < audioClips.length; i++) {
    const clip = audioClips[i];
    const asset = project.assets[clip.assetId!]!;
    const track = project.tracks.find((t) => t.id === clip.trackId);
    const idx = inputIdx++;
    inputs.push('-i', asset.sourcePath);

    const startSec = (clip.sourceStartUs / US_PER_SEC).toFixed(3);
    const endSec = ((clip.sourceStartUs + clip.sourceDurationUs) / US_PER_SEC).toFixed(3);
    const delayMs = Math.max(0, Math.round(clip.timelineStartUs / 1000));
    const extraFilters: string[] = [];

    if (clip.speed.reverse) extraFilters.push('areverse');
    const tempo = buildAtempoChain(clip.speed.rate || 1);
    if (tempo) extraFilters.push(tempo);

    if (clip.audio.denoise) {
      if (rnnoiseModel) {
        const safeModel = rnnoiseModel.replace(/'/g, "\\'");
        extraFilters.push(`arnndn=m='${safeModel}'`);
      } else {
        extraFilters.push('highpass=f=75,afftdn=nf=-25');
      }
    }

    if (clip.audio.voicePreset === 'podcast') {
      extraFilters.push('highpass=f=85,acompressor=threshold=-18dB:ratio=3:attack=5:release=60');
    } else if (clip.audio.voicePreset === 'megaphone') {
      extraFilters.push('highpass=f=450,lowpass=f=3200,acompressor=threshold=-12dB:ratio=6');
    } else if (clip.audio.voicePreset === 'deep') {
      extraFilters.push('asetrate=48000*0.82,aresample=48000,atempo=1.2195');
    } else if (clip.audio.voicePreset === 'chipmunk') {
      extraFilters.push('asetrate=48000*1.32,aresample=48000,atempo=0.7575');
    } else if (clip.audio.voicePreset === 'robot') {
      extraFilters.push('aecho=0.8:0.88:12:0.6,highpass=f=200');
    }

    // Studio Audio DSP v4: 5-Band EQ, Noise Gate, Compressor, Semitone Pitch Shift
    if (clip.audio.noiseGateEnabled) {
      extraFilters.push('agate=threshold=0.015:ratio=4:attack=10:release=120');
    }
    const eqFreqs = [80, 250, 1000, 4000, 12000];
    (clip.audio.eqBands ?? []).forEach((gainDb, bIdx) => {
      if (Math.abs(gainDb) > 0.25 && eqFreqs[bIdx]) {
        extraFilters.push(`equalizer=f=${eqFreqs[bIdx]}:t=q:w=1.4:g=${gainDb.toFixed(1)}`);
      }
    });
    if (clip.audio.compressorEnabled) {
      extraFilters.push('acompressor=threshold=-16dB:ratio=3.5:attack=8:release=80:makeup=2');
    }
    if (clip.audio.pitchSemitones && Math.abs(clip.audio.pitchSemitones) > 0.1) {
      const ratio = Math.pow(2, clip.audio.pitchSemitones / 12);
      const invTempo = Math.min(2.0, Math.max(0.5, 1 / ratio));
      extraFilters.push(`asetrate=48000*${ratio.toFixed(4)},aresample=48000,atempo=${invTempo.toFixed(4)}`);
    }

    if (clip.audio.fadeInUs > 0) extraFilters.push(`afade=t=in:st=0:d=${(clip.audio.fadeInUs / US_PER_SEC).toFixed(3)}`);
    if (clip.audio.fadeOutUs > 0) {
      const outStart = Math.max(0, (clip.durationUs - clip.audio.fadeOutUs) / US_PER_SEC).toFixed(3);
      extraFilters.push(`afade=t=out:st=${outStart}:d=${(clip.audio.fadeOutUs / US_PER_SEC).toFixed(3)}`);
    }

    const vol = Math.max(0, Math.min(2.5, clip.audio.volume * (track?.volume ?? 1)));
    const pan = Math.max(-1, Math.min(1, clip.audio.pan || 0));
    const panFilter =
      Math.abs(pan) > 0.02
        ? `,aformat=channel_layouts=stereo,pan=stereo|c0=${(pan <= 0 ? 1 : 1 - pan).toFixed(2)}*c0|c1=${(pan >= 0 ? 1 : 1 + pan).toFixed(2)}*c1`
        : '';

    const extraStr = extraFilters.length > 0 ? `,${extraFilters.join(',')}` : '';
    const lbl = `[aud_${i}]`;
    filterChains.push(
      `[${idx}:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS,volume=${vol.toFixed(2)}${extraStr}${panFilter},adelay=${delayMs}|${delayMs}${lbl}`
    );
    audioLabels.push({
      label: lbl,
      isVoice: clip.kind === 'video' && !clip.audio.autoDucking,
      autoDuck: clip.audio.autoDucking,
    });
  }

  let audioOutLabel = '';
  if (audioLabels.length > 0) {
    const loudPart = loudnorm ? ',loudnorm=I=-14:TP=-1.5:LRA=11' : '';
    const voiceTrack = audioLabels.find((a) => a.isVoice);
    const duckTracks = audioLabels.filter((a) => a.autoDuck);

    if (audioLabels.length === 1) {
      filterChains.push(`${audioLabels[0].label}apad=whole_dur=${totalSec}${loudPart}[afinal]`);
    } else if (voiceTrack && duckTracks.length > 0) {
      filterChains.push(`${voiceTrack.label}asplit=2[vmain][vtrig]`);
      const mixedInputs: string[] = ['[vmain]'];
      duckTracks.forEach((dt, di) => {
        const duckedLbl = `[ducked_${di}]`;
        filterChains.push(
          `${dt.label}[vtrig]sidechaincompress=threshold=0.03:ratio=8:attack=25:release=350${duckedLbl}`
        );
        mixedInputs.push(duckedLbl);
      });
      audioLabels
        .filter((a) => a !== voiceTrack && !a.autoDuck)
        .forEach((other) => mixedInputs.push(other.label));
      filterChains.push(
        `${mixedInputs.join('')}amix=inputs=${mixedInputs.length}:normalize=0:duration=longest,apad=whole_dur=${totalSec}${loudPart}[afinal]`
      );
    } else {
      filterChains.push(
        `${audioLabels.map((a) => a.label).join('')}amix=inputs=${audioLabels.length}:normalize=0:duration=longest,apad=whole_dur=${totalSec}${loudPart}[afinal]`
      );
    }
    audioOutLabel = '[afinal]';
  }

  return { filterChains, audioOutLabel, nextInputIdx: inputIdx };
}

function canUseLosslessHybrid(project: Project, clips: Clip[]): boolean {
  const videoClips = clips.filter((c) => c.kind === 'video');
  if (videoClips.length === 0) return false;
  if (clips.some((c) => c.kind !== 'video')) return false;
  if (Object.keys(project.nestedTimelines ?? {}).length > 0) return false;

  const firstAsset = videoClips[0].assetId;
  return videoClips.every(
    (c) =>
      c.assetId === firstAsset &&
      c.speed.mode === 'uniform' &&
      c.speed.rate === 1 &&
      !c.speed.reverse &&
      c.transform.scaleX === 1 &&
      c.transform.scaleY === 1 &&
      c.transform.rotation === 0 &&
      !c.transform.flipH &&
      !c.transform.flipV &&
      c.transform.x === 0 &&
      c.transform.y === 0 &&
      c.transform.opacity === 1 &&
      c.transform.cropLeft === 0 &&
      c.transform.cropRight === 0 &&
      c.transform.cropTop === 0 &&
      c.transform.cropBottom === 0 &&
      !c.chromaKey.enabled &&
      c.mask.shape === 'none' &&
      !c.aiMattingEnabled &&
      c.effects.length === 0 &&
      c.colorGrade.brightness === 0 &&
      c.colorGrade.contrast === 0 &&
      c.colorGrade.saturation === 0 &&
      c.colorGrade.exposure === 0 &&
      !c.colorGrade.lutId
  );
}

export interface WysiwygPipeSession {
  writeFrame(rgba: Buffer): Promise<void>;
  finish(): Promise<ExportResult>;
  cancel(): void;
}

/**
 * Starts an exact pixel-identical WYSIWYG pipe export session:
 * receives composited RGBA frames from WebGL2 + 2D Canvas and muxes with multi-track FFmpeg audio.
 */
export function startWysiwygPipeExport(
  project: Project,
  options: ExportOptions
): WysiwygPipeSession {
  const t0 = Date.now();
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });

  const outW = options.width ?? project.settings.width;
  const outH = options.height ?? project.settings.height;
  const outFps = options.fps ?? project.settings.fps;
  const { clips: allClips, totalDurationUs } = getEffectiveClipsInRange(project, options);
  const totalSec = (totalDurationUs / US_PER_SEC).toFixed(3);

  const audioClips = allClips
    .filter((c) => (c.kind === 'audio' || (c.kind === 'video' && project.assets[c.assetId ?? '']?.hasAudio)) && c.assetId && isClipAudioAudible(c, project))
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const inputs: string[] = [
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${outW}x${outH}`, '-r', String(outFps), '-i', 'pipe:0',
  ];
  const { filterChains, audioOutLabel } = buildAudioFilterGraph(
    project,
    audioClips,
    inputs,
    1,
    totalSec,
    options.loudnorm ?? true,
    options.modelsDir
  );

  const encoderName =
    options.codec === 'hevc'
      ? 'hevc_videotoolbox'
      : options.codec === 'prores'
        ? 'prores_videotoolbox'
        : 'h264_videotoolbox';

  const args: string[] = [
    '-y',
    '-progress', 'pipe:1',
    '-nostats',
    ...inputs,
    ...(filterChains.length > 0 ? ['-filter_complex', filterChains.join(';')] : []),
    '-map', '0:v',
    ...(audioOutLabel ? ['-map', audioOutLabel, '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-c:v', encoderName,
    ...(options.codec === 'prores' ? [] : ['-b:v', `${options.bitrateKbps ?? 12000}k`]),
    ...(options.codec === 'hevc' && options.tenBitHevc
      ? ['-profile:v', 'main10', '-pix_fmt', 'p010le']
      : ['-pix_fmt', 'yuv420p']),
    '-movflags', '+faststart',
    '-t', totalSec,
    options.outputPath,
  ];

  const proc: ChildProcess = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let errLog = '';
  let framesWritten = 0;
  const expectedFrames = Math.max(1, Math.round((totalDurationUs / US_PER_SEC) * outFps));

  proc.stderr?.on('data', (d: Buffer) => {
    errLog = (errLog + d.toString('utf8')).slice(-4096);
  });

  const exitPromise = new Promise<void>((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`WYSIWYG ffmpeg exited (${code}): ${errLog.trim()}`));
    });
  });

  return {
    async writeFrame(rgba: Buffer) {
      if (!proc.stdin || proc.killed) throw new Error('Pipe closed');
      framesWritten++;
      options.onProgress?.({
        percent: Math.min(98, Math.round((framesWritten / expectedFrames) * 100)),
        outTimeUs: Math.round((framesWritten / outFps) * US_PER_SEC),
        fps: outFps,
        speed: 'GPU-Pipe',
        totalSizeBytes: 0,
      });
      if (!proc.stdin.write(rgba)) {
        await new Promise<void>((resolve) => proc.stdin!.once('drain', resolve));
      }
    },
    async finish(): Promise<ExportResult> {
      proc.stdin?.end();
      await exitPromise;
      options.onProgress?.({
        percent: 100,
        outTimeUs: totalDurationUs,
        fps: outFps,
        speed: '100%',
        totalSizeBytes: fs.existsSync(options.outputPath) ? fs.statSync(options.outputPath).size : 0,
      });
      return {
        outputPath: options.outputPath,
        modeUsed: `wysiwyg-${encoderName}`,
        durationMs: Date.now() - t0,
        fileSizeBytes: fs.statSync(options.outputPath).size,
      };
    },
    cancel() {
      proc.kill('SIGTERM');
    },
  };
}

/**
 * Smart Lossless Hybrid Exporter + Full Hardware Compositor Exporter (Compound, Multi-track Audio, Word Karaoke, LUT3D, Chroma, Matting, Progress).
 */
export async function exportProject(
  project: Project,
  options: ExportOptions,
  tempDir: string,
  db?: ProjectDatabase
): Promise<ExportResult> {
  const t0 = Date.now();
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const { clips: allClips, totalDurationUs } = getEffectiveClipsInRange(project, options);
  const totalSec = (totalDurationUs / US_PER_SEC).toFixed(3);

  if (options.mode === 'subtitle-only') {
    const fmt = options.subtitleFormat ?? 'srt';
    const content =
      fmt === 'ass'
        ? exportSubtitlesToASS(allClips, project.settings.width, project.settings.height)
        : fmt === 'vtt'
          ? exportSubtitlesToVTT(allClips)
          : exportSubtitlesToSRT(allClips);
    fs.writeFileSync(options.outputPath, content, 'utf8');
    return {
      outputPath: options.outputPath,
      modeUsed: `subtitle-${fmt}`,
      durationMs: Date.now() - t0,
      fileSizeBytes: fs.statSync(options.outputPath).size,
    };
  }

  if (options.mode === 'audio-only') {
    const audioCandidates = allClips
      .filter((c) => c.assetId && (c.kind === 'audio' || (c.kind === 'video' && project.assets[c.assetId]?.hasAudio)) && isClipAudioAudible(c, project))
      .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

    if (audioCandidates.length === 0) {
      await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', totalSec, options.outputPath]);
    } else {
      const inputs: string[] = [];
      const { filterChains, audioOutLabel } = buildAudioFilterGraph(
        project,
        audioCandidates,
        inputs,
        0,
        totalSec,
        options.loudnorm ?? true,
        options.modelsDir
      );
      await runFfmpegWithProgress(
        ['-y', ...inputs, '-filter_complex', filterChains.join(';'), '-map', audioOutLabel, '-vn', '-t', totalSec, options.outputPath],
        totalDurationUs,
        options.onProgress,
        options.abortSignal
      );
    }

    return {
      outputPath: options.outputPath,
      modeUsed: 'audio-only-mix',
      durationMs: Date.now() - t0,
      fileSizeBytes: fs.statSync(options.outputPath).size,
    };
  }

  // Smart Lossless Hybrid Fast Path (stream-copy GOP spans without re-encoding)
  if (options.mode === 'lossless-hybrid' && canUseLosslessHybrid(project, allClips)) {
    const spans = allClips
      .filter((c) => c.kind === 'video' && c.assetId)
      .sort((a, b) => a.timelineStartUs - b.timelineStartUs);
    const asset = project.assets[spans[0].assetId!];
    const partFiles: string[] = [];
    const listFile = path.join(tempDir, `concat_${Date.now()}.txt`);

    try {
      for (let i = 0; i < spans.length; i++) {
        const s = spans[i];
        const partPath = path.join(tempDir, `span_${Date.now()}_${i}.mp4`);
        await execFileAsync('ffmpeg', [
          '-y',
          '-ss', (s.sourceStartUs / US_PER_SEC).toFixed(3),
          '-t', (s.durationUs / US_PER_SEC).toFixed(3),
          '-i', asset.sourcePath,
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          partPath,
        ]);
        partFiles.push(partPath);
        options.onProgress?.({
          percent: Math.round(((i + 1) / (spans.length + 1)) * 100),
          outTimeUs: s.timelineStartUs + s.durationUs,
          fps: project.settings.fps,
          speed: 'copy',
          totalSizeBytes: 0,
        });
      }

      if (partFiles.length === 1) {
        fs.copyFileSync(partFiles[0], options.outputPath);
      } else {
        fs.writeFileSync(listFile, partFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
        await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', options.outputPath]);
      }

      options.onProgress?.({
        percent: 100,
        outTimeUs: totalDurationUs,
        fps: project.settings.fps,
        speed: 'copy',
        totalSizeBytes: fs.statSync(options.outputPath).size,
      });

      return {
        outputPath: options.outputPath,
        modeUsed: 'lossless-hybrid-stream-copy',
        durationMs: Date.now() - t0,
        fileSizeBytes: fs.statSync(options.outputPath).size,
        losslessSpansCount: spans.length,
      };
    } finally {
      for (const f of partFiles) if (fs.existsSync(f)) fs.unlinkSync(f);
      if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
    }
  }

  // Full Hardware Compositor Pipeline (VideoToolbox + Filtergraph + Word Karaoke + LUT3D + Chroma + Matting + Audio)
  const outW = options.width ?? project.settings.width;
  const outH = options.height ?? project.settings.height;
  const outFps = options.fps ?? project.settings.fps;

  const visualClips = allClips
    .filter((c) => (c.kind === 'video' || c.kind === 'image') && c.assetId && project.assets[c.assetId])
    .sort((a, b) => {
      const ta = (a as Clip & { __effectiveTrackIndex?: number }).__effectiveTrackIndex ?? project.tracks.find((t) => t.id === a.trackId)?.index ?? 0;
      const tb = (b as Clip & { __effectiveTrackIndex?: number }).__effectiveTrackIndex ?? project.tracks.find((t) => t.id === b.trackId)?.index ?? 0;
      return ta - tb || a.timelineStartUs - b.timelineStartUs;
    });

  const audioClips = allClips
    .filter((c) => (c.kind === 'audio' || (c.kind === 'video' && project.assets[c.assetId ?? '']?.hasAudio)) && c.assetId && isClipAudioAudible(c, project))
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const inputs: string[] = ['-f', 'lavfi', '-i', `color=c=black:s=${outW}x${outH}:r=${outFps}:d=${totalSec}`];
  const filterChains: string[] = [];
  let lastVideoLabel = '[0:v]';
  let inputIdx = 1;

  for (let i = 0; i < visualClips.length; i++) {
    const clip = visualClips[i];
    const asset = project.assets[clip.assetId!]!;
    const idx = inputIdx++;
    if (clip.kind === 'image') {
      inputs.push('-loop', '1', '-t', (clip.durationUs / US_PER_SEC).toFixed(3), '-i', asset.sourcePath);
    } else {
      inputs.push('-i', asset.sourcePath);
    }

    const startSec = (clip.sourceStartUs / US_PER_SEC).toFixed(3);
    const endSec = ((clip.sourceStartUs + clip.sourceDurationUs) / US_PER_SEC).toFixed(3);
    const tOffset = (clip.timelineStartUs / US_PER_SEC).toFixed(3);
    const speedRate = Math.max(0.1, clip.speed.rate || 1);

    const vFilters: string[] = [];
    if (clip.kind === 'image') {
      vFilters.push(`setpts=PTS-STARTPTS+${tOffset}/TB`);
    } else {
      vFilters.push(`trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS`);
      if (clip.speed.reverse) vFilters.push('reverse');
      vFilters.push(`setpts=PTS/${speedRate.toFixed(3)}+${tOffset}/TB`);
    }

    // Crop + Flip
    const cL = Math.max(0, Math.min(0.45, clip.transform.cropLeft || 0));
    const cR = Math.max(0, Math.min(0.45, clip.transform.cropRight || 0));
    const cT = Math.max(0, Math.min(0.45, clip.transform.cropTop || 0));
    const cB = Math.max(0, Math.min(0.45, clip.transform.cropBottom || 0));
    if (cL > 0 || cR > 0 || cT > 0 || cB > 0) {
      const cwRatio = Math.max(0.1, 1 - cL - cR);
      const chRatio = Math.max(0.1, 1 - cT - cB);
      vFilters.push(`crop=iw*${cwRatio.toFixed(3)}:ih*${chRatio.toFixed(3)}:iw*${cL.toFixed(3)}:ih*${cT.toFixed(3)}`);
    }
    if (clip.transform.flipH) vFilters.push('hflip');
    if (clip.transform.flipV) vFilters.push('vflip');

    const scaledW = Math.max(2, Math.round(outW * clip.transform.scaleX) & ~1);
    const scaledH = Math.max(2, Math.round(outH * clip.transform.scaleY) & ~1);
    if (clip.transform.fillMode === 'cover') {
      vFilters.push(`scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${scaledW}:${scaledH},format=yuva420p`);
    } else {
      vFilters.push(`scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease,pad=${scaledW}:${scaledH}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=yuva420p`);
    }

    // Rotation
    if (Math.abs(clip.transform.rotation) > 0.1) {
      const rad = ((clip.transform.rotation * Math.PI) / 180).toFixed(4);
      vFilters.push(`rotate=${rad}:c=none:ow=rotw(${rad}):oh=roth(${rad})`);
    }

    // Color grading parity
    const eqParts: string[] = [];
    const bright = clip.colorGrade.brightness + clip.colorGrade.exposure * 0.25;
    if (Math.abs(bright) > 0.005) eqParts.push(`brightness=${Math.max(-1, Math.min(1, bright * 0.5)).toFixed(3)}`);
    if (Math.abs(clip.colorGrade.contrast) > 0.005) eqParts.push(`contrast=${Math.max(0, 1 + clip.colorGrade.contrast).toFixed(3)}`);
    if (Math.abs(clip.colorGrade.saturation) > 0.005) eqParts.push(`saturation=${Math.max(0, 1 + clip.colorGrade.saturation).toFixed(3)}`);
    if (eqParts.length > 0) vFilters.push(`eq=${eqParts.join(':')}`);
    if (Math.abs(clip.colorGrade.vibrance) > 0.01) {
      vFilters.push(`vibrance=intensity=${Math.max(-2, Math.min(2, clip.colorGrade.vibrance)).toFixed(3)}`);
    }
    if (Math.abs(clip.colorGrade.temperature) > 0.01) {
      const temp = clip.colorGrade.temperature;
      vFilters.push(`colorbalance=rs=${(temp * 0.2).toFixed(3)}:bs=${(-temp * 0.2).toFixed(3)}`);
    }
    if (clip.colorGrade.vignette > 0.01) {
      vFilters.push(`vignette=angle=${(clip.colorGrade.vignette * 0.6).toFixed(3)}`);
    }

    // Persistent 3D LUT (.cube) — checks user uploaded LUTs, then built-in embedded LUT library
    if (clip.colorGrade.lutId) {
      const lutIdClean = clip.colorGrade.lutId.replace(/\.cube$/i, '');
      const lutCandidates = [
        project.luts?.[clip.colorGrade.lutId]?.filePath,
        options.lutsDir ? path.join(options.lutsDir, `${lutIdClean}.cube`) : null,
        options.presetsAssetsDir ? path.join(options.presetsAssetsDir, 'luts', `${lutIdClean}.cube`) : null,
      ].filter((p): p is string => Boolean(p));
      const lutPath = lutCandidates.find((p) => fs.existsSync(p));
      if (lutPath) {
        vFilters.push(`lut3d=file='${lutPath.replace(/'/g, "\\'")}'`);
      }
    }

    // Chroma key
    if (clip.chromaKey.enabled) {
      const hex = clip.chromaKey.colorHex.replace('#', '');
      const sim = Math.max(0.01, Math.min(1, clip.chromaKey.similarity)).toFixed(3);
      const blend = Math.max(0.01, Math.min(1, clip.chromaKey.smoothness)).toFixed(3);
      vFilters.push(`chromakey=0x${hex}:${sim}:${blend}`);
    }

    // Opacity
    if (clip.transform.opacity < 0.995) {
      vFilters.push(`colorchannelmixer=aa=${Math.max(0, Math.min(1, clip.transform.opacity)).toFixed(3)}`);
    }

    const vPrepLabel = `[vprep_${i}]`;
    const maskPath = clip.aiMattingEnabled ? asset.mattingMaskPath : null;
    if (maskPath && fs.existsSync(maskPath)) {
      const mIdx = inputIdx++;
      inputs.push('-i', maskPath);
      const vPreMask = `[vpremask_${i}]`;
      const mPrep = `[mprep_${i}]`;
      filterChains.push(`[${idx}:v]${vFilters.join(',')}${vPreMask}`);
      filterChains.push(
        `[${mIdx}:v]trim=start=${startSec}:end=${endSec},setpts=(PTS-STARTPTS)/${speedRate.toFixed(3)}+${tOffset}/TB,scale=${scaledW}:${scaledH},format=gray${mPrep}`
      );
      filterChains.push(`${vPreMask}${mPrep}alphamerge${vPrepLabel}`);
    } else {
      filterChains.push(`[${idx}:v]${vFilters.join(',')}${vPrepLabel}`);
    }

    const posX = `(W-w)/2+${Math.round(clip.transform.x * outW * 0.5)}`;
    const posY = `(H-h)/2+${Math.round(clip.transform.y * outH * 0.5)}`;
    const enableEnd = ((clip.timelineStartUs + clip.durationUs) / US_PER_SEC).toFixed(3);

    const vOutLabel = `[vout_${i}]`;
    filterChains.push(
      `${lastVideoLabel}${vPrepLabel}overlay=x=${posX}:y=${posY}:enable='between(t,${tOffset},${enableEnd})':eof_action=pass${vOutLabel}`
    );
    lastVideoLabel = vOutLabel;
  }

  // Burn-in Text & True Word-by-Word Karaoke Subtitles via macOS CoreText PNG Overlays
  const textClips = allClips.filter((c) => c.kind === 'text' && c.text);
  const tempOverlayFiles: string[] = [];
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const visionCandidates = [
    process.env.TCAPCUT_VISION_BIN,
    path.resolve(moduleDir, '..', '..', '..', 'native', 'bin', 'tcapcut-vision'),
    path.resolve(moduleDir, '..', '..', 'native', 'bin', 'tcapcut-vision'),
  ].filter((x): x is string => Boolean(x));
  const resolvedVision = visionCandidates.find((p) => fs.existsSync(p)) ?? null;

  if ((options.burnSubtitles ?? true) && textClips.length > 0 && resolvedVision) {
    for (let ti = 0; ti < textClips.length; ti++) {
      const tc = textClips[ti];
      const t = tc.text!;
      const boxW = Math.min(outW, Math.round(outW * 0.9));
      const boxH = Math.max(140, Math.round(t.fontSize * 3.2));
      const posX = `(W-w)/2+${Math.round(tc.transform.x * outW * 0.5)}`;
      const posY = `(H-h)/2+${Math.round(tc.transform.y * outH * 0.5)}`;

      const words = t.karaokeEnabled && t.words && t.words.length > 0 ? t.words : null;
      const wordSpans = words
        ? words.slice(0, 24).map((w, wi) => ({
            activeWordIndex: wi,
            startSec: Math.max(0, w.startUs / US_PER_SEC).toFixed(3),
            endSec: Math.max((w.startUs + 50_000) / US_PER_SEC, w.endUs / US_PER_SEC).toFixed(3),
          }))
        : [
            {
              activeWordIndex: null as number | null,
              startSec: (tc.timelineStartUs / US_PER_SEC).toFixed(3),
              endSec: ((tc.timelineStartUs + tc.durationUs) / US_PER_SEC).toFixed(3),
            },
          ];

      for (let wi = 0; wi < wordSpans.length; wi++) {
        const span = wordSpans[wi];
        const specPath = path.join(tempDir, `txt_spec_${Date.now()}_${ti}_${wi}.json`);
        const pngPath = path.join(tempDir, `txt_img_${Date.now()}_${ti}_${wi}.png`);
        tempOverlayFiles.push(specPath, pngPath);

        fs.writeFileSync(
          specPath,
          JSON.stringify({
            text: t.text,
            width: boxW,
            height: boxH,
            fontSize: t.fontSize,
            colorHex: t.color,
            strokeHex: t.strokeColor,
            strokeWidth: t.strokeWidth,
            activeWordIndex: span.activeWordIndex,
            activeColorHex: t.karaokeActiveColor,
          })
        );
        await execFileAsync(resolvedVision, ['render-text-png', specPath, pngPath]);

        const idx = inputIdx++;
        inputs.push('-loop', '1', '-t', totalSec, '-i', pngPath);
        const outLbl = `[vtxt_${ti}_${wi}]`;
        filterChains.push(
          `${lastVideoLabel}[${idx}:v]overlay=x=${posX}:y=${posY}:enable='between(t,${span.startSec},${span.endSec})':eof_action=pass${outLbl}`
        );
        lastVideoLabel = outLbl;
      }
    }
  }

  // Audio Mixing (multi-track + Solo/Mute + Denoise + Voice + Pan + Fade + Sidechain Auto-Ducking)
  const audioBuilt = buildAudioFilterGraph(
    project,
    audioClips,
    inputs,
    inputIdx,
    totalSec,
    options.loudnorm ?? true,
    options.modelsDir
  );
  filterChains.push(...audioBuilt.filterChains);
  const audioOutLabel = audioBuilt.audioOutLabel;

  const encoderName =
    options.codec === 'hevc'
      ? 'hevc_videotoolbox'
      : options.codec === 'prores'
        ? 'prores_videotoolbox'
        : 'h264_videotoolbox';

  const bitrate = `${options.bitrateKbps ?? 10000}k`;

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterChains.join(';'),
    '-map', lastVideoLabel,
    ...(audioOutLabel ? ['-map', audioOutLabel, '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-c:v', encoderName,
    ...(options.codec === 'prores' ? [] : ['-b:v', bitrate]),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-t', totalSec,
    options.outputPath,
  ];

  try {
    try {
      await runFfmpegWithProgress(args, totalDurationUs, options.onProgress, options.abortSignal);
    } catch (err) {
      if (options.abortSignal?.aborted) throw err;
      const fallbackArgs = args.map((a) => (a === encoderName ? 'libx264' : a));
      await runFfmpegWithProgress(fallbackArgs, totalDurationUs, options.onProgress, options.abortSignal);
    }
  } finally {
    for (const f of tempOverlayFiles) if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  if (db) {
    const hash = crypto.createHash('sha256').update(JSON.stringify({ id: project.id, updated: project.updatedAt })).digest('hex');
    db.putCacheEntry(hash, 'export', options.outputPath);
  }

  return {
    outputPath: options.outputPath,
    modeUsed: `compositor-${encoderName}`,
    durationMs: Date.now() - t0,
    fileSizeBytes: fs.statSync(options.outputPath).size,
  };
}

/**
 * Segment Pre-Render Cache (analogous to CapCut lvve::SegmentPreRenderCacheManager).
 */
export async function prerenderSegment(
  project: Project,
  clip: Clip,
  cacheDir: string,
  db: ProjectDatabase
): Promise<{ hash: string; filePath: string; cacheHit: boolean }> {
  const hash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        assetId: clip.assetId,
        sourceStartUs: clip.sourceStartUs,
        sourceDurationUs: clip.sourceDurationUs,
        colorGrade: clip.colorGrade,
        speed: clip.speed,
        transform: clip.transform,
      })
    )
    .digest('hex')
    .slice(0, 24);

  const cached = db.getCacheEntry(hash);
  if (cached) {
    return { hash, filePath: cached.filePath, cacheHit: true };
  }

  const asset = clip.assetId ? project.assets[clip.assetId] : undefined;
  if (!asset || asset.kind !== 'video') {
    throw new Error('Pre-render requires a video clip with valid asset');
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `seg_${hash}.mp4`);

  const eqParts: string[] = [];
  if (clip.colorGrade.brightness !== 0) eqParts.push(`brightness=${(clip.colorGrade.brightness * 0.5).toFixed(3)}`);
  if (clip.colorGrade.contrast !== 0) eqParts.push(`contrast=${(1 + clip.colorGrade.contrast).toFixed(3)}`);
  if (clip.colorGrade.saturation !== 0) eqParts.push(`saturation=${Math.max(0, 1 + clip.colorGrade.saturation).toFixed(3)}`);
  const vf = eqParts.length > 0 ? ['-vf', `eq=${eqParts.join(':')}`] : [];

  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', (clip.sourceStartUs / US_PER_SEC).toFixed(3),
    '-t', (clip.sourceDurationUs / US_PER_SEC).toFixed(3),
    '-i', asset.sourcePath,
    ...vf,
    '-c:v', 'h264_videotoolbox',
    '-b:v', '6000k',
    '-an',
    outPath,
  ]).catch(async () => {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', (clip.sourceStartUs / US_PER_SEC).toFixed(3),
      '-t', (clip.sourceDurationUs / US_PER_SEC).toFixed(3),
      '-i', asset.sourcePath,
      ...vf,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-an',
      outPath,
    ]);
  });

  db.putCacheEntry(hash, 'prerender', outPath);
  return { hash, filePath: outPath, cacheHit: false };
}
