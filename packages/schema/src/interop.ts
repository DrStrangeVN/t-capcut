import {
  type Clip,
  type MediaAsset,
  type Project,
  type TranscriptSegment,
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function toRationalTime(us: number, fps: number): string {
  const frames = Math.round((us / US_PER_SEC) * fps);
  return `${frames}/${fps}s`;
}

function parseRationalTimeUs(str: string | undefined): number {
  if (!str) return 0;
  const clean = str.trim().replace(/s$/i, '');
  if (clean.includes('/')) {
    const [num, den] = clean.split('/').map(Number);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return Math.round((num / den) * US_PER_SEC);
    }
  }
  const sec = Number(clean);
  return Number.isFinite(sec) ? Math.round(sec * US_PER_SEC) : 0;
}

function parseXmlAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z0-9_:-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1]!] = unescapeXml(m[2]!);
  }
  return attrs;
}

/**
 * Export project to Multi-Track Final Cut Pro FCPXML 1.11 (compatible with Final Cut Pro & DaVinci Resolve).
 */
export function exportToFCPXML(project: Project): string {
  const fps = Math.max(1, project.settings.fps || 30);
  const assetsXml = Object.values(project.assets)
    .map(
      (a) =>
        `    <asset id="${escapeXml(a.id)}" name="${escapeXml(a.name)}" src="file://${encodeURI(a.sourcePath)}" start="0s" duration="${toRationalTime(a.durationUs, fps)}" hasVideo="${a.kind !== 'audio' ? '1' : '0'}" hasAudio="${a.hasAudio ? '1' : '0'}" />`
    )
    .join('\n');

  const allClips = Object.values(project.clips).filter((c) => !c.disabled);
  const totalUs = allClips.reduce((acc, c) => Math.max(acc, c.timelineStartUs + c.durationUs), 0);
  const mainTrack = project.tracks.find((t) => t.isMain) ?? project.tracks[0];
  const mainClips = allClips
    .filter((c) => c.trackId === mainTrack?.id)
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const connectedClips = allClips
    .filter((c) => c.trackId !== mainTrack?.id)
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const connectedXml = connectedClips
    .map((c) => {
      if (c.kind === 'text' && c.text) {
        return `          <title ref="r2" lane="2" offset="${toRationalTime(c.timelineStartUs, fps)}" name="${escapeXml(c.text.text)}" duration="${toRationalTime(c.durationUs, fps)}"><text>${escapeXml(c.text.text)}</text></title>`;
      }
      if (!c.assetId) return '';
      const lane = c.kind === 'audio' ? '-1' : '1';
      return `          <asset-clip ref="${escapeXml(c.assetId)}" lane="${lane}" offset="${toRationalTime(c.timelineStartUs, fps)}" name="${escapeXml(c.name)}" duration="${toRationalTime(c.durationUs, fps)}" start="${toRationalTime(c.sourceStartUs, fps)}" />`;
    })
    .filter(Boolean)
    .join('\n');

  const spineClipsXml = mainClips
    .map((c, idx) => {
      const transXml = c.transitionIn
        ? `            <transition name="${escapeXml(c.transitionIn.name)}" duration="${toRationalTime(c.transitionIn.durationUs, fps)}" />\n`
        : '';
      const extraConnected = idx === 0 && connectedXml ? `\n${connectedXml}\n          ` : '';
      return `${transXml}          <asset-clip ref="${escapeXml(c.assetId ?? c.id)}" offset="${toRationalTime(c.timelineStartUs, fps)}" name="${escapeXml(c.name)}" duration="${toRationalTime(c.durationUs, fps)}" start="${toRationalTime(c.sourceStartUs, fps)}">${extraConnected}</asset-clip>`;
    })
    .join('\n');

  const markersXml = (project.markers ?? [])
    .map((m) => `          <marker start="${toRationalTime(m.timeUs, fps)}" duration="1/${fps}s" value="${escapeXml(m.label)}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
  <resources>
    <format id="r1" name="FFVideoFormat${project.settings.height}p${fps}" frameDuration="1/${fps}s" width="${project.settings.width}" height="${project.settings.height}" />
    <effect id="r2" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti" />
${assetsXml}
  </resources>
  <library>
    <event name="T-CapCut Export">
      <project name="${escapeXml(project.name)}">
        <sequence format="r1" duration="${toRationalTime(totalUs, fps)}">
          <spine>
${spineClipsXml}
${markersXml}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

/**
 * Import Final Cut Pro / DaVinci Resolve FCPXML (.fcpxml) multi-track sequence into a T-CapCut Project.
 */
export function importFromFCPXML(xmlContent: string, projectId?: string): Project {
  const projNameMatch = xmlContent.match(/<project[^>]*\bname="([^"]+)"/i);
  const project = createEmptyProject(projectId || `proj_fcpxml_${Date.now()}`, projNameMatch ? unescapeXml(projNameMatch[1]!) : 'Imported FCPXML');

  const formatMatch = xmlContent.match(/<format\b([^>]+)\/?>/i);
  if (formatMatch) {
    const attrs = parseXmlAttrs(formatMatch[1]!);
    if (attrs.width) project.settings.width = Number(attrs.width) || 1920;
    if (attrs.height) project.settings.height = Number(attrs.height) || 1080;
    if (attrs.frameDuration) {
      const m = attrs.frameDuration.match(/1\/(\d+)s/);
      if (m) project.settings.fps = Number(m[1]) || 30;
    }
    const r = project.settings.width / Math.max(1, project.settings.height);
    project.settings.aspectRatio = r < 0.75 ? '9:16' : Math.abs(r - 1) < 0.1 ? '1:1' : r > 2.1 ? '2.35:1' : '16:9';
  }

  const assetRe = /<asset\b([^>]*)(?:\/>|>[\s\S]*?<\/asset>)/gi;
  let am: RegExpExecArray | null;
  while ((am = assetRe.exec(xmlContent)) !== null) {
    const attrs = parseXmlAttrs(am[1]!);
    if (!attrs.id) continue;
    const rawSrc = (attrs.src || '').replace(/^file:\/\//i, '');
    let decodedSrc = rawSrc;
    try {
      decodedSrc = decodeURI(rawSrc);
    } catch {
      // keep raw
    }
    const hasVideo = attrs.hasVideo !== '0';
    const asset: MediaAsset = {
      id: attrs.id,
      name: attrs.name || decodedSrc.split('/').pop() || attrs.id,
      kind: hasVideo ? 'video' : 'audio',
      sourcePath: decodedSrc,
      durationUs: parseRationalTimeUs(attrs.duration) || 5 * US_PER_SEC,
      width: project.settings.width,
      height: project.settings.height,
      fps: project.settings.fps,
      hasAudio: attrs.hasAudio !== '0',
      fileSizeBytes: 0,
      createdAt: Date.now(),
      proxyStatus: 'none',
    };
    project.assets[asset.id] = asset;
  }

  const mainTrack = project.tracks.find((t) => t.isMain)!;
  const overlayTrack = project.tracks.find((t) => t.type === 'overlay')!;
  const audioTrack = project.tracks.find((t) => t.type === 'audio')!;
  const textTrack = project.tracks.find((t) => t.type === 'text')!;

  const clipRe = /<asset-clip\b([^>]*)(?:\/>|>)/gi;
  let cm: RegExpExecArray | null;
  let clipIdx = 0;
  let cursorUs = 0;
  while ((cm = clipRe.exec(xmlContent)) !== null) {
    const attrs = parseXmlAttrs(cm[1]!);
    const lane = Number(attrs.lane ?? '0');
    const durUs = Math.max(100_000, parseRationalTimeUs(attrs.duration) || 3 * US_PER_SEC);
    const startUs = attrs.offset != null ? parseRationalTimeUs(attrs.offset) : cursorUs;
    const srcStartUs = parseRationalTimeUs(attrs.start);
    const asset = attrs.ref ? project.assets[attrs.ref] : undefined;
    const targetTrack =
      lane < 0 || asset?.kind === 'audio' ? audioTrack : lane > 0 ? overlayTrack : mainTrack;
    const kind: Clip['kind'] = targetTrack.type === 'audio' ? 'audio' : asset?.kind === 'image' ? 'image' : 'video';
    const cid = `fcpx_clip_${++clipIdx}`;
    project.clips[cid] = {
      id: cid,
      trackId: targetTrack.id,
      assetId: asset?.id ?? attrs.ref ?? null,
      kind,
      name: attrs.name || asset?.name || cid,
      timelineStartUs: startUs,
      durationUs: durUs,
      sourceStartUs: srcStartUs,
      sourceDurationUs: durUs,
      locked: false,
      disabled: false,
      transform: { ...createDefaultTransform(), fillMode: project.settings.aspectRatio !== '16:9' ? 'cover' : 'fit' },
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    if (lane === 0) cursorUs = Math.max(cursorUs, startUs + durUs);
  }

  const titleRe = /<title\b([^>]*)>([\s\S]*?)<\/title>/gi;
  let tm: RegExpExecArray | null;
  let titleIdx = 0;
  while ((tm = titleRe.exec(xmlContent)) !== null) {
    const attrs = parseXmlAttrs(tm[1]!);
    const innerTextMatch = tm[2]!.match(/<text[^>]*>([\s\S]*?)<\/text>/i);
    const textVal = unescapeXml((innerTextMatch?.[1] || attrs.name || 'Title').replace(/<[^>]+>/g, '').trim());
    const startUs = parseRationalTimeUs(attrs.offset);
    const durUs = Math.max(200_000, parseRationalTimeUs(attrs.duration) || 2 * US_PER_SEC);
    const tid = `fcpx_txt_${++titleIdx}`;
    project.clips[tid] = {
      id: tid,
      trackId: textTrack.id,
      assetId: null,
      kind: 'text',
      name: textVal.slice(0, 24),
      timelineStartUs: startUs,
      durationUs: durUs,
      sourceStartUs: 0,
      sourceDurationUs: durUs,
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      text: createDefaultTextStyle(textVal),
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
  }

  return project;
}

/**
 * Import OpenTimelineIO (.otio) JSON timeline into a T-CapCut Project.
 */
export function importFromOTIO(otioJson: string, projectId?: string): Project {
  const parsed = JSON.parse(otioJson) as {
    name?: string;
    tracks?: {
      children?: Array<{
        name?: string;
        kind?: string;
        children?: Array<{
          OTIO_SCHEMA?: string;
          name?: string;
          media_reference?: {
            target_url?: string;
            available_range?: { duration?: { value?: number; rate?: number } };
          };
          source_range?: {
            start_time?: { value?: number; rate?: number };
            duration?: { value?: number; rate?: number };
          };
        }>;
      }>;
    };
  };

  const project = createEmptyProject(projectId || `proj_otio_${Date.now()}`, parsed.name || 'Imported OTIO Timeline');
  const mainTrack = project.tracks.find((t) => t.isMain)!;
  const overlayTrack = project.tracks.find((t) => t.type === 'overlay')!;
  const audioTrack = project.tracks.find((t) => t.type === 'audio')!;

  const toUs = (rt?: { value?: number; rate?: number }) => {
    if (!rt || typeof rt.value !== 'number') return 0;
    const rate = rt.rate && rt.rate > 0 ? rt.rate : 30;
    return Math.round((rt.value / rate) * US_PER_SEC);
  };

  let videoTrackIdx = 0;
  let assetSeq = 0;
  let clipSeq = 0;

  for (const otioTrack of parsed.tracks?.children ?? []) {
    const isAudio = (otioTrack.kind || '').toLowerCase() === 'audio';
    const targetTrack = isAudio ? audioTrack : videoTrackIdx++ === 0 ? mainTrack : overlayTrack;
    let cursorUs = 0;

    for (const item of otioTrack.children ?? []) {
      const schema = item.OTIO_SCHEMA || '';
      const durUs = Math.max(100_000, toUs(item.source_range?.duration) || 3 * US_PER_SEC);
      if (schema.startsWith('Gap')) {
        cursorUs += toUs(item.source_range?.duration);
        continue;
      }
      const rawUrl = (item.media_reference?.target_url || '').replace(/^file:\/\//i, '');
      const assetId = `otio_asset_${++assetSeq}`;
      const availDur = toUs(item.media_reference?.available_range?.duration) || durUs;
      if (rawUrl) {
        project.assets[assetId] = {
          id: assetId,
          name: item.name || rawUrl.split('/').pop() || assetId,
          kind: isAudio ? 'audio' : 'video',
          sourcePath: decodeURI(rawUrl),
          durationUs: availDur,
          width: project.settings.width,
          height: project.settings.height,
          fps: project.settings.fps,
          hasAudio: true,
          fileSizeBytes: 0,
          createdAt: Date.now(),
          proxyStatus: 'none',
        };
      }
      const cid = `otio_clip_${++clipSeq}`;
      project.clips[cid] = {
        id: cid,
        trackId: targetTrack.id,
        assetId: rawUrl ? assetId : null,
        kind: isAudio ? 'audio' : 'video',
        name: item.name || cid,
        timelineStartUs: cursorUs,
        durationUs: durUs,
        sourceStartUs: toUs(item.source_range?.start_time),
        sourceDurationUs: durUs,
        locked: false,
        disabled: false,
        transform: createDefaultTransform(),
        colorGrade: createDefaultColorGrade(),
        chromaKey: createDefaultChromaKey(),
        mask: createDefaultMask(),
        speed: createDefaultSpeed(),
        audio: createDefaultAudioState(),
        keyframes: {},
        effects: [],
        aiMattingEnabled: false,
        autoReframeEnabled: false,
      };
      cursorUs += durUs;
    }
  }
  return project;
}

export interface TCapCutTemplatePackage {
  format: 'tcapcut-template-v1';
  id: string;
  name: string;
  aspectRatio: Project['settings']['aspectRatio'];
  width: number;
  height: number;
  fps: number;
  slots: Array<{ slotIndex: number; clipId: string; label: string; durationUs: number; fillMode?: 'fit' | 'cover' }>;
  project: Project;
}

export function buildTemplatePackageFromProject(project: Project, templateName?: string): TCapCutTemplatePackage {
  const cloned = JSON.parse(JSON.stringify(project)) as Project;
  const visualClips = Object.values(cloned.clips)
    .filter((c) => c.kind === 'video' || c.kind === 'image')
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const slots = visualClips.map((c, idx) => ({
    slotIndex: idx,
    clipId: c.id,
    label: c.name || `Slot ${idx + 1}`,
    durationUs: c.durationUs,
    fillMode: c.transform.fillMode ?? (cloned.settings.aspectRatio !== '16:9' ? 'cover' : 'fit'),
  }));

  return {
    format: 'tcapcut-template-v1',
    id: `tpl_custom_${Date.now()}`,
    name: templateName || `${project.name} Template`,
    aspectRatio: cloned.settings.aspectRatio,
    width: cloned.settings.width,
    height: cloned.settings.height,
    fps: cloned.settings.fps,
    slots,
    project: cloned,
  };
}

/**
 * Export project to OpenTimelineIO (.otio) JSON format.
 */
export function exportToOTIO(project: Project): string {
  const fps = Math.max(1, project.settings.fps || 30);
  const sortedTracks = [...project.tracks].sort((a, b) => a.index - b.index);

  const otioTracks = sortedTracks.map((t) => {
    const clips = Object.values(project.clips)
      .filter((c) => c.trackId === t.id)
      .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

    const children: unknown[] = [];
    let cursorUs = 0;

    for (const c of clips) {
      if (c.timelineStartUs > cursorUs) {
        children.push({
          OTIO_SCHEMA: 'Gap.1',
          source_range: {
            OTIO_SCHEMA: 'TimeRange.1',
            start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: fps },
            duration: { OTIO_SCHEMA: 'RationalTime.1', value: ((c.timelineStartUs - cursorUs) / US_PER_SEC) * fps, rate: fps },
          },
        });
      }
      const asset = c.assetId ? project.assets[c.assetId] : undefined;
      children.push({
        OTIO_SCHEMA: 'Clip.2',
        name: c.name,
        media_reference: asset
          ? {
              OTIO_SCHEMA: 'ExternalReference.1',
              target_url: `file://${asset.sourcePath}`,
              available_range: {
                OTIO_SCHEMA: 'TimeRange.1',
                start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: fps },
                duration: { OTIO_SCHEMA: 'RationalTime.1', value: (asset.durationUs / US_PER_SEC) * fps, rate: fps },
              },
            }
          : { OTIO_SCHEMA: 'MissingReference.1' },
        source_range: {
          OTIO_SCHEMA: 'TimeRange.1',
          start_time: { OTIO_SCHEMA: 'RationalTime.1', value: (c.sourceStartUs / US_PER_SEC) * fps, rate: fps },
          duration: { OTIO_SCHEMA: 'RationalTime.1', value: (c.durationUs / US_PER_SEC) * fps, rate: fps },
        },
      });
      cursorUs = Math.max(cursorUs, c.timelineStartUs + c.durationUs);
    }

    return {
      OTIO_SCHEMA: 'Track.1',
      name: t.name,
      kind: t.type === 'audio' ? 'Audio' : 'Video',
      children,
    };
  });

  const otio = {
    OTIO_SCHEMA: 'Timeline.1',
    name: project.name,
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'tracks',
      children: otioTracks,
    },
  };
  return JSON.stringify(otio, null, 2);
}

function formatSrtTime(us: number): string {
  const totalMs = Math.max(0, Math.round(us / 1000));
  const ms = totalMs % 1000;
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60_000) % 60;
  const h = Math.floor(totalMs / 3_600_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatAssTime(us: number): string {
  const totalCs = Math.max(0, Math.round(us / 10_000));
  const cs = totalCs % 100;
  const s = Math.floor(totalCs / 100) % 60;
  const m = Math.floor(totalCs / 6000) % 60;
  const h = Math.floor(totalCs / 360_000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function exportSubtitlesToSRT(clips: Clip[]): string {
  const textClips = clips
    .filter((c) => c.kind === 'text' && c.text && !c.disabled)
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  return textClips
    .map((c, idx) => {
      const start = formatSrtTime(c.timelineStartUs);
      const end = formatSrtTime(c.timelineStartUs + c.durationUs);
      return `${idx + 1}\n${start} --> ${end}\n${c.text?.text ?? ''}\n`;
    })
    .join('\n');
}

export function exportSubtitlesToVTT(clips: Clip[]): string {
  const textClips = clips
    .filter((c) => c.kind === 'text' && c.text && !c.disabled)
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const body = textClips
    .map((c) => {
      const start = formatSrtTime(c.timelineStartUs).replace(',', '.');
      const end = formatSrtTime(c.timelineStartUs + c.durationUs).replace(',', '.');
      return `${start} --> ${end}\n${c.text?.text ?? ''}\n`;
    })
    .join('\n');

  return `WEBVTT\n\n${body}`;
}

function hexToAssBgr(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return '&H00FFFFFF';
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/**
 * Export text/caption clips to ASS with native word-level Karaoke (\kf) timing for FFmpeg burn-in.
 */
export function exportSubtitlesToASS(clips: Clip[], width = 1920, height = 1080): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TCapCutDefault,Arial,58,&H00FFFFFF,&H000AD6FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const textClips = clips
    .filter((c) => c.kind === 'text' && c.text && !c.disabled)
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const lines = textClips.map((c) => {
    const start = formatAssTime(c.timelineStartUs);
    const end = formatAssTime(c.timelineStartUs + c.durationUs);
    const t = c.text!;
    const primary = hexToAssBgr(t.karaokeEnabled ? t.karaokeActiveColor : t.color);
    const secondary = hexToAssBgr(t.color);

    let lineText = t.text.replace(/\n/g, '\\N');
    if (t.karaokeEnabled && t.words && t.words.length > 0) {
      lineText = t.words
        .map((w) => {
          const cs = Math.max(1, Math.round((w.endUs - w.startUs) / 10_000));
          return `{\\kf${cs}}${w.text}`;
        })
        .join(' ');
    }
    return `Dialogue: 0,${start},${end},TCapCutDefault,,0,0,0,,{\\1c${primary}\\2c${secondary}}${lineText}`;
  });

  return `${header}\n${lines.join('\n')}\n`;
}

export function parseSRT(srtContent: string): TranscriptSegment[] {
  const blocks = srtContent.trim().split(/\r?\n\r?\n+/);
  const segments: TranscriptSegment[] = [];

  const parseTime = (str: string): number => {
    const match = str.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!match) return 0;
    const [, h, m, s, ms] = match;
    return (
      (Number(h) * 3600 + Number(m) * 60 + Number(s)) * US_PER_SEC +
      Number(ms.padEnd(3, '0').slice(0, 3)) * 1000
    );
  };

  blocks.forEach((block, idx) => {
    const lines = block.split(/\r?\n/);
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) return;
    const [startRaw, endRaw] = lines[timeLineIdx].split('-->');
    const startUs = parseTime(startRaw);
    const endUs = parseTime(endRaw);
    const text = lines.slice(timeLineIdx + 1).join(' ').trim();
    if (!text) return;

    const rawWords = text.split(/\s+/).filter(Boolean);
    const perWordUs = Math.max(50_000, Math.floor((endUs - startUs) / Math.max(1, rawWords.length)));

    segments.push({
      id: `seg_srt_${idx}`,
      startUs,
      endUs,
      text,
      words: rawWords.map((w, wi) => ({
        text: w,
        startUs: startUs + wi * perWordUs,
        endUs: wi === rawWords.length - 1 ? endUs : startUs + (wi + 1) * perWordUs,
      })),
    });
  });
  return segments;
}

export interface ParsedCubeLUT {
  title: string;
  size: number;
  data: Float32Array; // RGBA or RGB flattened (size^3 * 3)
}

/**
 * Parse an industry-standard .cube 3D LUT file.
 */
export function parseCubeLUT(cubeText: string): ParsedCubeLUT {
  let title = 'Custom LUT';
  let size = 0;
  const values: number[] = [];

  for (const rawLine of cubeText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE')) {
      title = line.replace(/^TITLE\s+/, '').replace(/^"|"$/g, '');
      continue;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      size = Number.parseInt(line.split(/\s+/)[1] ?? '0', 10);
      continue;
    }
    if (line.startsWith('DOMAIN_MIN') || line.startsWith('DOMAIN_MAX') || line.startsWith('LUT_1D_SIZE')) {
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
      values.push(parts[0], parts[1], parts[2]);
    }
  }

  if (size <= 1 || values.length !== size * size * size * 3) {
    throw new Error(`Invalid .cube LUT: size=${size}, triples=${values.length / 3}`);
  }

  return {
    title,
    size,
    data: new Float32Array(values),
  };
}
