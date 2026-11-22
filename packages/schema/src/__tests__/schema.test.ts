import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  US_PER_SEC,
  computeDurationFromSpeed,
  applyJsonPatch,
  createDefaultAudioState,
  createDefaultChromaKey,
  createDefaultColorGrade,
  createDefaultMask,
  createDefaultSpeed,
  createDefaultTextStyle,
  createDefaultTransform,
  createEmptyProject,
  createJsonPatch,
  evaluateCubicBezier,
  exportSubtitlesToASS,
  exportSubtitlesToSRT,
  exportToCapCutDraft,
  exportToFCPXML,
  exportToOTIO,
  importFromCapCutDraft,
  interpolateKeyframes,
  mapLocalTimelineToSourceUs,
  parseCubeLUT,
  parseSRT,
  resolveEffectiveClips,
  type Clip,
} from '../index.js';

describe('@t-capcut/schema', () => {
  it('interpolates cubic bezier keyframes accurately', () => {
    assert.equal(evaluateCubicBezier(0, [0.42, 0, 0.58, 1]), 0);
    assert.equal(evaluateCubicBezier(1, [0.42, 0, 0.58, 1]), 1);
    const mid = evaluateCubicBezier(0.5, [0.42, 0, 0.58, 1]);
    assert.ok(Math.abs(mid - 0.5) < 0.02, `Expected ~0.5, got ${mid}`);

    const val = interpolateKeyframes(
      [
        { id: 'k1', timeUs: 0, value: 1.0, easing: [0, 0, 1, 1] },
        { id: 'k2', timeUs: 2 * US_PER_SEC, value: 2.0, easing: [0, 0, 1, 1] },
      ],
      1 * US_PER_SEC,
      1.0
    );
    assert.ok(Math.abs(val - 1.5) < 1e-4);
  });

  it('maps speed ramps and uniform reverse playback', () => {
    const clip: Clip = {
      id: 'c1',
      trackId: 'track_main',
      assetId: 'a1',
      kind: 'video',
      name: 'demo.mp4',
      timelineStartUs: 0,
      durationUs: 4 * US_PER_SEC,
      sourceStartUs: 1 * US_PER_SEC,
      sourceDurationUs: 8 * US_PER_SEC,
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: { ...createDefaultSpeed(), rate: 2 },
      audio: createDefaultAudioState(),
      keyframes: {},
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    assert.equal(mapLocalTimelineToSourceUs(clip, 1 * US_PER_SEC), 3 * US_PER_SEC);
  });

  it('round-trips CapCut draft_content.json, FCPXML, OTIO, SRT, and ASS Karaoke', () => {
    const project = createEmptyProject('p_test', 'Test CapCut Roundtrip');
    project.assets['a1'] = {
      id: 'a1',
      name: 'clip.mp4',
      kind: 'video',
      sourcePath: '/tmp/clip.mp4',
      durationUs: 10 * US_PER_SEC,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      fileSizeBytes: 123456,
      createdAt: Date.now(),
      proxyStatus: 'none',
    };
    const vClip: Clip = {
      id: 'c_vid',
      trackId: 'track_main',
      assetId: 'a1',
      kind: 'video',
      name: 'clip.mp4',
      timelineStartUs: 0,
      durationUs: 5 * US_PER_SEC,
      sourceStartUs: 0,
      sourceDurationUs: 5 * US_PER_SEC,
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {
        scaleX: [{ id: 'k1', timeUs: 0, value: 1.2, easing: [0.42, 0, 0.58, 1] }],
      },
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    const tClip: Clip = {
      ...vClip,
      id: 'c_txt',
      trackId: 'track_text_1',
      assetId: null,
      kind: 'text',
      name: 'Xin chào Trí',
      keyframes: {},
      text: {
        ...createDefaultTextStyle('Xin chào Trí'),
        karaokeEnabled: true,
        words: [
          { text: 'Xin', startUs: 0, endUs: 400_000 },
          { text: 'chào', startUs: 400_000, endUs: 800_000 },
          { text: 'Trí', startUs: 800_000, endUs: 1_200_000 },
        ],
      },
    };
    project.clips[vClip.id] = vClip;
    project.clips[tClip.id] = tClip;

    const ccDraft = exportToCapCutDraft(project);
    assert.equal(ccDraft.materials.videos.length, 1);
    assert.equal(ccDraft.materials.texts.length, 1);
    const reimported = importFromCapCutDraft(ccDraft, 'p_reimported');
    assert.equal(Object.keys(reimported.clips).length, 2);
    assert.equal(reimported.clips['c_txt']?.text?.text, 'Xin chào Trí');

    const fcpxml = exportToFCPXML(project);
    assert.ok(fcpxml.includes('<fcpxml version="1.11">'));

    const otio = JSON.parse(exportToOTIO(project));
    assert.equal(otio.OTIO_SCHEMA, 'Timeline.1');

    const srt = exportSubtitlesToSRT([tClip]);
    assert.ok(srt.includes('Xin chào Trí'));
    const parsedSrt = parseSRT(srt);
    assert.equal(parsedSrt.length, 1);
    assert.equal(parsedSrt[0].words.length, 3);

    const ass = exportSubtitlesToASS([tClip]);
    assert.ok(ass.includes('\\kf40'));
  });

  it('parses a 3D .cube LUT file', () => {
    const cube = `TITLE "Teal Orange"
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0`;
    const parsed = parseCubeLUT(cube);
    assert.equal(parsed.title, 'Teal Orange');
    assert.equal(parsed.size, 2);
    assert.equal(parsed.data.length, 24);
  });

  it('flattens compound clips with inherited offsets/transforms and round-trips RFC6902 JSON patches', () => {
    const project = createEmptyProject('p_cmp', 'Compound Test');
    const baseClip: Clip = {
      id: 'inner_1',
      trackId: 'track_main',
      assetId: 'a1',
      kind: 'video',
      name: 'clip1',
      timelineStartUs: 1_000_000,
      durationUs: 2_000_000,
      sourceStartUs: 0,
      sourceDurationUs: 2_000_000,
      locked: false,
      disabled: false,
      transform: { ...createDefaultTransform(), opacity: 0.5 },
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
    project.nestedTimelines = {
      cmp_1: {
        id: 'cmp_1',
        name: 'Nested',
        tracks: [{ ...project.tracks[3] }],
        clips: {
          inner_1: baseClip,
          inner_2: { ...baseClip, id: 'inner_2', timelineStartUs: 3_000_000 },
        },
      },
    };
    project.clips['c_cmp'] = {
      ...baseClip,
      id: 'c_cmp',
      kind: 'compound',
      assetId: null,
      compoundTimelineId: 'cmp_1',
      timelineStartUs: 5_000_000,
      durationUs: 4_000_000,
      transform: { ...createDefaultTransform(), opacity: 0.8 },
    };

    const flat = resolveEffectiveClips(project);
    assert.equal(flat.length, 2);
    assert.equal(flat[0].timelineStartUs, 5_000_000);
    assert.equal(flat[1].timelineStartUs, 7_000_000);
    assert.ok(Math.abs(flat[0].transform.opacity - 0.4) < 1e-6);

    const durCurve = computeDurationFromSpeed(4_000_000, {
      mode: 'curve',
      rate: 1,
      pitchPreserved: true,
      reverse: false,
      curvePoints: [{ position: 0, speed: 2 }, { position: 1, speed: 2 }],
    });
    assert.ok(Math.abs(durCurve - 2_000_000) < 10_000);

    const mutated = JSON.parse(JSON.stringify(project)) as typeof project;
    mutated.name = 'Updated Compound';
    mutated.clips['c_cmp'].transform.x = 0.25;
    const fwd = createJsonPatch(project, mutated);
    const inv = createJsonPatch(mutated, project);
    assert.ok(fwd.length === 2);
    assert.deepEqual(applyJsonPatch(project, fwd), mutated);
    assert.deepEqual(applyJsonPatch(mutated, inv), project);
  });
});
