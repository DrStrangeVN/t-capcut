import {
  type Clip,
  type MediaAsset,
  type Project,
  type Track,
  type TrackType,
  US_PER_SEC,
  createDefaultAudioState,
  createDefaultChromaKey,
  createDefaultColorGrade,
  createDefaultMask,
  createDefaultSpeed,
  createDefaultTextStyle,
  createDefaultTransform,
  createEmptyProject,
} from './types.js';

/**
 * CapCut / JianYing draft_content.json schema (subset aligned with pyJianYingDraft & CapCut PC 7.x).
 */
export interface CapCutTimeRange {
  start: number;
  duration: number;
}

export interface CapCutSegment {
  id: string;
  material_id: string;
  target_timerange: CapCutTimeRange;
  source_timerange?: CapCutTimeRange;
  speed?: number;
  volume?: number;
  visible?: boolean;
  clip?: {
    alpha?: number;
    rotation?: number;
    scale?: { x: number; y: number };
    transform?: { x: number; y: number };
    flip?: { horizontal: boolean; vertical: boolean };
  };
  common_keyframes?: Array<{
    id: string;
    property_type: string;
    keyframe_list: Array<{
      id: string;
      time_offset: number;
      values: number[];
    }>;
  }>;
}

export interface CapCutTrack {
  id: string;
  type: 'video' | 'audio' | 'text' | 'effect' | 'filter' | 'sticker';
  name?: string;
  attribute?: number;
  flag?: number;
  segments: CapCutSegment[];
}

export interface CapCutDraftContent {
  id: string;
  name?: string;
  version?: number;
  fps: number;
  duration: number;
  canvas_config: {
    width: number;
    height: number;
    ratio: string;
  };
  materials: {
    videos: Array<{
      id: string;
      path: string;
      material_name: string;
      duration: number;
      width: number;
      height: number;
      type: 'video' | 'photo';
    }>;
    audios: Array<{
      id: string;
      path: string;
      name: string;
      duration: number;
    }>;
    texts: Array<{
      id: string;
      content: string;
      font_size?: number;
      text_color?: string;
      alignment?: number;
    }>;
    speeds: Array<{
      id: string;
      speed: number;
    }>;
  };
  tracks: CapCutTrack[];
}

function mapTrackTypeToCapCut(t: TrackType): CapCutTrack['type'] {
  if (t === 'overlay' || t === 'video') return 'video';
  if (t === 'audio') return 'audio';
  if (t === 'text') return 'text';
  if (t === 'adjustment') return 'filter';
  return 'effect';
}

function extractTextContent(raw: string): string {
  // CapCut sometimes stores rich JSON inside text material content
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { text?: string };
      if (typeof parsed.text === 'string') return parsed.text;
    } catch {
      // fall through
    }
  }
  return raw;
}

export function exportToCapCutDraft(project: Project): CapCutDraftContent {
  const videos: CapCutDraftContent['materials']['videos'] = [];
  const audios: CapCutDraftContent['materials']['audios'] = [];
  const texts: CapCutDraftContent['materials']['texts'] = [];
  const speeds: CapCutDraftContent['materials']['speeds'] = [];

  for (const asset of Object.values(project.assets)) {
    if (asset.kind === 'audio') {
      audios.push({
        id: asset.id,
        path: asset.sourcePath,
        name: asset.name,
        duration: asset.durationUs,
      });
    } else {
      videos.push({
        id: asset.id,
        path: asset.sourcePath,
        material_name: asset.name,
        duration: asset.durationUs,
        width: asset.width || project.settings.width,
        height: asset.height || project.settings.height,
        type: asset.kind === 'image' ? 'photo' : 'video',
      });
    }
  }

  let totalDurationUs = 0;
  const sortedTracks = [...project.tracks].sort((a, b) => a.index - b.index);

  const tracks: CapCutTrack[] = sortedTracks.map((track) => {
    const trackClips = Object.values(project.clips)
      .filter((c) => c.trackId === track.id)
      .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

    const segments: CapCutSegment[] = trackClips.map((clip) => {
      const endUs = clip.timelineStartUs + clip.durationUs;
      if (endUs > totalDurationUs) totalDurationUs = endUs;

      let materialId = clip.assetId ?? clip.id;
      if (clip.kind === 'text' && clip.text) {
        materialId = `txt_${clip.id}`;
        texts.push({
          id: materialId,
          content: JSON.stringify({ text: clip.text.text }),
          font_size: clip.text.fontSize,
          text_color: clip.text.color,
          alignment: clip.text.align === 'left' ? 0 : clip.text.align === 'right' ? 2 : 1,
        });
      }

      speeds.push({ id: `spd_${clip.id}`, speed: clip.speed.rate });

      const commonKeyframes = Object.entries(clip.keyframes)
        .filter(([, pts]) => pts && pts.length > 0)
        .map(([prop, pts]) => ({
          id: `kf_grp_${clip.id}_${prop}`,
          property_type: prop,
          keyframe_list: (pts ?? []).map((pt) => ({
            id: pt.id,
            time_offset: pt.timeUs,
            values: [pt.value],
          })),
        }));

      return {
        id: clip.id,
        material_id: materialId,
        target_timerange: { start: clip.timelineStartUs, duration: clip.durationUs },
        source_timerange: { start: clip.sourceStartUs, duration: clip.sourceDurationUs },
        speed: clip.speed.rate,
        volume: clip.audio.volume,
        visible: !clip.disabled,
        clip: {
          alpha: clip.transform.opacity,
          rotation: clip.transform.rotation,
          scale: { x: clip.transform.scaleX, y: clip.transform.scaleY },
          transform: { x: clip.transform.x, y: clip.transform.y },
          flip: { horizontal: clip.transform.flipH, vertical: clip.transform.flipV },
        },
        common_keyframes: commonKeyframes,
      };
    });

    return {
      id: track.id,
      type: mapTrackTypeToCapCut(track.type),
      name: track.name,
      attribute: track.muted ? 1 : 0,
      segments,
    };
  });

  return {
    id: project.id,
    name: project.name,
    version: 360000,
    fps: project.settings.fps,
    duration: totalDurationUs,
    canvas_config: {
      width: project.settings.width,
      height: project.settings.height,
      ratio: project.settings.aspectRatio,
    },
    materials: { videos, audios, texts, speeds },
    tracks,
  };
}

export function importFromCapCutDraft(draft: CapCutDraftContent, projectId?: string): Project {
  const id = projectId ?? draft.id ?? `proj_${Date.now()}`;
  const project = createEmptyProject(id, draft.name || 'Imported CapCut Draft');
  project.settings.width = draft.canvas_config?.width || 1920;
  project.settings.height = draft.canvas_config?.height || 1080;
  project.settings.fps = draft.fps || 30;
  const ratio = draft.canvas_config?.ratio;
  if (
    ratio === '16:9' ||
    ratio === '9:16' ||
    ratio === '1:1' ||
    ratio === '4:3' ||
    ratio === '3:4' ||
    ratio === '2.35:1'
  ) {
    project.settings.aspectRatio = ratio;
  }

  for (const v of draft.materials?.videos ?? []) {
    const asset: MediaAsset = {
      id: v.id,
      name: v.material_name || v.path.split('/').pop() || 'Video',
      kind: v.type === 'photo' ? 'image' : 'video',
      sourcePath: v.path,
      durationUs: v.duration || 5 * US_PER_SEC,
      width: v.width || 1920,
      height: v.height || 1080,
      fps: draft.fps || 30,
      hasAudio: v.type !== 'photo',
      fileSizeBytes: 0,
      createdAt: Date.now(),
      proxyStatus: 'none',
    };
    project.assets[asset.id] = asset;
  }

  for (const a of draft.materials?.audios ?? []) {
    project.assets[a.id] = {
      id: a.id,
      name: a.name || a.path.split('/').pop() || 'Audio',
      kind: 'audio',
      sourcePath: a.path,
      durationUs: a.duration || 10 * US_PER_SEC,
      width: 0,
      height: 0,
      fps: 0,
      hasAudio: true,
      fileSizeBytes: 0,
      createdAt: Date.now(),
      proxyStatus: 'none',
    };
  }

  const textMap = new Map((draft.materials?.texts ?? []).map((t) => [t.id, t]));
  const tracks: Track[] = [];
  let seenMainVideo = false;

  draft.tracks.forEach((ct, idx) => {
    let type: TrackType = 'video';
    if (ct.type === 'audio') type = 'audio';
    else if (ct.type === 'text') type = 'text';
    else if (ct.type === 'filter') type = 'adjustment';
    else if (ct.type === 'effect') type = 'effect';
    else if (ct.type === 'video') {
      type = seenMainVideo ? 'overlay' : 'video';
      seenMainVideo = true;
    }

    const isMain = type === 'video' && tracks.every((t) => !t.isMain);
    const track: Track = {
      id: ct.id || `track_${idx}`,
      type,
      name: ct.name || `${type.toUpperCase()} ${idx + 1}`,
      index: idx,
      isMain,
      magnetic: isMain,
      muted: ct.attribute === 1,
      solo: false,
      hidden: false,
      locked: false,
      volume: 1,
    };
    tracks.push(track);

    for (const seg of ct.segments ?? []) {
      const textMat = textMap.get(seg.material_id);
      const asset = project.assets[seg.material_id];
      const kind: Clip['kind'] = textMat
        ? 'text'
        : type === 'audio'
          ? 'audio'
          : type === 'adjustment'
            ? 'adjustment'
            : type === 'effect'
              ? 'effect'
              : asset?.kind === 'image'
                ? 'image'
                : 'video';

      const transform = createDefaultTransform();
      if (seg.clip) {
        transform.opacity = seg.clip.alpha ?? 1;
        transform.rotation = seg.clip.rotation ?? 0;
        transform.scaleX = seg.clip.scale?.x ?? 1;
        transform.scaleY = seg.clip.scale?.y ?? 1;
        transform.x = seg.clip.transform?.x ?? 0;
        transform.y = seg.clip.transform?.y ?? 0;
        transform.flipH = seg.clip.flip?.horizontal ?? false;
        transform.flipV = seg.clip.flip?.vertical ?? false;
      }

      const speed = createDefaultSpeed();
      speed.rate = seg.speed ?? 1;

      const audio = createDefaultAudioState();
      audio.volume = seg.volume ?? 1;

      const keyframes: Clip['keyframes'] = {};
      for (const grp of seg.common_keyframes ?? []) {
        const key = grp.property_type as keyof Clip['keyframes'];
        keyframes[key] = grp.keyframe_list.map((k) => ({
          id: k.id,
          timeUs: k.time_offset,
          value: k.values?.[0] ?? 0,
          easing: [0.42, 0, 0.58, 1],
        }));
      }

      const clip: Clip = {
        id: seg.id,
        trackId: track.id,
        assetId: textMat ? null : seg.material_id,
        kind,
        name: textMat ? extractTextContent(textMat.content) : asset?.name ?? seg.id,
        timelineStartUs: seg.target_timerange.start,
        durationUs: seg.target_timerange.duration,
        sourceStartUs: seg.source_timerange?.start ?? 0,
        sourceDurationUs: seg.source_timerange?.duration ?? seg.target_timerange.duration,
        locked: false,
        disabled: seg.visible === false,
        transform,
        colorGrade: createDefaultColorGrade(),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed,
        audio,
        keyframes,
        text: textMat
          ? {
              ...createDefaultTextStyle(extractTextContent(textMat.content)),
              fontSize: textMat.font_size ?? 56,
              color: textMat.text_color ?? '#FFFFFF',
            }
          : undefined,
        effects: [],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
      project.clips[clip.id] = clip;
    }
  });

  if (tracks.length > 0) {
    project.tracks = tracks;
  }
  return project;
}
