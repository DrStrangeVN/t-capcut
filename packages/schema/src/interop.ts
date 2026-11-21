import { type Clip, type Project, type TranscriptSegment, US_PER_SEC } from './types.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRationalTime(us: number, fps: number): string {
  const frames = Math.round((us / US_PER_SEC) * fps);
  return `${frames}/${fps}s`;
}

/**
 * Export project to Final Cut Pro FCPXML 1.11 (compatible with Final Cut Pro & DaVinci Resolve).
 */
export function exportToFCPXML(project: Project): string {
  const fps = Math.max(1, project.settings.fps || 30);
  const assetsXml = Object.values(project.assets)
    .map(
      (a) =>
        `    <asset id="${escapeXml(a.id)}" name="${escapeXml(a.name)}" src="file://${encodeURI(a.sourcePath)}" start="0s" duration="${toRationalTime(a.durationUs, fps)}" hasVideo="${a.kind !== 'audio' ? '1' : '0'}" hasAudio="${a.hasAudio ? '1' : '0'}" />`
    )
    .join('\n');

  const allClips = Object.values(project.clips);
  const totalUs = allClips.reduce((acc, c) => Math.max(acc, c.timelineStartUs + c.durationUs), 0);
  const mainTrack = project.tracks.find((t) => t.isMain) ?? project.tracks[0];
  const mainClips = allClips
    .filter((c) => c.trackId === mainTrack?.id)
    .sort((a, b) => a.timelineStartUs - b.timelineStartUs);

  const spineClipsXml = mainClips
    .map(
      (c) =>
        `          <asset-clip ref="${escapeXml(c.assetId ?? c.id)}" offset="${toRationalTime(c.timelineStartUs, fps)}" name="${escapeXml(c.name)}" duration="${toRationalTime(c.durationUs, fps)}" start="${toRationalTime(c.sourceStartUs, fps)}" />`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
  <resources>
    <format id="r1" name="FFVideoFormat${project.settings.height}p${fps}" frameDuration="1/${fps}s" width="${project.settings.width}" height="${project.settings.height}" />
${assetsXml}
  </resources>
  <library>
    <event name="T-CapCut Export">
      <project name="${escapeXml(project.name)}">
        <sequence format="r1" duration="${toRationalTime(totalUs, fps)}">
          <spine>
${spineClipsXml}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
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
