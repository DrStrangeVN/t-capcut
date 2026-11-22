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

/**
 * Click-to-Segment Object Matting via Apple Vision VNGenerateForegroundInstanceMaskRequest.
 */
export async function runAppleVisionObjectMatting(
  asset: MediaAsset,
  cacheDir: string,
  visionBinPath: string,
  normX = 0.5,
  normY = 0.5
): Promise<string> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `${asset.id}_obj_mask_${Date.now()}.mp4`);
  await execFileAsync(
    visionBinPath,
    ['object-matting', asset.sourcePath, outPath, normX.toFixed(4), normY.toFixed(4)],
    EXEC_OPTS
  );
  return outPath;
}

/**
 * Lists installed macOS system fonts cleanly via compiled helper.
 */
export async function listSystemFonts(visionBinPath: string | null): Promise<string[]> {
  if (!visionBinPath || !fs.existsSync(visionBinPath)) {
    return ['Inter', 'SF Pro Display', 'Helvetica Neue', 'Avenir Next', 'Georgia', 'Menlo'];
  }
  try {
    const { stdout } = await execFileAsync(visionBinPath, ['fonts'], EXEC_OPTS);
    const parsed = JSON.parse(stdout) as { fonts?: string[] };
    return (parsed.fonts ?? []).filter((f) => Boolean(f && f.trim()));
  } catch {
    return ['Inter', 'SF Pro Display', 'Helvetica Neue', 'Avenir Next', 'Georgia', 'Menlo'];
  }
}

/**
 * Offline macOS Neural/Speech TTS Voiceover (.m4a) + word-synced TranscriptSegment.
 */
export async function generateLocalTtsVoiceover(
  text: string,
  language: 'vi' | 'en',
  outDir: string,
  voiceName?: string
): Promise<{ audioPath: string; durationUs: number; segment: TranscriptSegment }> {
  fs.mkdirSync(outDir, { recursive: true });
  const id = `tts_${Date.now()}`;
  const aiffPath = path.join(outDir, `${id}.aiff`);
  const m4aPath = path.join(outDir, `${id}.m4a`);
  const resolvedVoice = voiceName || (language === 'vi' ? 'Linh' : 'Samantha');

  try {
    await execFileAsync('say', ['-v', resolvedVoice, '-o', aiffPath, text], EXEC_OPTS);
  } catch {
    // Fallback default voice if requested voice is unavailable
    await execFileAsync('say', ['-o', aiffPath, text], EXEC_OPTS);
  }

  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', aiffPath, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', m4aPath],
      EXEC_OPTS
    );
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', m4aPath],
      EXEC_OPTS
    );
    const durSec = Math.max(0.4, Number.parseFloat(stdout.trim()) || 1.5);
    const durationUs = Math.round(durSec * US_PER_SEC);
    const rawWords = text.trim().split(/\s+/).filter(Boolean);
    const perWordUs = Math.max(60_000, Math.floor(durationUs / Math.max(1, rawWords.length)));
    const segment: TranscriptSegment = {
      id: `seg_${id}`,
      startUs: 0,
      endUs: durationUs,
      text: text.trim(),
      words: rawWords.map((w, idx) => ({
        text: w,
        startUs: idx * perWordUs,
        endUs: idx === rawWords.length - 1 ? durationUs : (idx + 1) * perWordUs,
      })),
    };
    return { audioPath: m4aPath, durationUs, segment };
  } finally {
    if (fs.existsSync(aiffPath)) fs.unlinkSync(aiffPath);
  }
}

export interface ViralHighlight {
  id: string;
  startUs: number;
  endUs: number;
  score: number;
  title: string;
}

/**
 * AI Auto-Highlight Extractor: scores audio energy + scene activity + speech hook phrases to locate Viral Shorts.
 */
export async function detectViralHighlights(
  asset: MediaAsset,
  tempDir: string
): Promise<ViralHighlight[]> {
  const totalUs = Math.max(US_PER_SEC, asset.durationUs);
  const clipLenUs = Math.min(totalUs, Math.max(3 * US_PER_SEC, Math.min(12 * US_PER_SEC, Math.round(totalUs * 0.45))));
  const scenes = asset.kind === 'video' ? asset.scenesUs ?? (await detectScenes(asset.sourcePath).catch(() => [])) : [];
  const beats = asset.hasAudio ? asset.beatsUs ?? (await detectBeats(asset.sourcePath, tempDir).catch(() => [])) : [];

  const candidateStarts = new Set<number>([0]);
  scenes.forEach((s) => candidateStarts.add(Math.max(0, Math.min(totalUs - clipLenUs, s))));
  beats.slice(0, 12).forEach((b) => candidateStarts.add(Math.max(0, Math.min(totalUs - clipLenUs, b))));
  if (totalUs > clipLenUs * 1.5) {
    candidateStarts.add(Math.round(totalUs * 0.25));
    candidateStarts.add(Math.round(totalUs * 0.55));
  }

  const hookWords = /bí quyết|quan trọng|lưu ý|đừng|ngay|top|siêu|hack|bùng nổ|secret|best|tip|how|why/i;
  const scored: ViralHighlight[] = [];

  Array.from(candidateStarts).forEach((startUs, idx) => {
    const endUs = Math.min(totalUs, startUs + clipLenUs);
    const spanScenes = scenes.filter((s) => s >= startUs && s <= endUs).length;
    const spanBeats = beats.filter((b) => b >= startUs && b <= endUs).length;
    const spanTx = (asset.transcript ?? []).filter((t) => t.startUs >= startUs && t.startUs <= endUs);
    const hasHook = spanTx.some((t) => hookWords.test(t.text));
    const score = Math.min(99, 62 + spanScenes * 6 + Math.min(18, spanBeats * 2) + (hasHook ? 15 : 0) + (idx === 0 ? 5 : 0));
    const title = spanTx[0]?.text.slice(0, 38) || `Highlight #${idx + 1} (${(startUs / US_PER_SEC).toFixed(1)}s)`;
    scored.push({
      id: `hl_${idx}_${startUs}`,
      startUs,
      endUs,
      score,
      title,
    });
  });

  scored.sort((a, b) => b.score - a.score);
  const picked: ViralHighlight[] = [];
  for (const cand of scored) {
    if (picked.every((p) => cand.endUs <= p.startUs + 500_000 || cand.startUs >= p.endUs - 500_000)) {
      picked.push(cand);
      if (picked.length >= 4) break;
    }
  }
  return picked.length > 0 ? picked : scored.slice(0, 3);
}

const FILLER_REGEX = /^(ờ+|à+|ừm+|um+|uh+|er+|hmm+|kiểu như|thì là)[.,!?]*$/i;

export function findFillerWordSpans(segments: TranscriptSegment[]): Array<{ startUs: number; endUs: number; word: string }> {
  const spans: Array<{ startUs: number; endUs: number; word: string }> = [];
  for (const seg of segments) {
    for (const w of seg.words ?? []) {
      if (FILLER_REGEX.test(w.text.trim())) {
        spans.push({
          startUs: Math.max(0, w.startUs - 30_000),
          endUs: w.endUs + 30_000,
          word: w.text,
        });
      }
    }
  }
  return spans;
}

export async function stabilizeVideoFfmpeg(asset: MediaAsset, cacheDir: string): Promise<string> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `${asset.id}_stabilized.mp4`);
  if (fs.existsSync(outPath)) return outPath;
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', asset.sourcePath,
      '-vf', 'deshake=rx=16:ry=16:edge=mirror,unsharp=3:3:0.3',
      '-c:v', 'h264_videotoolbox',
      '-b:v', '10000k',
      '-c:a', 'copy',
      outPath,
    ],
    EXEC_OPTS
  );
  return outPath;
}

export async function upscaleVideoFfmpeg(asset: MediaAsset, cacheDir: string): Promise<string> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, `${asset.id}_2x_upscale.mp4`);
  if (fs.existsSync(outPath)) return outPath;
  const targetW = Math.min(3840, (asset.width || 1280) * 2) & ~1;
  const targetH = Math.min(2160, (asset.height || 720) * 2) & ~1;
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', asset.sourcePath,
      '-vf', `scale=${targetW}:${targetH}:flags=lanczos,unsharp=5:5:0.75:5:5:0.0`,
      '-c:v', 'h264_videotoolbox',
      '-b:v', '18000k',
      '-c:a', 'copy',
      outPath,
    ],
    EXEC_OPTS
  );
  return outPath;
}

export async function separateAudioStems(
  asset: MediaAsset,
  mediaDir: string
): Promise<{ vocalsPath: string; instrumentalPath: string }> {
  fs.mkdirSync(mediaDir, { recursive: true });
  const vocalsPath = path.join(mediaDir, `${asset.id}_vocals.m4a`);
  const instrumentalPath = path.join(mediaDir, `${asset.id}_instrumental.m4a`);

  // Center-extracted vocal bus (bandpass + mid sum) & Side-subtracted instrumental bus
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', asset.sourcePath,
      '-vn',
      '-af', 'aformat=channel_layouts=stereo,pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,highpass=f=180,lowpass=f=6500',
      '-c:a', 'aac',
      '-b:a', '192k',
      vocalsPath,
    ],
    EXEC_OPTS
  );

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', asset.sourcePath,
      '-vn',
      '-af', 'aformat=channel_layouts=stereo,pan=stereo|c0=0.7*c0-0.7*c1|c1=0.7*c1-0.7*c0',
      '-c:a', 'aac',
      '-b:a', '192k',
      instrumentalPath,
    ],
    EXEC_OPTS
  );
  return { vocalsPath, instrumentalPath };
}

/**
 * Smart Music Remix: loops middle body cleanly and crossfades to natural Outro so music fits targetDurationUs.
 */
export async function smartRemixAudio(
  inputPath: string,
  sourceDurationUs: number,
  targetDurationUs: number,
  outroStartUs: number | undefined,
  outPath: string
): Promise<void> {
  const targetSec = Math.max(1.5, targetDurationUs / US_PER_SEC);
  const srcSec = Math.max(1.5, sourceDurationUs / US_PER_SEC);
  const outroDurSec = outroStartUs ? Math.max(1.2, Math.min(4.0, srcSec - outroStartUs / US_PER_SEC)) : Math.min(2.5, srcSec * 0.18);

  if (targetSec <= srcSec) {
    // Trim body cleanly and attach natural outro with 0.35s crossfade
    const bodyEndSec = Math.max(0.5, targetSec - outroDurSec + 0.35);
    const outroStartSec = Math.max(0, srcSec - outroDurSec);
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i', inputPath,
        '-filter_complex',
        `[0:a]atrim=start=0:end=${bodyEndSec.toFixed(3)},asetpts=PTS-STARTPTS[b];[0:a]atrim=start=${outroStartSec.toFixed(3)}:end=${srcSec.toFixed(3)},asetpts=PTS-STARTPTS[o];[b][o]acrossfade=d=0.35:c1=tri:c2=tri,atrim=0:${targetSec.toFixed(3)}[out]`,
        '-map', '[out]',
        '-c:a', 'aac',
        '-b:a', '192k',
        outPath,
      ],
      EXEC_OPTS
    );
    return;
  }

  // Video longer than track: loop body and stitch outro at tail
  const bodyEndSec = Math.max(2, srcSec - outroDurSec);
  const loopNeedSec = Math.max(1, targetSec - outroDurSec + 0.35);
  const outroStartSec = Math.max(0, srcSec - outroDurSec);
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-stream_loop', '-1', '-i', inputPath,
      '-i', inputPath,
      '-filter_complex',
      `[0:a]atrim=start=0:end=${loopNeedSec.toFixed(3)},asetpts=PTS-STARTPTS[b];[1:a]atrim=start=${outroStartSec.toFixed(3)}:end=${srcSec.toFixed(3)},asetpts=PTS-STARTPTS[o];[b][o]acrossfade=d=0.35:c1=tri:c2=tri,atrim=0:${targetSec.toFixed(3)}[out]`,
      '-map', '[out]',
      '-c:a', 'aac',
      '-b:a', '192k',
      outPath,
    ],
    EXEC_OPTS
  );
  void bodyEndSec;
}

export interface LocalCapCutDraftSummary {
  name: string;
  draftPath: string;
  modifiedAt: number;
  source: 'CapCut' | 'JianYing' | 'Custom';
  clipCount?: number;
}

export function scanLocalCapCutDrafts(customDir?: string): LocalCapCutDraftSummary[] {
  const home = path.resolve(os.homedir());
  const candidates: Array<{ dir: string; source: LocalCapCutDraftSummary['source'] }> = [
    { dir: path.join(home, 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'), source: 'CapCut' },
    { dir: path.join(home, 'Library', 'Containers', 'com.lemon.lvoverseas', 'Data', 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'), source: 'CapCut' },
    { dir: path.join(home, 'Movies', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'), source: 'JianYing' },
    { dir: path.join(home, 'Library', 'Containers', 'com.lemon.lvpro', 'Data', 'Movies', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'), source: 'JianYing' },
  ];

  if (customDir && customDir.trim()) {
    const resolvedCustom = path.resolve(customDir.trim().replace(/^~(?=\/|$)/, home));
    if (resolvedCustom === home || resolvedCustom.startsWith(home + path.sep)) {
      candidates.unshift({ dir: resolvedCustom, source: 'Custom' });
    }
  }

  const seenPaths = new Set<string>();
  const results: LocalCapCutDraftSummary[] = [];

  for (const { dir, source } of candidates) {
    if (!fs.existsSync(dir)) continue;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const folder = path.join(dir, entry);
      let draftJson = path.join(folder, 'draft_content.json');
      if (!fs.existsSync(draftJson)) {
        draftJson = path.join(folder, 'draft_info.json');
      }
      if (!fs.existsSync(draftJson) || seenPaths.has(draftJson)) continue;
      seenPaths.add(draftJson);
      try {
        const st = fs.statSync(draftJson);
        let clipCount: number | undefined;
        if (st.size < 2_500_000) {
          try {
            const raw = JSON.parse(fs.readFileSync(draftJson, 'utf8')) as { tracks?: Array<{ segments?: unknown[] }> };
            clipCount = (raw.tracks ?? []).reduce((sum, t) => sum + (Array.isArray(t.segments) ? t.segments.length : 0), 0);
          } catch {
            // ignore preview count failure
          }
        }
        results.push({ name: entry, draftPath: draftJson, modifiedAt: st.mtimeMs, source, clipCount });
      } catch {
        // skip unreadable entry
      }
    }
  }
  results.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return results;
}
