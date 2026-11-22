import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmptyProject, type MediaAsset } from '@t-capcut/schema';
import {
  VFX_CATALOG,
  TRANSITIONS_CATALOG,
  LUTS_CATALOG,
  TEXT_CATALOG,
  STICKERS_CATALOG,
  AUDIO_MUSIC_CATALOG,
  AUDIO_SFX_CATALOG,
  ALL_AUDIO_CATALOG,
  VIDEO_TEMPLATES_CATALOG,
  buildTextStyleFromPreset,
  applyVideoTemplateToProject,
} from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../../assets');

test('all creative catalog counts & unique IDs match v4.0.0 specification', () => {
  assert.equal(VFX_CATALOG.length, 48);
  assert.equal(TRANSITIONS_CATALOG.length, 32);
  assert.equal(LUTS_CATALOG.length, 16);
  assert.equal(TEXT_CATALOG.length, 25);
  assert.equal(STICKERS_CATALOG.length, 30);
  assert.equal(AUDIO_MUSIC_CATALOG.length, 15);
  assert.equal(AUDIO_SFX_CATALOG.length, 40);
  assert.equal(VIDEO_TEMPLATES_CATALOG.length, 12);

  const uniqueIds = (items: Array<{ id: string }>) => new Set(items.map((x) => x.id)).size === items.length;
  assert.equal(uniqueIds(VFX_CATALOG), true);
  assert.equal(uniqueIds(TRANSITIONS_CATALOG), true);
  assert.equal(uniqueIds(LUTS_CATALOG), true);
  assert.equal(uniqueIds(TEXT_CATALOG), true);
  assert.equal(uniqueIds(STICKERS_CATALOG), true);
  assert.equal(uniqueIds(ALL_AUDIO_CATALOG), true);
  assert.equal(uniqueIds(VIDEO_TEMPLATES_CATALOG), true);

  assert.deepEqual(
    VFX_CATALOG.map((v) => v.shaderIndex),
    Array.from({ length: 48 }, (_, i) => i + 1)
  );
  assert.deepEqual(
    TRANSITIONS_CATALOG.map((t) => t.transIndex),
    Array.from({ length: 32 }, (_, i) => i + 1)
  );
  const lottieStickers = STICKERS_CATALOG.filter((s) => s.category === 'lottie');
  assert.equal(lottieStickers.length, 6);
  for (const ls of lottieStickers) {
    assert.ok(ls.lottieJson && JSON.parse(ls.lottieJson).layers.length > 0);
  }
});

test('music tracks have valid BPM-aligned beat grids & text presets produce valid TextStyleState', () => {
  for (const track of AUDIO_MUSIC_CATALOG) {
    assert.ok(track.bpm >= 70 && track.bpm <= 140, `Expected valid BPM for ${track.id}`);
    assert.ok(track.durationSec >= 40, `Expected studio length >=40s for ${track.id}`);
    assert.ok(track.beatsUs.length >= 45, `Expected full beat markers for ${track.id}`);
    assert.ok(track.structure && track.structure.outroStartUs > track.structure.dropUs);
  }
  const style = buildTextStyleFromPreset(TEXT_CATALOG[0]!);
  assert.ok(style.fontSize > 20);
  assert.ok(style.karaokePreset);
});

test('applyVideoTemplateToProject populates tracks, video slots, LUT, VFX, music, and text overlay', () => {
  const base = createEmptyProject('proj-test', 'Template Test');
  const tpl = VIDEO_TEMPLATES_CATALOG[0]!;
  const mockA: MediaAsset = {
    id: 'asset-a',
    name: 'a.mp4',
    kind: 'video',
    sourcePath: '/tmp/a.mp4',
    durationUs: 10_000_000,
    width: 1080,
    height: 1920,
    fps: 30,
    hasAudio: true,
    fileSizeBytes: 1024,
    createdAt: Date.now(),
    proxyStatus: 'ready',
  };
  const mockB: MediaAsset = {
    id: 'asset-b',
    name: 'b.png',
    kind: 'image',
    sourcePath: '/tmp/b.png',
    durationUs: 5_000_000,
    width: 1080,
    height: 1920,
    fps: 30,
    hasAudio: false,
    fileSizeBytes: 512,
    createdAt: Date.now(),
    proxyStatus: 'ready',
  };
  const mockMus: MediaAsset = {
    id: 'mus_beat_tiktok128',
    name: 'Neon TikTok Pulse 128',
    kind: 'audio',
    sourcePath: '/tmp/mus.m4a',
    durationUs: 16_000_000,
    width: 0,
    height: 0,
    fps: 30,
    hasAudio: true,
    fileSizeBytes: 2048,
    createdAt: Date.now(),
    proxyStatus: 'ready',
    beatsUs: AUDIO_MUSIC_CATALOG[3]!.beatsUs,
  };

  const updated = applyVideoTemplateToProject(base, tpl, [mockA, mockB], mockMus);

  assert.equal(updated.settings.width, 1080);
  assert.equal(updated.settings.height, 1920);
  const allClips = Object.values(updated.clips);
  const videoClips = allClips.filter((c) => c.kind === 'video' || c.kind === 'image');
  assert.equal(videoClips.length, tpl.slots.length);
  assert.equal(videoClips[0]!.assetId, 'asset-a');
  assert.equal(videoClips[0]!.colorGrade.lutId, tpl.lutId);
  assert.ok(allClips.some((c) => c.kind === 'audio'));
  assert.ok(allClips.some((c) => c.kind === 'text'));
  assert.ok(updated.markers.length > 0);
});

test('all embedded offline .cube LUTs and .m4a Audio files exist on disk and are non-empty', async () => {
  for (const lut of LUTS_CATALOG) {
    const p = path.join(ASSETS_DIR, 'luts', lut.filename);
    const stat = await fs.stat(p);
    assert.ok(stat.size > 1000, `Missing or empty LUT: ${lut.filename}`);
  }
  for (const audio of ALL_AUDIO_CATALOG) {
    const p = path.join(ASSETS_DIR, 'audio', audio.filename);
    const stat = await fs.stat(p);
    assert.ok(stat.size > 1000, `Missing or empty audio: ${audio.filename}`);
  }
});
