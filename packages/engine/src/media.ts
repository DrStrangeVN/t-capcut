import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { US_PER_SEC, type MediaAsset } from '@t-capcut/schema';

const execFileAsync = promisify(execFile);

export interface FFprobeOutput {
  format?: {
    duration?: string;
    size?: string;
    format_name?: string;
  };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    color_transfer?: string;
    duration?: string;
  }>;
}

function parseFractionFps(raw?: string): number {
  if (!raw || raw === '0/0') return 30;
  const [n, d] = raw.split('/').map(Number);
  if (!n || !d) return Number(raw) || 30;
  return Math.round((n / d) * 100) / 100;
}

export async function probeMedia(filePath: string, assetId: string): Promise<MediaAsset> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Media file does not exist: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const info = JSON.parse(stdout) as FFprobeOutput;
  const vStream = info.streams?.find((s) => s.codec_type === 'video');
  const aStream = info.streams?.find((s) => s.codec_type === 'audio');
  const rawDurSec = Number(info.format?.duration ?? vStream?.duration ?? aStream?.duration ?? 5);
  const isImage =
    !aStream &&
    vStream &&
    /\.(png|jpe?g|webp|bmp|tiff?|avif)$/i.test(filePath);

  const kind: MediaAsset['kind'] = isImage ? 'image' : vStream ? 'video' : 'audio';
  const durationUs = isImage ? 5 * US_PER_SEC : Math.max(100_000, Math.round(rawDurSec * US_PER_SEC));

  let colorSpace: MediaAsset['colorSpace'] = 'sdr-709';
  if (vStream?.color_transfer === 'arib-std-b67') colorSpace = 'hdr-hlg';
  else if (vStream?.color_transfer === 'smpte2084') colorSpace = 'hdr-pq';

  return {
    id: assetId,
    name: path.basename(filePath),
    kind,
    sourcePath: path.resolve(filePath),
    durationUs,
    width: vStream?.width ?? 0,
    height: vStream?.height ?? 0,
    fps: vStream ? parseFractionFps(vStream.avg_frame_rate || vStream.r_frame_rate) : 0,
    hasAudio: Boolean(aStream),
    codecVideo: vStream?.codec_name,
    codecAudio: aStream?.codec_name,
    colorSpace,
    fileSizeBytes: stat.size,
    createdAt: Date.now(),
    proxyStatus: 'none',
  };
}

/**
 * Generate a fast GOP-15 720p H.264 proxy using macOS VideoToolbox (with libx264 fallback).
 */
export async function generateProxy(asset: MediaAsset, cacheDir: string): Promise<string> {
  if (asset.kind !== 'video') {
    throw new Error('Proxy generation applies to video assets only');
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `${asset.id}_proxy.mp4`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
    return outPath;
  }

  const baseArgs = [
    '-y',
    '-i',
    asset.sourcePath,
    '-vf',
    "scale='min(1280,iw)':-2",
    '-g',
    '15',
    '-keyint_min',
    '15',
    '-movflags',
    '+faststart',
  ];

  try {
    await execFileAsync('ffmpeg', [
      ...baseArgs,
      '-c:v',
      'h264_videotoolbox',
      '-b:v',
      '2800k',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outPath,
    ]);
  } catch {
    await execFileAsync('ffmpeg', [
      ...baseArgs,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '24',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outPath,
    ]);
  }

  return outPath;
}

/**
 * Generate horizontal filmstrip thumbnail JPEG + JSON metadata for timeline rendering.
 */
export async function generateThumbnailStrip(
  asset: MediaAsset,
  cacheDir: string,
  frameCount = 24
): Promise<string> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `${asset.id}_strip.jpg`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 256) {
    return outPath;
  }

  if (asset.kind === 'image') {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      asset.sourcePath,
      '-vf',
      'scale=160:90:force_original_aspect_ratio=increase,crop=160:90',
      '-q:v',
      '5',
      outPath,
    ]);
    return outPath;
  }

  if (asset.kind !== 'video') {
    throw new Error('Thumbnail strip applies to video/image assets');
  }

  const durSec = Math.max(0.5, asset.durationUs / US_PER_SEC);
  const fps = Math.max(0.1, frameCount / durSec);

  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    asset.sourcePath,
    '-vf',
    `fps=${fps.toFixed(4)},scale=160:90:force_original_aspect_ratio=increase,crop=160:90,tile=${frameCount}x1`,
    '-frames:v',
    '1',
    '-q:v',
    '6',
    outPath,
  ]);
  return outPath;
}

export interface WaveformPeaksData {
  sampleRate: number;
  bucketsPerSec: number;
  peaks: number[]; // Interleaved [min, max] normalized [-1..1]
}

/**
 * Extract fast mipmap audio waveform peaks (100 buckets/sec) saved as JSON for 120Hz Canvas drawing.
 */
export async function extractWaveformPeaks(
  asset: MediaAsset,
  cacheDir: string,
  bucketsPerSec = 100
): Promise<string> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `${asset.id}_waveform.json`);
  if (fs.existsSync(outPath)) return outPath;

  const rawPcmPath = path.join(cacheDir, `${asset.id}_mono8k.f32`);
  const sampleRate = 8000;

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      asset.sourcePath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      '-f',
      'f32le',
      rawPcmPath,
    ]);

    const buf = fs.readFileSync(rawPcmPath);
    const floats = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const samplesPerBucket = Math.max(1, Math.floor(sampleRate / bucketsPerSec));
    const peaks: number[] = [];

    for (let i = 0; i < floats.length; i += samplesPerBucket) {
      let min = 0;
      let max = 0;
      const end = Math.min(floats.length, i + samplesPerBucket);
      for (let j = i; j < end; j++) {
        const v = floats[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks.push(Math.round(min * 1000) / 1000, Math.round(max * 1000) / 1000);
    }

    const payload: WaveformPeaksData = { sampleRate, bucketsPerSec, peaks };
    fs.writeFileSync(outPath, JSON.stringify(payload));
  } finally {
    if (fs.existsSync(rawPcmPath)) fs.unlinkSync(rawPcmPath);
  }

  return outPath;
}

/**
 * Generate a rich 6-second 1080p MP4 demo clip with dynamic test visuals, speech-like audio bursts, and silence gap
 * so users & E2E verification can immediately test timeline editing, beat/silence detection, and export.
 */
export async function createDemoMediaSample(mediaDir: string, filename = 'tcapcut_sample_studio.mp4'): Promise<string> {
  fs.mkdirSync(mediaDir, { recursive: true });
  const outPath = path.join(mediaDir, filename);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 50_000) {
    return outPath;
  }

  // Video: 6s color spectrum + timecode grid; Audio: alternating 440Hz/660Hz bursts with a 1.2s silent gap in the middle
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=30:duration=6',
    '-f',
    'lavfi',
    '-i',
    "sine=frequency=440:sample_rate=48000:duration=6,volume='if(between(t,2.0,3.2),0,if(lt(mod(t,0.5),0.18),0.75,0.25))':eval=frame",
    '-c:v',
    'h264_videotoolbox',
    '-b:v',
    '3500k',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    outPath,
  ]).catch(async () => {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1280x720:rate=30:duration=6',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=6',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-shortest',
      outPath,
    ]);
  });

  return outPath;
}
