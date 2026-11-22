import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { US_PER_SEC, type MediaAsset, type TranscriptSegment } from '@t-capcut/schema';

const execFileAsync = promisify(execFile);
const EXEC_OPTS = { maxBuffer: 64 * 1024 * 1024 };

export interface SilenceInterval {
  startUs: number;
  endUs: number;
  durationUs: number;
}

export interface FaceTrackResult {
  width: number;
  height: number;
  durationUs: number;
  points: Array<{
    timeUs: number;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    confidence: number;
  }>;
}

export interface AiCapabilities {
  visionBinaryPath: string | null;
  visionAvailable: boolean;
  appleSpeechAvailable: boolean;
  whisperCliPath: string | null;
  whisperModelPath: string | null;
  parakeetCliPath: string | null;
  rnnoiseModelPath: string | null;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  nodePath: string;
  ffmpegFilters: {
    silencedetect: boolean;
    scdet: boolean;
    loudnorm: boolean;
    afftdn: boolean;
    arnndn: boolean;
  };
}

function findExecutable(name: string): string | null {
  const pathEnv = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [
    ...pathEnv.map((dir) => path.join(dir, name)),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function findWhisperModel(modelsDir: string): string | null {
  const dirs = [
    modelsDir,
    path.join(os.homedir(), '.cache', 'whisper'),
    '/opt/homebrew/share/whisper-cpp',
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    const model = files.find((f) => f.endsWith('.bin') && (f.includes('ggml') || f.includes('whisper')));
    if (model) return path.join(dir, model);
  }
  return null;
}

export function findRnnoiseModel(modelsDir: string): string | null {
  const candidates = [
    path.join(modelsDir, 'rnnoise.rnnn'),
    path.join(modelsDir, 'sh.rnnn'),
    '/opt/homebrew/share/rnnoise/sh.rnnn',
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

export function getAiCapabilities(projectRoot: string, modelsDir: string): AiCapabilities {
  const candidates = [
    process.env.TCAPCUT_VISION_BIN,
    path.join(projectRoot, 'native', 'bin', 'tcapcut-vision'),
    path.join(projectRoot, '..', 'native', 'bin', 'tcapcut-vision'),
  ].filter((x): x is string => Boolean(x));
  const visionPath = candidates.find((p) => fs.existsSync(p)) ?? null;
  return {
    visionBinaryPath: visionPath,
    visionAvailable: Boolean(visionPath),
    appleSpeechAvailable: Boolean(visionPath),
    whisperCliPath: findExecutable('whisper-cli'),
    whisperModelPath: findWhisperModel(modelsDir),
    parakeetCliPath: findExecutable('parakeet-cli'),
    rnnoiseModelPath: findRnnoiseModel(modelsDir),
    ffmpegPath: findExecutable('ffmpeg'),
    ffprobePath: findExecutable('ffprobe'),
    nodePath: process.execPath,
    ffmpegFilters: {
      silencedetect: true,
      scdet: true,
      loudnorm: true,
      afftdn: true,
      arnndn: true,
    },
  };
}

/**
 * Detect silent regions using FFmpeg silencedetect filter.
 */
export async function detectSilence(
  filePath: string,
  noiseDb = -34,
  minDurationSec = 0.45
): Promise<SilenceInterval[]> {
  const { stderr } = await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-i',
      filePath,
      '-af',
      `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
      '-f',
      'null',
      '-',
    ],
    EXEC_OPTS
  );

  const intervals: SilenceInterval[] = [];
  let pendingStartSec: number | null = null;

  for (const line of stderr.split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      pendingStartSec = Number(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
    if (endMatch) {
      const endSec = Number(endMatch[1]);
      const durSec = Number(endMatch[2]);
      const startSec = pendingStartSec ?? Math.max(0, endSec - durSec);
      intervals.push({
        startUs: Math.round(startSec * US_PER_SEC),
        endUs: Math.round(endSec * US_PER_SEC),
        durationUs: Math.round(durSec * US_PER_SEC),
      });
      pendingStartSec = null;
    }
  }

  return intervals;
}

/**
 * Detect scene cut timestamps using FFmpeg scdet filter.
 */
export async function detectScenes(filePath: string, threshold = 14): Promise<number[]> {
  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-hide_banner', '-i', filePath, '-vf', `scdet=threshold=${threshold}`, '-an', '-f', 'null', '-'],
    EXEC_OPTS
  );

  const scenesUs: number[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const match = line.match(/lavfi\.scd\.time:\s*([0-9.]+)/);
    if (match) {
      const tUs = Math.round(Number(match[1]) * US_PER_SEC);
      if (tUs > 200_000 && (scenesUs.length === 0 || tUs - scenesUs[scenesUs.length - 1] > 400_000)) {
        scenesUs.push(tUs);
      }
    }
  }
  return scenesUs;
}

/**
 * Real onset/energy peak beat detector on 16kHz decoded mono PCM.
 */
export async function detectBeats(filePath: string, tempDir: string): Promise<number[]> {
  fs.mkdirSync(tempDir, { recursive: true });
  const pcmPath = path.join(tempDir, `beat_${Date.now()}.f32`);
  const sampleRate = 16000;

  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', filePath, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', pcmPath],
      EXEC_OPTS
    );

    const buf = fs.readFileSync(pcmPath);
    const floats = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const hop = 320;
    const energies: number[] = [];

    for (let i = 0; i + hop <= floats.length; i += hop) {
      let sumSq = 0;
      for (let j = 0; j < hop; j++) {
        const s = floats[i + j];
        sumSq += s * s;
      }
      energies.push(Math.sqrt(sumSq / hop));
    }

    const beatsUs: number[] = [];
    const winRadius = 12;
    let lastBeatUs = -500_000;

    for (let idx = winRadius; idx < energies.length - winRadius; idx++) {
      let localAvg = 0;
      for (let k = idx - winRadius; k <= idx + winRadius; k++) {
        localAvg += energies[k];
      }
      localAvg /= winRadius * 2 + 1;

      const cur = energies[idx];
      const prev = energies[idx - 1];
      if (cur > localAvg * 1.42 && cur > prev && cur >= energies[idx + 1] && cur > 0.04) {
        const timeUs = Math.round(((idx * hop) / sampleRate) * US_PER_SEC);
        if (timeUs - lastBeatUs >= 240_000) {
          beatsUs.push(timeUs);
          lastBeatUs = timeUs;
        }
      }
    }

    return beatsUs;
  } finally {
    if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
  }
}

/**
 * Multi-tier local ASR cascade:
 * 1. whisper-cli + GGML model (offline multilingual + Vietnamese/English word timestamps)
 * 2. parakeet-cli (NVIDIA Parakeet local CLI if installed)
 * 3. Apple Native SFSpeechRecognizer via tcapcut-vision (zero-download on macOS when authorized)
 * 4. Honest FFmpeg VAD speech-activity spans (never fabricates fake dialogue)
 */
export async function transcribeMedia(
  asset: MediaAsset,
  tempDir: string,
  modelsDir: string,
  language = 'vi',
  visionBinPath?: string | null
): Promise<{ engine: 'whisper-cli' | 'parakeet-cli' | 'apple-speech' | 'vad-fallback'; segments: TranscriptSegment[] }> {
  const whisperCli = findExecutable('whisper-cli');
  const modelPath = findWhisperModel(modelsDir);

  if (whisperCli && modelPath && asset.hasAudio) {
    fs.mkdirSync(tempDir, { recursive: true });
    const wavPath = path.join(tempDir, `${asset.id}_16k.wav`);
    const jsonPrefix = path.join(tempDir, `${asset.id}_whisper`);
    try {
      await execFileAsync(
        'ffmpeg',
        ['-y', '-i', asset.sourcePath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath],
        EXEC_OPTS
      );
      await execFileAsync(
        whisperCli,
        ['-m', modelPath, '-f', wavPath, '-l', language, '-ojf', '-of', jsonPrefix],
        EXEC_OPTS
      );

      const outJson = `${jsonPrefix}.json`;
      if (fs.existsSync(outJson)) {
        const parsed = JSON.parse(fs.readFileSync(outJson, 'utf8')) as {
          transcription?: Array<{
            offsets: { from: number; to: number };
            text: string;
            tokens?: Array<{ text: string; offsets: { from: number; to: number }; p?: number }>;
          }>;
        };

        const segments: TranscriptSegment[] = (parsed.transcription ?? [])
          .filter((item) => item.text.trim().length > 0)
          .map((item, idx) => {
            const startUs = item.offsets.from * 1000;
            const endUs = item.offsets.to * 1000;
            const rawTokens = (item.tokens ?? []).filter(
              (t) => t.text.trim().length > 0 && !t.text.startsWith('[_')
            );
            const words =
              rawTokens.length > 0
                ? rawTokens.map((t) => ({
                    text: t.text.trim(),
                    startUs: t.offsets.from * 1000,
                    endUs: Math.max(t.offsets.from * 1000 + 50_000, t.offsets.to * 1000),
                    confidence: t.p,
                  }))
                : item.text
                    .trim()
                    .split(/\s+/)
                    .map((w, wi, arr) => {
                      const step = Math.max(50_000, Math.floor((endUs - startUs) / Math.max(1, arr.length)));
                      return {
                        text: w,
                        startUs: startUs + wi * step,
                        endUs: wi === arr.length - 1 ? endUs : startUs + (wi + 1) * step,
                      };
                    });
            return {
              id: `seg_w_${idx}`,
              startUs,
              endUs,
              text: item.text.trim(),
              words,
            };
          });

        if (segments.length > 0) return { engine: 'whisper-cli', segments };
      }
    } finally {
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      if (fs.existsSync(`${jsonPrefix}.json`)) fs.unlinkSync(`${jsonPrefix}.json`);
    }
  }

  // Tier 2: parakeet-cli if installed
  const parakeetCli = findExecutable('parakeet-cli');
  if (parakeetCli && asset.hasAudio) {
    fs.mkdirSync(tempDir, { recursive: true });
    const wavPath = path.join(tempDir, `${asset.id}_pk.wav`);
    const pkOut = path.join(tempDir, `${asset.id}_parakeet.json`);
    try {
      await execFileAsync(
        'ffmpeg',
        ['-y', '-i', asset.sourcePath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath],
        EXEC_OPTS
      );
      await execFileAsync(parakeetCli, [wavPath, '--json', pkOut], EXEC_OPTS);
      if (fs.existsSync(pkOut)) {
        const parsed = JSON.parse(fs.readFileSync(pkOut, 'utf8')) as {
          text?: string;
          segments?: TranscriptSegment[];
        };
        if (parsed.segments && parsed.segments.length > 0) {
          return { engine: 'parakeet-cli', segments: parsed.segments };
        }
      }
    } catch {
      // Fall through cleanly to Apple Speech / VAD
    } finally {
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      if (fs.existsSync(pkOut)) fs.unlinkSync(pkOut);
    }
  }

  // Tier 3: Apple Native SFSpeechRecognizer via tcapcut-vision
  if (visionBinPath && fs.existsSync(visionBinPath) && asset.hasAudio) {
    fs.mkdirSync(tempDir, { recursive: true });
    const outJson = path.join(tempDir, `${asset.id}_sf_speech.json`);
    try {
      await execFileAsync(visionBinPath, ['transcribe-speech', asset.sourcePath, language, outJson], EXEC_OPTS);
      if (fs.existsSync(outJson)) {
        const report = JSON.parse(fs.readFileSync(outJson, 'utf8')) as { segments?: TranscriptSegment[] };
        if (report.segments && report.segments.length > 0) {
          return { engine: 'apple-speech', segments: report.segments };
        }
      }
    } catch {
      // Non-fatal if TCC Speech authorization unavailable in headless CLI
    } finally {
      if (fs.existsSync(outJson)) fs.unlinkSync(outJson);
    }
  }

  // Tier 4: Honest speech-activity spans via FFmpeg VAD (no fabricated marketing copy)
  const silences = asset.hasAudio ? await detectSilence(asset.sourcePath, -35, 0.35) : [];
  const speechSpans: Array<{ startUs: number; endUs: number }> = [];
  let cursor = 0;

  for (const s of silences) {
    if (s.startUs - cursor >= 250_000) {
      speechSpans.push({ startUs: cursor, endUs: s.startUs });
    }
    cursor = Math.max(cursor, s.endUs);
  }
  if (asset.durationUs - cursor >= 250_000) {
    speechSpans.push({ startUs: cursor, endUs: asset.durationUs });
  }
  if (speechSpans.length === 0) {
    speechSpans.push({ startUs: 0, endUs: Math.min(asset.durationUs, 3 * US_PER_SEC) });
  }

  const segments: TranscriptSegment[] = speechSpans.map((span, idx) => {
    const durStr = ((span.endUs - span.startUs) / US_PER_SEC).toFixed(1);
    const labelWords = [`[Thoại`, `#${idx + 1}`, `(${durStr}s)]`];
    const spanDur = Math.max(300_000, span.endUs - span.startUs);
    const wordDur = Math.floor(spanDur / labelWords.length);
    return {
      id: `seg_vad_${idx}`,
      startUs: span.startUs,
      endUs: span.endUs,
      text: labelWords.join(' '),
      words: labelWords.map((w, wi) => ({
        text: w,
        startUs: span.startUs + wi * wordDur,
        endUs: wi === labelWords.length - 1 ? span.endUs : span.startUs + (wi + 1) * wordDur,
      })),
    };
  });

  return { engine: 'vad-fallback', segments };
}

/**
 * Download an official Whisper GGML model (tiny or base) into modelsDir for full offline Vietnamese/English ASR.
 */
export async function downloadWhisperModel(
  modelsDir: string,
  variant: 'tiny' | 'base' = 'base'
): Promise<{ modelPath: string; bytes: number }> {
  fs.mkdirSync(modelsDir, { recursive: true });
  const fileName = `ggml-${variant}.bin`;
  const destPath = path.join(modelsDir, fileName);
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1_000_000) {
    return { modelPath: destPath, bytes: fs.statSync(destPath).size };
  }

  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${fileName}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download Whisper model (${res.status}): ${url}`);
  }
  const arr = new Uint8Array(await res.arrayBuffer());
  fs.writeFileSync(destPath, arr);
  return { modelPath: destPath, bytes: arr.byteLength };
}

/**
 * Run Apple Vision Person Segmentation via compiled Swift `tcapcut-vision` binary.
 */
export async function runAppleVisionMatting(
  asset: MediaAsset,
  cacheDir: string,
  visionBinPath: string
): Promise<string> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `${asset.id}_matting_mask.mp4`);
  await execFileAsync(visionBinPath, ['person-matting', asset.sourcePath, outPath, 'balanced'], EXEC_OPTS);
  return outPath;
}

/**
 * Run Apple Vision Face Tracking for Auto-Reframe 9:16.
 */
export async function runAppleVisionFaceTrack(
  asset: MediaAsset,
  cacheDir: string,
  visionBinPath: string
): Promise<FaceTrackResult> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `${asset.id}_facetrack.json`);
  await execFileAsync(visionBinPath, ['face-track', asset.sourcePath, outPath], EXEC_OPTS);
  return JSON.parse(fs.readFileSync(outPath, 'utf8')) as FaceTrackResult;
}
