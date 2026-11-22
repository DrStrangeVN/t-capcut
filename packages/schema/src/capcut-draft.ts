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
  extra_material_refs?: string[];
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

export interface CapCutMaterialRef {
  id: string;
  name?: string;
  type?: string;
  effect_id?: string;
  duration?: number;
  fade_in_duration?: number;
  fade_out_duration?: number;
  curve_infos?: Array<{ position: number; speed: number }>;
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
      mode?: number;
      curve_infos?: Array<{ position: number; speed: number }>;
    }>;
    transitions?: CapCutMaterialRef[];
    video_effects?: CapCutMaterialRef[];
    effects?: CapCutMaterialRef[];
    audio_fades?: CapCutMaterialRef[];
    filters?: CapCutMaterialRef[];
  };
  tracks: CapCutTrack[];
}

export interface CapCutSlotInfo {
  slotIndex: number;
  clipId: string;
  originalPath: string;
  label: string;
  durationUs: number;
}

export interface CapCutImportReport {
  compatibilityPct: number;
  mappedItems: string[];
  fallbackItems: string[];
  missingMediaSlots: CapCutSlotInfo[];
}

function mapTrackTypeToCapCut(t: TrackType): CapCutTrack['type'] {
  if (t === 'overlay' || t === 'video') return 'video';
  if (t === 'audio') return 'audio';
  if (t === 'text') return 'text';
  if (t === 'adjustment') return 'filter';
  return 'effect';
}

function extractRichText(raw: string): { text: string; color?: string; strokeColor?: string; fontSize?: number } {
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as {
        text?: string;
        styles?: Array<{ fill?: { content?: { solid?: { color?: number[] } } }; strokes?: Array<{ content?: { solid?: { color?: number[] } } }>; size?: number }>;
      };
      const firstStyle = parsed.styles?.[0];
      const toHex = (rgb?: number[]) =>
        rgb && rgb.length >= 3
          ? `#${rgb.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('')}`
          : undefined;
      return {
        text: typeof parsed.text === 'string' ? parsed.text : raw,
        color: toHex(firstStyle?.fill?.content?.solid?.color),
        strokeColor: toHex(firstStyle?.strokes?.[0]?.content?.solid?.color),
        fontSize: typeof firstStyle?.size === 'number' ? Math.round(firstStyle.size * 6) : undefined,
      };
    } catch {
      // fall through
    }
  }
  return { text: raw };
}

function mapExternalTransitionId(rawName: string): string {
  const q = rawName.toLowerCase();
  if (/whip.*left|pan.*left|slide.*left/.test(q)) return 'whip_left';
  if (/whip.*right|pan.*right|slide.*right/.test(q)) return 'whip_right';
  if (/flash|white/.test(q)) return 'flash_white';
  if (/glitch|cyber/.test(q)) return 'glitch';
  if (/zoom.*in|pull.*in/.test(q)) return 'zoom_in';
  if (/zoom.*out|push/.test(q)) return 'zoom_out';
  if (/spin|vortex/.test(q)) return 'spin';
  if (/burn/.test(q)) return 'film_burn';
  if (/light|leak/.test(q)) return 'light_leak';
  if (/iris|circle/.test(q)) return 'iris_circle';
  if (/black|dip/.test(q)) return 'dip_black';
  if (/wipe/.test(q)) return 'wipe_left';
  if (/cube/.test(q)) return 'cube_turn';
  return 'dissolve';
}

function mapExternalVfxId(rawName: string): string {
  const q = rawName.toLowerCase();
  if (/vhs|retro|tape/.test(q)) return 'vhs';
  if (/grain|8mm|film/.test(q)) return 'super8_grain';
  if (/halat|bloom|glow/.test(q)) return 'halation';
  if (/glitch|rgb/.test(q)) return 'glitch';
  if (/shake|tremor/.test(q)) return 'perlin_shake';
  if (/blur|bokeh|focus/.test(q)) return 'gaussian_blur';
  if (/pulse|beat/.test(q)) return 'beat_pulse';
  if (/dream|mist|soft/.test(q)) return 'dreamy';
  if (/chroma|aberr/.test(q)) return 'chromatic';
  if (/prism/.test(q)) return 'prism_rainbow';
  if (/mosaic|pixel|censor/.test(q)) return 'pixel_mosaic';
  if (/neon|edge/.test(q)) return 'neon_edge';
  if (/skin|beauty|smooth/.test(q)) return 'skin_beauty';
  return 'dreamy';
}

function mapExternalLutId(rawName: string): string | null {
  const q = rawName.toLowerCase();
  if (/kodak|2383/.test(q)) return 'lut_kodak_2383';
  if (/fuji|eterna|vlog/.test(q)) return 'lut_fuji_eterna';
  if (/cinestill|800t|night/.test(q)) return 'lut_cinestill_800t';
  if (/teal|orange|cinema/.test(q)) return 'lut_teal_orange';
  if (/pastel|seoul|soft/.test(q)) return 'lut_seoul_pastel';
  if (/bw|mono|noir|leica/.test(q)) return 'lut_leica_bw';
  if (/cyber|tokyo|neon/.test(q)) return 'lut_tokyo_cyber';
  if (/golden|warm|sunset/.test(q)) return 'lut_golden_hour';
  if (/food|vivid|vibrant/.test(q)) return 'lut_food_vibrant';
  return null;
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

export function importFromCapCutDraftDetailed(
  draft: CapCutDraftContent,
  projectId?: string,
  checkPathExists?: (filePath: string) => boolean
): { project: Project; report: CapCutImportReport } {
  const id = projectId ?? draft.id ?? `proj_${Date.now()}`;
  const project = createEmptyProject(id, draft.name || 'Imported CapCut Draft');
  const mappedItems: string[] = [];
  const fallbackItems: string[] = [];
  const missingMediaSlots: CapCutSlotInfo[] = [];

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
  const speedMap = new Map((draft.materials?.speeds ?? []).map((s) => [s.id, s]));
  const transMap = new Map((draft.materials?.transitions ?? []).map((t) => [t.id, t]));
  const vfxMap = new Map([...(draft.materials?.video_effects ?? []), ...(draft.materials?.effects ?? [])].map((e) => [e.id, e]));
  const fadeMap = new Map((draft.materials?.audio_fades ?? []).map((f) => [f.id, f]));
  const filterMap = new Map((draft.materials?.filters ?? []).map((f) => [f.id, f]));

  const tracks: Track[] = [];
  let seenMainVideo = false;
  let slotCounter = 0;

  (draft.tracks ?? []).forEach((ct, idx) => {
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

      if (asset && (kind === 'video' || kind === 'image') && checkPathExists && !checkPathExists(asset.sourcePath)) {
        missingMediaSlots.push({
          slotIndex: slotCounter++,
          clipId: seg.id,
          originalPath: asset.sourcePath,
          label: asset.name || `Slot ${slotCounter}`,
          durationUs: seg.target_timerange.duration,
        });
      }

      const transform = createDefaultTransform();
      if (project.settings.aspectRatio !== '16:9') {
        transform.fillMode = 'cover';
      }
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

      const colorGrade = createDefaultColorGrade();
      const effects: Clip['effects'] = [];
      let transitionIn: Clip['transitionIn'] = null;

      for (const refId of seg.extra_material_refs ?? []) {
        const sp = speedMap.get(refId);
        if (sp) {
          speed.rate = sp.speed ?? speed.rate;
          if (sp.curve_infos && sp.curve_infos.length >= 2) {
            speed.mode = 'curve';
            speed.curvePoints = sp.curve_infos;
          }
          mappedItems.push(`Speed (${speed.rate}x)`);
        }
        const fd = fadeMap.get(refId);
        if (fd) {
          audio.fadeInUs = fd.fade_in_duration ?? 0;
          audio.fadeOutUs = fd.fade_out_duration ?? 0;
          mappedItems.push('Audio Fade In/Out');
        }
        const tr = transMap.get(refId);
        if (tr) {
          const mapped = mapExternalTransitionId(tr.name || tr.type || '');
          transitionIn = {
            id: `tr_${refId}`,
            name: tr.name || mapped,
            type: mapped,
            durationUs: tr.duration || 450_000,
          };
          mappedItems.push(`Transition: ${tr.name || mapped}`);
        }
        const fx = vfxMap.get(refId);
        if (fx) {
          const mappedVfx = mapExternalVfxId(fx.name || fx.type || '');
          effects.push({
            id: `fx_${refId}`,
            name: fx.name || mappedVfx,
            shaderId: mappedVfx,
            intensity: 0.72,
            speed: 1,
            scale: 1,
            enabled: true,
          });
          mappedItems.push(`VFX: ${fx.name || mappedVfx} -> ${mappedVfx}`);
        }
        const flt = filterMap.get(refId);
        if (flt) {
          const mappedLut = mapExternalLutId(flt.name || flt.type || '');
          if (mappedLut) {
            colorGrade.lutId = mappedLut;
            colorGrade.lutName = flt.name || mappedLut;
            mappedItems.push(`LUT Filter: ${flt.name || mappedLut}`);
          } else {
            fallbackItems.push(`Filter "${flt.name || refId}" (dùng màu trung tính)`);
          }
        }
      }

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

      const rich = textMat ? extractRichText(textMat.content) : null;
      const clip: Clip = {
        id: seg.id,
        trackId: track.id,
        assetId: textMat ? null : seg.material_id,
        kind,
        name: rich ? rich.text : asset?.name ?? seg.id,
        timelineStartUs: seg.target_timerange.start,
        durationUs: seg.target_timerange.duration,
        sourceStartUs: seg.source_timerange?.start ?? 0,
        sourceDurationUs: seg.source_timerange?.duration ?? seg.target_timerange.duration,
        locked: false,
        disabled: seg.visible === false,
        transform,
        colorGrade,
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed,
        audio,
        keyframes,
        text: textMat && rich
          ? {
              ...createDefaultTextStyle(rich.text),
              fontSize: rich.fontSize ?? textMat.font_size ?? 56,
              color: rich.color ?? textMat.text_color ?? '#FFFFFF',
              strokeColor: rich.strokeColor ?? '#000000',
            }
          : undefined,
        transitionIn,
        effects,
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
      project.clips[clip.id] = clip;
      if (kind !== 'video' && kind !== 'audio' && !mappedItems.some((m) => m.includes(clip.id))) {
        mappedItems.push(`Clip ${clip.kind}: ${clip.name.slice(0, 24)}`);
      }
    }
  });

  if (tracks.length > 0) {
    project.tracks = tracks;
  }

  const totalItems = Math.max(1, mappedItems.length + fallbackItems.length + Object.keys(project.clips).length);
  const compatibilityPct = Math.max(50, Math.min(100, Math.round(((totalItems - fallbackItems.length) / totalItems) * 100)));

  return {
    project,
    report: {
      compatibilityPct,
      mappedItems: Array.from(new Set(mappedItems)),
      fallbackItems,
      missingMediaSlots,
    },
  };
}

export function importFromCapCutDraft(draft: CapCutDraftContent, projectId?: string): Project {
  return importFromCapCutDraftDetailed(draft, projectId).project;
}
