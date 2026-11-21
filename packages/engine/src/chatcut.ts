import {
  ASPECT_RATIO_DIMENSIONS,
  US_PER_SEC,
  createDefaultAudioState,
  createDefaultChromaKey,
  createDefaultColorGrade,
  createDefaultMask,
  createDefaultSpeed,
  createDefaultTextStyle,
  createDefaultTransform,
  type ChatCutDiffOp,
  type ChatCutPlan,
  type Clip,
  type Project,
} from '@t-capcut/schema';
import { detectBeats, detectScenes, detectSilence, transcribeMedia } from './ai.js';

function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project;
}

export async function buildChatCutPlan(
  project: Project,
  prompt: string,
  tempDir: string,
  modelsDir: string
): Promise<ChatCutPlan> {
  const q = prompt.toLowerCase();
  const ops: ChatCutDiffOp[] = [];
  const mainTrack = project.tracks.find((t) => t.isMain) ?? project.tracks[0];
  const mainClips = Object.values(project.clips)
    .filter((c) => c.trackId === mainTrack?.id && !c.disabled)
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);
  const firstClip = mainClips[0];
  const firstAsset = firstClip?.assetId ? project.assets[firstClip.assetId] : Object.values(project.assets)[0];

  // 1. Aspect Ratio / Vertical TikTok 9:16
  if (/9:16|tiktok|reels|shorts|dọc/.test(q)) {
    ops.push({
      op: 'set_aspect',
      description: 'Chuyển khung hình dự án sang 9:16 (1080×1920) cho TikTok/Reels/Shorts',
      payload: { aspectRatio: '9:16' },
    });
  } else if (/16:9|youtube|ngang/.test(q)) {
    ops.push({
      op: 'set_aspect',
      description: 'Chuyển khung hình dự án sang 16:9 (1920×1080)',
      payload: { aspectRatio: '16:9' },
    });
  } else if (/1:1|vuông/.test(q)) {
    ops.push({
      op: 'set_aspect',
      description: 'Chuyển khung hình dự án sang 1:1 (1080×1080)',
      payload: { aspectRatio: '1:1' },
    });
  }

  // 2. Remove Silence
  if (/lặng|silence|khoảng trống|ậm ừ|pause/.test(q) && firstClip && firstAsset?.hasAudio) {
    const silences = await detectSilence(firstAsset.sourcePath, -34, 0.4);
    for (const s of silences) {
      if (s.startUs >= firstClip.sourceStartUs && s.endUs <= firstClip.sourceStartUs + firstClip.sourceDurationUs) {
        const timelineAt = firstClip.timelineStartUs + (s.startUs - firstClip.sourceStartUs);
        ops.push({
          op: 'delete',
          description: `Cắt bỏ khoảng lặng ${(s.durationUs / US_PER_SEC).toFixed(2)}s tại ${(timelineAt / US_PER_SEC).toFixed(2)}s`,
          targetClipId: firstClip.id,
          timeUs: timelineAt,
          durationUs: s.durationUs,
        });
      }
    }
  }

  // 3. Auto Scene Split
  if (/cảnh|scene|tách cảnh/.test(q) && firstClip && firstAsset?.kind === 'video') {
    const scenes = firstAsset.scenesUs ?? (await detectScenes(firstAsset.sourcePath));
    for (const scUs of scenes) {
      if (scUs > firstClip.sourceStartUs + 200_000 && scUs < firstClip.sourceStartUs + firstClip.sourceDurationUs - 200_000) {
        ops.push({
          op: 'split',
          description: `Tách cảnh tự động tại ${(scUs / US_PER_SEC).toFixed(2)}s`,
          targetClipId: firstClip.id,
          timeUs: firstClip.timelineStartUs + (scUs - firstClip.sourceStartUs),
        });
      }
    }
  }

  // 4. Beat Markers
  if (/nhịp|beat|marker/.test(q) && firstAsset?.hasAudio) {
    const beats = firstAsset.beatsUs ?? (await detectBeats(firstAsset.sourcePath, tempDir));
    beats.slice(0, 12).forEach((bUs, idx) => {
      ops.push({
        op: 'add_marker',
        description: `Gắn Beat Marker #${idx + 1} tại ${(bUs / US_PER_SEC).toFixed(2)}s`,
        timeUs: bUs,
        payload: { label: `Beat ${idx + 1}`, color: '#FFD60A', kind: 'beat' },
      });
    });
  }

  // 5. Auto Karaoke Captions
  if (/phụ đề|caption|subtitle|karaoke|chữ/.test(q) && firstAsset) {
    const tx = firstAsset.transcript
      ? { segments: firstAsset.transcript }
      : await transcribeMedia(firstAsset, tempDir, modelsDir, 'vi');
    for (const seg of tx.segments) {
      ops.push({
        op: 'add_caption',
        description: `Thêm phụ đề Karaoke: "${seg.text}" (${(seg.startUs / US_PER_SEC).toFixed(2)}s)`,
        timeUs: seg.startUs,
        durationUs: Math.max(400_000, seg.endUs - seg.startUs),
        payload: {
          text: seg.text,
          words: seg.words,
          karaokeEnabled: true,
          karaokeActiveColor: /xanh|cyan/.test(q) ? '#00F5D4' : '#FFD60A',
        },
      });
    }
  }

  // 6. Color Grading
  if (/màu|color|cinematic|ấm|warm|lạnh|vintage|nét/.test(q) && firstClip) {
    const isWarm = /ấm|warm|cinematic/.test(q);
    ops.push({
      op: 'apply_color',
      description: isWarm
        ? 'Áp dụng preset màu Cinematic Warm (Contrast +0.18, Temp +0.22, Vignette 0.28)'
        : 'Tăng độ rực & tương phản màu sắc cho clip chính',
      targetClipId: firstClip.id,
      payload: {
        contrast: 0.18,
        saturation: 0.14,
        temperature: isWarm ? 0.22 : -0.1,
        vignette: 0.28,
        sharpness: 0.2,
      },
    });
  }

  // 7. Zoom / Transform
  if (/zoom|phóng/.test(q) && firstClip) {
    const match = q.match(/([12]\.\d+)/);
    const scale = match ? Number(match[1]) : 1.15;
    ops.push({
      op: 'apply_transform',
      description: `Thêm hiệu ứng Zoom ${scale}x mượt mà cho clip chính`,
      targetClipId: firstClip.id,
      payload: { scaleX: scale, scaleY: scale },
    });
  }

  if (ops.length === 0) {
    ops.push({
      op: 'apply_color',
      description: 'Tối ưu ánh sáng nhẹ (+0.08 Contrast, +0.06 Vibrance) cho clip hiện tại',
      targetClipId: firstClip?.id,
      payload: { contrast: 0.08, vibrance: 0.06 },
    });
  }

  return {
    id: `plan_${Date.now()}`,
    prompt,
    summary: `T-ChatCut đã lập kế hoạch ${ops.length} thao tác chỉnh sửa trực tiếp trên Timeline.`,
    ops,
    estimatedTimeSavedSec: ops.length * 12,
  };
}

export function applyChatCutPlan(project: Project, plan: ChatCutPlan): Project {
  const next = cloneProject(project);

  // Process delete-silence regions via range subtraction on target clip
  const deleteOps = plan.ops
    .filter((o) => o.op === 'delete' && o.targetClipId && o.timeUs !== undefined && o.durationUs)
    .sort((a, b) => (b.timeUs ?? 0) - (a.timeUs ?? 0));

  for (const d of deleteOps) {
    const clip = next.clips[d.targetClipId!];
    if (!clip) continue;
    const cutStart = d.timeUs!;
    const cutEnd = cutStart + d.durationUs!;
    if (cutStart <= clip.timelineStartUs || cutEnd >= clip.timelineStartUs + clip.durationUs) continue;

    const leftDur = cutStart - clip.timelineStartUs;
    const rightSourceOffset = cutEnd - clip.timelineStartUs;
    const rightDur = clip.durationUs - rightSourceOffset;
    if (rightDur <= 100_000) {
      clip.durationUs = leftDur;
      clip.sourceDurationUs = leftDur;
      continue;
    }

    // Create right segment closed tightly (magnetic ripple!)
    const rightClip: Clip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: `${clip.id}_r_${Math.random().toString(36).slice(2, 6)}`,
      timelineStartUs: cutStart,
      durationUs: rightDur,
      sourceStartUs: clip.sourceStartUs + rightSourceOffset,
      sourceDurationUs: rightDur,
    };
    clip.durationUs = leftDur;
    clip.sourceDurationUs = leftDur;
    next.clips[rightClip.id] = rightClip;
  }

  // Process splits
  const splitOps = plan.ops
    .filter((o) => o.op === 'split' && o.targetClipId && o.timeUs !== undefined)
    .sort((a, b) => (b.timeUs ?? 0) - (a.timeUs ?? 0));

  for (const sp of splitOps) {
    const clip = next.clips[sp.targetClipId!];
    if (!clip) continue;
    const splitAt = sp.timeUs!;
    if (splitAt <= clip.timelineStartUs + 100_000 || splitAt >= clip.timelineStartUs + clip.durationUs - 100_000) continue;

    const leftDur = splitAt - clip.timelineStartUs;
    const rightDur = clip.durationUs - leftDur;
    const rightClip: Clip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: `${clip.id}_sp_${Math.random().toString(36).slice(2, 6)}`,
      timelineStartUs: splitAt,
      durationUs: rightDur,
      sourceStartUs: clip.sourceStartUs + leftDur,
      sourceDurationUs: rightDur,
    };
    clip.durationUs = leftDur;
    clip.sourceDurationUs = leftDur;
    next.clips[rightClip.id] = rightClip;
  }

  const textTrack = next.tracks.find((t) => t.type === 'text') ?? next.tracks[0];

  for (const op of plan.ops) {
    if (op.op === 'set_aspect' && op.payload?.aspectRatio) {
      const ratio = op.payload.aspectRatio as keyof typeof ASPECT_RATIO_DIMENSIONS;
      if (ASPECT_RATIO_DIMENSIONS[ratio]) {
        next.settings.aspectRatio = ratio;
        next.settings.width = ASPECT_RATIO_DIMENSIONS[ratio].width;
        next.settings.height = ASPECT_RATIO_DIMENSIONS[ratio].height;
      }
    } else if (op.op === 'add_marker' && op.timeUs !== undefined) {
      next.markers.push({
        id: `mk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timeUs: op.timeUs,
        label: String(op.payload?.label ?? 'Marker'),
        color: String(op.payload?.color ?? '#FFD60A'),
        kind: (op.payload?.kind as 'beat' | 'user' | 'scene' | 'silence') ?? 'user',
      });
    } else if (op.op === 'add_caption' && op.timeUs !== undefined && op.durationUs && textTrack) {
      const id = `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const textStr = String(op.payload?.text ?? 'Caption');
      const style = createDefaultTextStyle(textStr);
      style.karaokeEnabled = Boolean(op.payload?.karaokeEnabled ?? true);
      style.karaokeActiveColor = String(op.payload?.karaokeActiveColor ?? '#FFD60A');
      style.words = op.payload?.words as typeof style.words;
      next.clips[id] = {
        id,
        trackId: textTrack.id,
        assetId: null,
        kind: 'text',
        name: textStr.slice(0, 28),
        timelineStartUs: op.timeUs,
        durationUs: op.durationUs,
        sourceStartUs: 0,
        sourceDurationUs: op.durationUs,
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
    } else if (op.op === 'apply_color' && op.targetClipId && next.clips[op.targetClipId]) {
      Object.assign(next.clips[op.targetClipId].colorGrade, op.payload ?? {});
    } else if (op.op === 'apply_transform' && op.targetClipId && next.clips[op.targetClipId]) {
      Object.assign(next.clips[op.targetClipId].transform, op.payload ?? {});
    }
  }

  return next;
}
