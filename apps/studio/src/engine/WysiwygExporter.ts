import {
  US_PER_SEC,
  mapLocalTimelineToSourceUs,
  resolveEffectiveClips,
  type Clip,
  type LoadedLutTextureLike,
  type Project,
} from './wysiwyg-helpers';
import { assetMediaUrl, engineApi } from './api';
import { renderAllOverlays2D } from './OverlayRenderer';
import { WebGLCompositor, type LoadedLutTexture } from './WebGLCompositor';

function seekVideoExact(video: HTMLVideoElement, targetSec: number): Promise<void> {
  return new Promise((resolve) => {
    const clamped = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : targetSec, targetSec));
    if (Math.abs(video.currentTime - clamped) < 0.004 && video.readyState >= 2) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', onSeeked);
      clearTimeout(timer);
      resolve();
    };
    const onSeeked = () => finish();
    const timer = setTimeout(finish, 450);
    video.addEventListener('seeked', onSeeked);
    video.currentTime = clamped;
  });
}

async function loadExportMediaMaps(project: Project, clips: Clip[]) {
  const mediaMap = new Map<string, HTMLVideoElement | HTMLImageElement>();
  const maskMap = new Map<string, HTMLVideoElement>();
  await Promise.all(
    clips
      .filter((c) => c.assetId && (c.kind === 'video' || c.kind === 'image') && project.assets[c.assetId])
      .map(async (clip) => {
        const asset = project.assets[clip.assetId!]!;
        const srcUrl = assetMediaUrl(asset.id, 'source');
        if (clip.kind === 'image') {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
            img.src = srcUrl;
          });
          mediaMap.set(clip.id, img);
        } else {
          const vid = document.createElement('video');
          vid.crossOrigin = 'anonymous';
          vid.muted = true;
          vid.preload = 'auto';
          await new Promise<void>((res) => {
            vid.onloadeddata = () => res();
            vid.onerror = () => res();
            vid.src = srcUrl;
          });
          mediaMap.set(clip.id, vid);
        }
        if (clip.aiMattingEnabled && asset.mattingMaskPath) {
          const mVid = document.createElement('video');
          mVid.crossOrigin = 'anonymous';
          mVid.muted = true;
          mVid.preload = 'auto';
          await new Promise<void>((res) => {
            mVid.onloadeddata = () => res();
            mVid.onerror = () => res();
            mVid.src = assetMediaUrl(asset.id, 'mask');
          });
          maskMap.set(clip.id, mVid);
        }
      })
  );
  return { mediaMap, maskMap };
}

function disposeMediaMaps(
  compositor: WebGLCompositor,
  mediaMap: Map<string, HTMLVideoElement | HTMLImageElement>,
  maskMap: Map<string, HTMLVideoElement>
): void {
  compositor.dispose();
  mediaMap.forEach((el) => {
    if (el instanceof HTMLVideoElement) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
  });
  maskMap.forEach((el) => {
    el.pause();
    el.removeAttribute('src');
    el.load();
  });
}

export async function exportCoverFramePng(
  project: Project,
  playheadUs: number,
  loadedLuts: Record<string, LoadedLutTextureLike>
): Promise<Blob> {
  const outW = project.settings.width;
  const outH = project.settings.height;
  const flat = resolveEffectiveClips(project);
  const activeVisual = flat.filter(
    (c) => (c.kind === 'video' || c.kind === 'image') && playheadUs >= c.timelineStartUs && playheadUs < c.timelineStartUs + c.durationUs
  );

  const glCanvas = document.createElement('canvas');
  glCanvas.width = outW;
  glCanvas.height = outH;
  const compositor = new WebGLCompositor(glCanvas);
  Object.values(loadedLuts).forEach((l) => compositor.uploadLut(l as LoadedLutTexture));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;

  const { mediaMap, maskMap } = await loadExportMediaMaps(project, activeVisual);
  try {
    await Promise.all(
      activeVisual.map(async (clip) => {
        const el = mediaMap.get(clip.id);
        const localUs = playheadUs - clip.timelineStartUs;
        const targetSec = mapLocalTimelineToSourceUs(clip, localUs) / US_PER_SEC;
        if (el instanceof HTMLVideoElement) await seekVideoExact(el, targetSec);
        const mVid = maskMap.get(clip.id);
        if (mVid) await seekVideoExact(mVid, targetSec);
      })
    );
    compositor.renderFrame(project, playheadUs, mediaMap, maskMap, { forceUpload: true, skipGlow: true });
    outCtx.clearRect(0, 0, outW, outH);
    outCtx.drawImage(glCanvas, 0, 0, outW, outH);
    renderAllOverlays2D(outCtx, flat, playheadUs, outW, outH, { burnSubtitles: true });
    return await new Promise<Blob>((resolve, reject) => {
      outCanvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png');
    });
  } finally {
    disposeMediaMaps(compositor, mediaMap, maskMap);
  }
}

export async function runWysiwygClientExport(
  project: Project,
  options: {
    codec: 'h264' | 'hevc' | 'prores';
    tenBitHevc?: boolean;
    fps: number;
    burnSubtitles: boolean;
    loudnorm: boolean;
    rangeStartUs?: number | null;
    rangeEndUs?: number | null;
    loadedLuts: Record<string, LoadedLutTextureLike>;
    onJobCreated: (jobId: string) => void;
    onProgress: (pct: number, speed: string) => void;
    shouldCancel: () => boolean;
  }
): Promise<{ outputPath: string; modeUsed: string; durationMs: number; fileSizeBytes: number }> {
  const outW = project.settings.width;
  const outH = project.settings.height;
  const fps = options.fps || project.settings.fps || 30;
  const flat = resolveEffectiveClips(project);

  const hasRange =
    options.rangeStartUs != null &&
    options.rangeEndUs != null &&
    options.rangeEndUs > options.rangeStartUs + 100_000;
  const rStart = hasRange ? Math.max(0, options.rangeStartUs!) : 0;
  const rEnd = hasRange
    ? options.rangeEndUs!
    : Math.max(US_PER_SEC, flat.reduce((m, c) => Math.max(m, c.timelineStartUs + c.durationUs), 0));

  const { jobId } = await engineApi.startExport(project.id, {
    mode: 'wysiwyg-pipe',
    codec: options.codec,
    tenBitHevc: options.tenBitHevc,
    width: outW,
    height: outH,
    fps,
    burnSubtitles: options.burnSubtitles,
    loudnorm: options.loudnorm,
    rangeStartUs: hasRange ? rStart : null,
    rangeEndUs: hasRange ? rEnd : null,
  });
  options.onJobCreated(jobId);

  const glCanvas = document.createElement('canvas');
  glCanvas.width = outW;
  glCanvas.height = outH;
  const compositor = new WebGLCompositor(glCanvas);
  Object.values(options.loadedLuts).forEach((l) => compositor.uploadLut(l as LoadedLutTexture));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;
  const behindCanvas = document.createElement('canvas');
  behindCanvas.width = outW;
  behindCanvas.height = outH;
  const behindCtx = behindCanvas.getContext('2d')!;

  const { mediaMap, maskMap } = await loadExportMediaMaps(project, flat);
  const wsPipe = await engineApi.openWysiwygFramePipeSocket(jobId);

  try {
    const spanUs = Math.max(US_PER_SEC, rEnd - rStart);
    const totalFrames = Math.max(1, Math.round((spanUs / US_PER_SEC) * fps));

    for (let f = 0; f < totalFrames; f++) {
      if (options.shouldCancel()) {
        await engineApi.cancelExport(jobId).catch(() => {});
        throw new Error('Đã hủy xuất video');
      }
      const curUs = rStart + Math.round((f / fps) * US_PER_SEC);
      const activeVisual = flat.filter(
        (c) => (c.kind === 'video' || c.kind === 'image') && curUs >= c.timelineStartUs && curUs < c.timelineStartUs + c.durationUs
      );

      await Promise.all(
        activeVisual.map(async (clip) => {
          const el = mediaMap.get(clip.id);
          const localUs = curUs - clip.timelineStartUs;
          const targetSec = mapLocalTimelineToSourceUs(clip, localUs) / US_PER_SEC;
          if (el instanceof HTMLVideoElement) {
            await seekVideoExact(el, targetSec);
          }
          const mVid = maskMap.get(clip.id);
          if (mVid) {
            await seekVideoExact(mVid, targetSec);
          }
        })
      );

      const hasBehind = flat.some(
        (c) => c.kind === 'text' && c.text?.behindSubject && curUs >= c.timelineStartUs && curUs < c.timelineStartUs + c.durationUs
      );
      if (hasBehind) {
        renderAllOverlays2D(behindCtx, flat, curUs, outW, outH, {
          burnSubtitles: options.burnSubtitles,
          layerFilter: 'behind',
        });
      }

      compositor.renderFrame(project, curUs, mediaMap, maskMap, {
        forceUpload: true,
        skipGlow: true,
        behindOverlayCanvas: hasBehind ? behindCanvas : null,
      });
      outCtx.clearRect(0, 0, outW, outH);
      outCtx.drawImage(glCanvas, 0, 0, outW, outH);

      renderAllOverlays2D(outCtx, flat, curUs, outW, outH, {
        burnSubtitles: options.burnSubtitles,
        layerFilter: 'front',
        skipClear: true,
      });

      const rgba = outCtx.getImageData(0, 0, outW, outH).data;
      const u8 = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
      if (wsPipe) {
        await wsPipe.sendFrame(u8);
      } else {
        await engineApi.sendWysiwygFrame(jobId, u8);
      }
      options.onProgress(Math.min(98, Math.round(((f + 1) / totalFrames) * 100)), `Frame ${f + 1}/${totalFrames}${wsPipe ? ' ⚡WS' : ''}`);
    }

    const finished = await engineApi.finishWysiwygFrames(jobId);
    options.onProgress(100, '100%');
    return finished.result;
  } finally {
    wsPipe?.close();
    disposeMediaMaps(compositor, mediaMap, maskMap);
  }
}
