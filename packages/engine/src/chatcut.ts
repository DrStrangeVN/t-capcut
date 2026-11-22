import {
  ASPECT_RATIO_DIMENSIONS,
  US_PER_SEC,
  computeDurationFromSpeed,
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

export interface ChatCutLlmConfig {
  provider: 'ollama' | 'openai' | 'gemini';
  endpoint?: string;
  model?: string;
  apiKey?: string;
}

export interface BuildChatCutOptions {
  selectedClipId?: string | null;
  visionBinPath?: string | null;
  llmConfig?: ChatCutLlmConfig | null;
}

function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project;
}

const VALID_OPS = new Set<ChatCutDiffOp['op']>([
  'split',
  'delete',
  'trim',
  'add_caption',
  'apply_color',
  'apply_transform',
  'apply_audio',
  'set_speed',
  'add_effect',
  'add_marker',
  'set_aspect',
]);

async function tryLlmPlan(
  project: Project,
  prompt: string,
  targetClips: Clip[],
  llm: ChatCutLlmConfig
): Promise<ChatCutPlan | null> {
  const summaryClips = targetClips.slice(0, 12).map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    startSec: Number((c.timelineStartUs / US_PER_SEC).toFixed(2)),
    durSec: Number((c.durationUs / US_PER_SEC).toFixed(2)),
  }));
  const systemPrompt =
    'You are T-ChatCut AI video editor planner. Reply ONLY with valid JSON: {"summary": string, "ops": [{"op": one of split|delete|trim|add_caption|apply_color|apply_transform|apply_audio|set_speed|add_effect|add_marker|set_aspect, "description": string, "targetClipId"?: string, "timeUs"?: number, "durationUs"?: number, "payload"?: object}]}. Units: timeUs and durationUs are microseconds (1s = 1000000).';
  const userContent = `Project aspectRatio=${project.settings.aspectRatio}, targetClips=${JSON.stringify(summaryClips)}\nUser request: ${prompt}`;

  try {
    let rawText = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      if (llm.provider === 'ollama') {
        const endpoint = (llm.endpoint || 'http://127.0.0.1:11434').replace(/\/$/, '');
        const res = await fetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: llm.model || 'qwen2.5:7b',
            stream: false,
            format: 'json',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { message?: { content?: string } };
        rawText = data.message?.content ?? '';
      } else if (llm.provider === 'openai' && llm.apiKey) {
        const endpoint = (llm.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
        const res = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${llm.apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: llm.model || 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        rawText = data.choices?.[0]?.message?.content ?? '';
      } else if (llm.provider === 'gemini' && llm.apiKey) {
        const model = llm.model || 'gemini-2.5-flash';
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(llm.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n${userContent}` }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      }
    } finally {
      clearTimeout(timer);
    }

    if (!rawText) return null;
    const parsed = JSON.parse(rawText) as { summary?: string; ops?: ChatCutDiffOp[] };
    if (!Array.isArray(parsed.ops) || parsed.ops.length === 0) return null;
    const validOps = parsed.ops.filter((o) => VALID_OPS.has(o.op) && typeof o.description === 'string');
    if (validOps.length === 0) return null;

    return {
      id: `plan_llm_${Date.now()}`,
      prompt,
      summary: parsed.summary || `T-ChatCut (${llm.provider}) đã lập kế hoạch ${validOps.length} thao tác.`,
      ops: validOps,
      estimatedTimeSavedSec: validOps.length * 14,
    };
  } catch {
    return null;
  }
}

export async function buildChatCutPlan(
  project: Project,
  prompt: string,
  tempDir: string,
  modelsDir: string,
  options?: BuildChatCutOptions
): Promise<ChatCutPlan> {
  const mainTrack = project.tracks.find((t) => t.isMain) ?? project.tracks[0];
  const allMainClips = Object.values(project.clips)
    .filter((c) => c.trackId === mainTrack?.id && !c.disabled)
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const selectedClip = options?.selectedClipId ? project.clips[options.selectedClipId] : undefined;
  const targetClips = selectedClip ? [selectedClip] : allMainClips;
  const primaryClip = targetClips[0] ?? Object.values(project.clips)[0];
  const primaryAsset =
    (primaryClip?.assetId ? project.assets[primaryClip.assetId] : undefined) ?? Object.values(project.assets)[0];

  if (options?.llmConfig) {
    const llmPlan = await tryLlmPlan(project, prompt, targetClips, options.llmConfig);
    if (llmPlan) return llmPlan;
  }

  const q = prompt.toLowerCase();
  const ops: ChatCutDiffOp[] = [];

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

  // 2. Remove Silence across target clips (not just first clip!)
  if (/lặng|silence|khoảng trống|ậm ừ|pause/.test(q)) {
    for (const tc of targetClips) {
      const asset = tc.assetId ? project.assets[tc.assetId] : undefined;
      if (!asset?.hasAudio) continue;
      const silences = await detectSilence(asset.sourcePath, -34, 0.4);
      for (const s of silences) {
        if (s.startUs >= tc.sourceStartUs && s.endUs <= tc.sourceStartUs + tc.sourceDurationUs) {
          const timelineAt = tc.timelineStartUs + (s.startUs - tc.sourceStartUs);
          ops.push({
            op: 'delete',
            description: `Cắt khoảng lặng ${(s.durationUs / US_PER_SEC).toFixed(2)}s tại ${(timelineAt / US_PER_SEC).toFixed(2)}s (${tc.name})`,
            targetClipId: tc.id,
            timeUs: timelineAt,
            durationUs: s.durationUs,
          });
        }
      }
    }
  }

  // 3. Auto Scene Split across target clips
  if (/cảnh|scene|tách cảnh/.test(q)) {
    for (const tc of targetClips) {
      const asset = tc.assetId ? project.assets[tc.assetId] : undefined;
      if (!asset || asset.kind !== 'video') continue;
      const scenes = asset.scenesUs ?? (await detectScenes(asset.sourcePath));
      for (const scUs of scenes) {
        if (scUs > tc.sourceStartUs + 200_000 && scUs < tc.sourceStartUs + tc.sourceDurationUs - 200_000) {
          ops.push({
            op: 'split',
            description: `Tách cảnh tự động tại ${(scUs / US_PER_SEC).toFixed(2)}s (${tc.name})`,
            targetClipId: tc.id,
            timeUs: tc.timelineStartUs + (scUs - tc.sourceStartUs),
          });
        }
      }
    }
  }

  // 4. Beat Markers
  if (/nhịp|beat|marker/.test(q) && primaryAsset?.hasAudio) {
    const beats = primaryAsset.beatsUs ?? (await detectBeats(primaryAsset.sourcePath, tempDir));
    beats.slice(0, 16).forEach((bUs, idx) => {
      ops.push({
        op: 'add_marker',
        description: `Gắn Beat Marker #${idx + 1} tại ${(bUs / US_PER_SEC).toFixed(2)}s`,
        timeUs: bUs,
        payload: { label: `Beat ${idx + 1}`, color: '#FFD60A', kind: 'beat' },
      });
    });
  }

  // 5. Auto Karaoke Captions
  if (/phụ đề|caption|subtitle|karaoke|chữ/.test(q) && primaryAsset) {
    const tx = primaryAsset.transcript
      ? { segments: primaryAsset.transcript }
      : await transcribeMedia(primaryAsset, tempDir, modelsDir, 'vi', options?.visionBinPath);
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

  // 6. Color Grading (targets selected clip or all target clips)
  if (/màu|color|cinematic|ấm|warm|lạnh|vintage|noir|nét/.test(q) && targetClips.length > 0) {
    const isWarm = /ấm|warm|cinematic/.test(q);
    const isNoir = /noir|đen trắng|trắng đen/.test(q);
    for (const tc of targetClips) {
      ops.push({
        op: 'apply_color',
        description: isNoir
          ? `Áp dụng Obsidian Noir cho ${tc.name}`
          : isWarm
            ? `Áp dụng preset Cinematic Warm cho ${tc.name}`
            : `Tăng độ rực & nét cho ${tc.name}`,
        targetClipId: tc.id,
        payload: isNoir
          ? { contrast: 0.35, saturation: -0.9, vignette: 0.45 }
          : {
              contrast: 0.18,
              saturation: 0.14,
              temperature: isWarm ? 0.22 : -0.1,
              vignette: 0.28,
              sharpness: 0.2,
            },
      });
    }
  }

  // 7. Zoom / Transform
  if (/zoom|phóng/.test(q) && primaryClip) {
    const match = q.match(/([0-9]+\.[0-9]+|[12])/);
    const scale = match ? Math.min(3, Math.max(0.3, Number(match[1]))) : 1.15;
    ops.push({
      op: 'apply_transform',
      description: `Thêm hiệu ứng Zoom ${scale}x cho ${primaryClip.name}`,
      targetClipId: primaryClip.id,
      payload: { scaleX: scale, scaleY: scale },
    });
  }

  // 8. Speed / Reverse
  if (/tốc độ|speed|nhanh|chậm|slow|reverse|ngược/.test(q) && primaryClip) {
    const isReverse = /reverse|ngược/.test(q);
    const numMatch = q.match(/([0-9]+(?:\.[0-9]+)?)\s*x/);
    const rate = numMatch ? Math.min(8, Math.max(0.2, Number(numMatch[1]))) : /chậm|slow/.test(q) ? 0.5 : /nhanh|fast/.test(q) ? 1.8 : 1;
    ops.push({
      op: 'set_speed',
      description: `Đặt tốc độ ${rate}x${isReverse ? ' + Phát ngược' : ''} cho ${primaryClip.name}`,
      targetClipId: primaryClip.id,
      payload: { rate, reverse: isReverse },
    });
  }

  // 9. Audio Enhancement (Denoise / Podcast / Volume)
  if (/âm|audio|ồn|noise|podcast|giọng|lớn hơn|nhỏ/.test(q)) {
    const targets = targetClips.length > 0 ? targetClips : Object.values(project.clips).filter((c) => c.kind === 'audio' || c.kind === 'video');
    for (const tc of targets) {
      ops.push({
        op: 'apply_audio',
        description: `Tối ưu âm thanh (${/ồn|noise/.test(q) ? 'Khử ồn + ' : ''}${/podcast/.test(q) ? 'Podcast Studio EQ' : 'Cân bằng'}) cho ${tc.name}`,
        targetClipId: tc.id,
        payload: {
          denoise: /ồn|noise|khử/.test(q) ? true : tc.audio.denoise,
          voicePreset: /podcast|giọng/.test(q) ? 'podcast' : tc.audio.voicePreset,
          volume: /lớn/.test(q) ? 1.4 : /nhỏ/.test(q) ? 0.5 : tc.audio.volume,
        },
      });
    }
  }

  // 10. Shader VFX
  if (/glitch|vhs|dreamy|film|hiệu ứng|effect/.test(q)) {
    const shaderId = /glitch/.test(q)
      ? 'glitch'
      : /vhs/.test(q)
        ? 'vhs'
        : /film/.test(q)
          ? 'film_burn'
          : 'dreamy';
    ops.push({
      op: 'add_effect',
      description: `Thêm lớp GPU Shader VFX (${shaderId}) lên Track Effect`,
      timeUs: primaryClip?.timelineStartUs ?? 0,
      durationUs: Math.min(3 * US_PER_SEC, primaryClip?.durationUs ?? 3 * US_PER_SEC),
      payload: { shaderId, intensity: 0.72 },
    });
  }

  if (ops.length === 0) {
    ops.push({
      op: 'apply_color',
      description: 'Tối ưu ánh sáng nhẹ (+0.08 Contrast, +0.06 Vibrance) cho clip hiện tại',
      targetClipId: primaryClip?.id,
      payload: { contrast: 0.08, vibrance: 0.06 },
    });
  }

  return {
    id: `plan_${Date.now()}`,
    prompt,
    summary: `T-ChatCut v2 đã lập kế hoạch ${ops.length} thao tác chỉnh sửa trên ${targetClips.length} clip.`,
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
  const effectTrack = next.tracks.find((t) => t.type === 'effect') ?? next.tracks[0];

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
    } else if (op.op === 'add_effect' && effectTrack) {
      const id = `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const shaderId = String(op.payload?.shaderId ?? 'dreamy');
      const intensity = Number(op.payload?.intensity ?? 0.72);
      const dur = op.durationUs ?? 3 * US_PER_SEC;
      next.clips[id] = {
        id,
        trackId: effectTrack.id,
        assetId: null,
        kind: 'effect',
        name: `FX ${shaderId}`,
        timelineStartUs: op.timeUs ?? 0,
        durationUs: dur,
        sourceStartUs: 0,
        sourceDurationUs: dur,
        locked: false,
        disabled: false,
        transform: createDefaultTransform(),
        colorGrade: createDefaultColorGrade(),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed: createDefaultSpeed(),
        audio: createDefaultAudioState(),
        keyframes: {},
        effects: [{ id: `fxi_${Date.now()}`, name: shaderId, shaderId, intensity, speed: 1 }],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
    } else if (op.op === 'apply_color' && op.targetClipId && next.clips[op.targetClipId]) {
      Object.assign(next.clips[op.targetClipId].colorGrade, op.payload ?? {});
    } else if (op.op === 'apply_transform' && op.targetClipId && next.clips[op.targetClipId]) {
      Object.assign(next.clips[op.targetClipId].transform, op.payload ?? {});
    } else if (op.op === 'apply_audio' && op.targetClipId && next.clips[op.targetClipId]) {
      Object.assign(next.clips[op.targetClipId].audio, op.payload ?? {});
    } else if (op.op === 'set_speed' && op.targetClipId && next.clips[op.targetClipId]) {
      const c = next.clips[op.targetClipId];
      if (op.payload?.rate !== undefined) {
        c.speed.mode = 'uniform';
        c.speed.rate = Number(op.payload.rate);
      }
      if (op.payload?.reverse !== undefined) {
        c.speed.reverse = Boolean(op.payload.reverse);
      }
      c.durationUs = computeDurationFromSpeed(c.sourceDurationUs, c.speed);
    }
  }

  return next;
}
