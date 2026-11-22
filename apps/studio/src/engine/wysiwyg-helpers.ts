export {
  US_PER_SEC,
  getClipPropertyAtTime,
  mapLocalTimelineToSourceUs,
  resolveEffectiveClips,
  type Clip,
  type Microseconds,
  type Project,
} from '@t-capcut/schema';

export interface LoadedLutTextureLike {
  id: string;
  title: string;
  size: number;
  data: Float32Array;
}
