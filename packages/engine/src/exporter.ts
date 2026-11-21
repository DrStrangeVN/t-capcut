import { execFile } from 'node:child_process';
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
  type Clip,
  type Project,
} from '@t-capcut/schema';
import type { ProjectDatabase } from './db.js';

const execFileAsync = promisify(execFile);

export interface ExportOptions {
  outputPath: string;
  mode: 'hardware' | 'lossless-hybrid' | 'audio-only' | 'subtitle-only';
  codec?: 'h264' | 'hevc' | 'prores';
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  burnSubtitles?: boolean;
  loudnorm?: boolean;
  subtitleFormat?: 'srt' | 'ass' | 'vtt';
}

export interface ExportResult {
  outputPath: string;
  modeUsed: string;
  durationMs: number;
  fileSizeBytes: number;
  losslessSpansCount?: number;
}

function canUseLosslessHybrid(project: Project): boolean {
  const activeClips = Object.values(project.clips).filter((c) => !c.disabled);
  const videoClips = activeClips.filter((c) => c.kind === 'video');
  if (videoClips.length === 0) return false;
  const nonVideoOverlay = activeClips.some((c) => c.kind !== 'video');
  if (nonVideoOverlay) return false;

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
      c.transform.x === 0 &&
      c.transform.y === 0 &&
      c.transform.opacity === 1 &&
      !c.chromaKey.enabled &&
      c.mask.shape === 'none' &&
      !c.aiMattingEnabled &&
      c.effects.length === 0 &&
      c.colorGrade.brightness === 0 &&
      c.colorGrade.contrast === 0 &&
      c.colorGrade.saturation === 0 &&
      !c.colorGrade.lutId
  );
}

/**
 * Smart Lossless Hybrid Exporter (LosslessCut stream-copy + hardware VideoToolbox fallback) + Full Compositor Exporter.
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

  const allClips = Object.values(project.clips).filter((c) => !c.disabled);

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
      .filter((c) => c.assetId && (c.kind === 'audio' || c.kind === 'video') && !c.audio.muted)
      .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

    if (audioCandidates.length === 0) {
      await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '1', options.outputPath]);
    } else {
      const first = audioCandidates[0];
      const asset = project.assets[first.assetId!];
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        (first.sourceStartUs / US_PER_SEC).toFixed(3),
        '-t',
        (first.durationUs / US_PER_SEC).toFixed(3),
        '-i',
        asset.sourcePath,
        '-vn',
        ...(options.loudnorm ? ['-af', 'loudnorm=I=-14:TP=-1.5:LRA=11'] : []),
        options.outputPath,
      ]);
    }

    return {
      outputPath: options.outputPath,
      modeUsed: 'audio-only',
      durationMs: Date.now() - t0,
      fileSizeBytes: fs.statSync(options.outputPath).size,
    };
  }

  // Smart Lossless Hybrid Fast Path (stream-copy GOP spans without re-encoding)
  if (options.mode === 'lossless-hybrid' && canUseLosslessHybrid(project)) {
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
          '-ss',
          (s.sourceStartUs / US_PER_SEC).toFixed(3),
          '-t',
          (s.durationUs / US_PER_SEC).toFixed(3),
          '-i',
          asset.sourcePath,
          '-c',
          'copy',
          '-avoid_negative_ts',
          'make_zero',
          partPath,
        ]);
        partFiles.push(partPath);
      }

      if (partFiles.length === 1) {
        fs.copyFileSync(partFiles[0], options.outputPath);
      } else {
        fs.writeFileSync(listFile, partFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
        await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', options.outputPath]);
      }

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

  // Full Hardware Compositor Pipeline (VideoToolbox + Filtergraph + Burn-in Karaoke ASS + Loudness)
  const outW = options.width ?? project.settings.width;
  const outH = options.height ?? project.settings.height;
  const outFps = options.fps ?? project.settings.fps;
  const totalDurationUs = Math.max(
    US_PER_SEC,
    allClips.reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0)
  );
  const totalSec = (totalDurationUs / US_PER_SEC).toFixed(3);

  const visualClips = allClips
    .filter((c) => (c.kind === 'video' || c.kind === 'image') && c.assetId && project.assets[c.assetId])
    .sort((a, b) => {
      const ta = project.tracks.find((t) => t.id === a.trackId)?.index ?? 0;
      const tb = project.tracks.find((t) => t.id === b.trackId)?.index ?? 0;
      return ta - tb || a.timelineStartUs - b.timelineStartUs;
    });

  const audioClips = allClips
    .filter((c) => (c.kind === 'audio' || (c.kind === 'video' && project.assets[c.assetId ?? '']?.hasAudio)) && c.assetId && !c.audio.muted)
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

    const eqParts: string[] = [];
    if (clip.colorGrade.brightness !== 0) eqParts.push(`brightness=${(clip.colorGrade.brightness * 0.5).toFixed(3)}`);
    if (clip.colorGrade.contrast !== 0) eqParts.push(`contrast=${(1 + clip.colorGrade.contrast).toFixed(3)}`);
    if (clip.colorGrade.saturation !== 0) eqParts.push(`saturation=${Math.max(0, 1 + clip.colorGrade.saturation).toFixed(3)}`);
    const eqFilter = eqParts.length > 0 ? `,eq=${eqParts.join(':')}` : '';

    const scaledW = Math.max(2, Math.round(outW * clip.transform.scaleX) & ~1);
    const scaledH = Math.max(2, Math.round(outH * clip.transform.scaleY) & ~1);
    const vPrepLabel = `[vprep_${i}]`;
    const vOutLabel = `[vout_${i}]`;

    const trimFilter =
      clip.kind === 'image'
        ? `setpts=PTS-STARTPTS+${tOffset}/TB`
        : `trim=start=${startSec}:end=${endSec},setpts=(PTS-STARTPTS)/${speedRate.toFixed(3)}+${tOffset}/TB`;

    filterChains.push(
      `[${idx}:v]${trimFilter},scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease,pad=${scaledW}:${scaledH}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=yuva420p${eqFilter}${vPrepLabel}`
    );

    const posX = `(W-w)/2+${Math.round(clip.transform.x * outW * 0.5)}`;
    const posY = `(H-h)/2+${Math.round(clip.transform.y * outH * 0.5)}`;
    const enableEnd = ((clip.timelineStartUs + clip.durationUs) / US_PER_SEC).toFixed(3);

    filterChains.push(
      `${lastVideoLabel}${vPrepLabel}overlay=x=${posX}:y=${posY}:enable='between(t,${tOffset},${enableEnd})':eof_action=pass${vOutLabel}`
    );
    lastVideoLabel = vOutLabel;
  }

  // Burn-in Text & Word-Level Karaoke Subtitles via macOS CoreText PNG Overlays
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
      const specPath = path.join(tempDir, `txt_spec_${Date.now()}_${ti}.json`);
      const pngPath = path.join(tempDir, `txt_img_${Date.now()}_${ti}.png`);
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
          activeWordIndex: t.karaokeEnabled ? 0 : null,
          activeColorHex: t.karaokeActiveColor,
        })
      );
      await execFileAsync(resolvedVision, ['render-text-png', specPath, pngPath]);

      const idx = inputIdx++;
      inputs.push('-loop', '1', '-t', totalSec, '-i', pngPath);
      const tStart = (tc.timelineStartUs / US_PER_SEC).toFixed(3);
      const tEnd = ((tc.timelineStartUs + tc.durationUs) / US_PER_SEC).toFixed(3);
      const posX = `(W-w)/2+${Math.round(tc.transform.x * outW * 0.5)}`;
      const posY = `(H-h)/2+${Math.round(tc.transform.y * outH * 0.5)}`;
      const outLbl = `[vtxt_${ti}]`;
      filterChains.push(
        `${lastVideoLabel}[${idx}:v]overlay=x=${posX}:y=${posY}:enable='between(t,${tStart},${tEnd})':eof_action=pass${outLbl}`
      );
      lastVideoLabel = outLbl;
    }
  }

  // Audio Mixing (including Denoise, Voice Presets, Fade In/Out, and Sidechain Auto-Ducking)
  const audioLabels: Array<{ label: string; isVoice: boolean; autoDuck: boolean; duckDb: number }> = [];
  for (let i = 0; i < audioClips.length; i++) {
    const clip = audioClips[i];
    const asset = project.assets[clip.assetId!]!;
    const idx = inputIdx++;
    inputs.push('-i', asset.sourcePath);
    const startSec = (clip.sourceStartUs / US_PER_SEC).toFixed(3);
    const endSec = ((clip.sourceStartUs + clip.sourceDurationUs) / US_PER_SEC).toFixed(3);
    const delayMs = Math.max(0, Math.round(clip.timelineStartUs / 1000));
    const extraFilters: string[] = [];
    if (clip.audio.denoise) extraFilters.push('afftdn=nf=-25');

    // Voice Presets
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

    if (clip.audio.fadeInUs > 0) extraFilters.push(`afade=t=in:st=0:d=${(clip.audio.fadeInUs / US_PER_SEC).toFixed(3)}`);
    if (clip.audio.fadeOutUs > 0) {
      const outStart = Math.max(0, (clip.durationUs - clip.audio.fadeOutUs) / US_PER_SEC).toFixed(3);
      extraFilters.push(`afade=t=out:st=${outStart}:d=${(clip.audio.fadeOutUs / US_PER_SEC).toFixed(3)}`);
    }
    const extraStr = extraFilters.length > 0 ? `,${extraFilters.join(',')}` : '';
    const lbl = `[aud_${i}]`;
    filterChains.push(
      `[${idx}:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS,volume=${clip.audio.volume.toFixed(2)}${extraStr},adelay=${delayMs}|${delayMs}${lbl}`
    );
    audioLabels.push({
      label: lbl,
      isVoice: clip.kind === 'video' && !clip.audio.autoDucking,
      autoDuck: clip.audio.autoDucking,
      duckDb: clip.audio.duckAmountDb || -14,
    });
  }

  let audioOutLabel = '';
  if (audioLabels.length > 0) {
    const loudPart = options.loudnorm ? ',loudnorm=I=-14:TP=-1.5:LRA=11' : '';
    const voiceTrack = audioLabels.find((a) => a.isVoice);
    const duckTracks = audioLabels.filter((a) => a.autoDuck);

    if (audioLabels.length === 1) {
      filterChains.push(`${audioLabels[0].label}apad=whole_dur=${totalSec}${loudPart}[afinal]`);
    } else if (voiceTrack && duckTracks.length > 0) {
      // Sidechain Auto-Ducking: split voice trigger to compress background music tracks
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
    '-filter_complex',
    filterChains.join(';'),
    '-map',
    lastVideoLabel,
    ...(audioOutLabel ? ['-map', audioOutLabel, '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-c:v',
    encoderName,
    ...(options.codec === 'prores' ? [] : ['-b:v', bitrate]),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-t',
    totalSec,
    options.outputPath,
  ];

  try {
    try {
      await execFileAsync('ffmpeg', args);
    } catch {
      // Fallback to libx264 if hardware encoder unavailable in headless/CI VM
      const fallbackArgs = args.map((a) => (a === encoderName ? 'libx264' : a));
      await execFileAsync('ffmpeg', fallbackArgs);
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
    '-ss',
    (clip.sourceStartUs / US_PER_SEC).toFixed(3),
    '-t',
    (clip.sourceDurationUs / US_PER_SEC).toFixed(3),
    '-i',
    asset.sourcePath,
    ...vf,
    '-c:v',
    'h264_videotoolbox',
    '-b:v',
    '6000k',
    '-an',
    outPath,
  ]).catch(async () => {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      (clip.sourceStartUs / US_PER_SEC).toFixed(3),
      '-t',
      (clip.sourceDurationUs / US_PER_SEC).toFixed(3),
      '-i',
      asset.sourcePath,
      ...vf,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-an',
      outPath,
    ]);
  });

  db.putCacheEntry(hash, 'prerender', outPath);
  return { hash, filePath: outPath, cacheHit: false };
}
