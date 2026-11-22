import type { Clip, Project, Track } from './types.js';

export function hasAnySoloTrack(tracks: Track[]): boolean {
  return tracks.some((t) => t.solo);
}

export function isTrackAudible(track: Track | undefined, tracks: Track[]): boolean {
  if (!track) return true;
  if (track.muted) return false;
  if (hasAnySoloTrack(tracks)) return Boolean(track.solo);
  return true;
}

export function isClipAudioAudible(clip: Clip, project: Project, tracksOverride?: Track[]): boolean {
  if (clip.disabled || clip.audio.muted) return false;
  const tracks = tracksOverride ?? project.tracks;
  const track = tracks.find((t) => t.id === clip.trackId);
  return isTrackAudible(track, tracks);
}

export function getScopeTracksAndClips(
  project: Project,
  nestedScopeId?: string | null
): { tracks: Track[]; clips: Record<string, Clip>; name: string } {
  if (nestedScopeId && project.nestedTimelines?.[nestedScopeId]) {
    const nt = project.nestedTimelines[nestedScopeId];
    return { tracks: nt.tracks, clips: nt.clips, name: nt.name };
  }
  return { tracks: project.tracks, clips: project.clips, name: project.name };
}

/**
 * Recursively flatten compound clips into playable/exportable leaf clips,
 * preserving inherited timeline offsets, trimming window, transform & opacity,
 * and track solo/mute/hidden metadata.
 */
export function resolveEffectiveClips(
  project: Project,
  nestedScopeId?: string | null,
  visited = new Set<string>()
): Array<Clip & { __effectiveTrackIndex?: number }> {
  const scope = getScopeTracksAndClips(project, nestedScopeId);
  const trackIndexMap = new Map(scope.tracks.map((t) => [t.id, t.index]));
  const trackMap = new Map(scope.tracks.map((t) => [t.id, t]));
  const result: Array<Clip & { __effectiveTrackIndex?: number }> = [];

  for (const clip of Object.values(scope.clips)) {
    if (clip.disabled) continue;
    const parentTrack = trackMap.get(clip.trackId);
    if (parentTrack?.hidden) continue;

    if (clip.kind === 'compound' && clip.compoundTimelineId && project.nestedTimelines?.[clip.compoundTimelineId]) {
      if (visited.has(clip.compoundTimelineId)) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(clip.compoundTimelineId);

      const children = resolveEffectiveClips(project, clip.compoundTimelineId, nextVisited);
      if (children.length === 0) continue;

      const minChildStart = children.reduce((m, ch) => Math.min(m, ch.timelineStartUs), Number.POSITIVE_INFINITY);
      const baseOrigin = Number.isFinite(minChildStart) ? minChildStart : 0;
      const cmpStart = clip.timelineStartUs;
      const cmpEnd = clip.timelineStartUs + clip.durationUs;
      const cmpSpeed = clip.speed.mode === 'uniform' ? Math.max(0.1, clip.speed.rate || 1) : 1;

      for (const child of children) {
        const relStart = child.timelineStartUs - baseOrigin - clip.sourceStartUs;
        const mappedStart = cmpStart + Math.round(relStart / cmpSpeed);
        const mappedDur = Math.max(50_000, Math.round(child.durationUs / cmpSpeed));
        const mappedEnd = mappedStart + mappedDur;

        // Intersect with parent compound clip window [cmpStart, cmpEnd]
        const clampedStart = Math.max(cmpStart, mappedStart);
        const clampedEnd = Math.min(cmpEnd, mappedEnd);
        if (clampedEnd - clampedStart <= 20_000) continue;

        const leftTrimUs = clampedStart - mappedStart;
        const newDurUs = clampedEnd - clampedStart;
        const childRate = child.speed.mode === 'uniform' ? Math.max(0.1, child.speed.rate || 1) : 1;

        result.push({
          ...child,
          id: `${clip.id}::${child.id}`,
          trackId: clip.trackId,
          timelineStartUs: clampedStart,
          durationUs: newDurUs,
          sourceStartUs: child.sourceStartUs + Math.round(leftTrimUs * cmpSpeed * childRate),
          sourceDurationUs: Math.max(20_000, Math.round(newDurUs * cmpSpeed * childRate)),
          transform: {
            ...child.transform,
            x: child.transform.x * clip.transform.scaleX + clip.transform.x,
            y: child.transform.y * clip.transform.scaleY + clip.transform.y,
            scaleX: child.transform.scaleX * clip.transform.scaleX,
            scaleY: child.transform.scaleY * clip.transform.scaleY,
            rotation: child.transform.rotation + clip.transform.rotation,
            opacity: child.transform.opacity * clip.transform.opacity,
          },
          audio: {
            ...child.audio,
            muted: child.audio.muted || clip.audio.muted || Boolean(parentTrack?.muted),
            volume: child.audio.volume * clip.audio.volume * (parentTrack?.volume ?? 1),
          },
          speed: {
            ...child.speed,
            rate: child.speed.rate * cmpSpeed,
          },
          __effectiveTrackIndex:
            (trackIndexMap.get(clip.trackId) ?? 0) * 100 + (child.__effectiveTrackIndex ?? 0),
        });
      }
      continue;
    }

    result.push({
      ...clip,
      __effectiveTrackIndex: (trackIndexMap.get(clip.trackId) ?? 0) * 100,
    });
  }

  return result;
}
