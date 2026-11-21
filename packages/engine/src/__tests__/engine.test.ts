import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  US_PER_SEC,
  createDefaultAudioState,
  createDefaultChromaKey,
  createDefaultColorGrade,
  createDefaultMask,
  createDefaultSpeed,
  createDefaultTextStyle,
  createDefaultTransform,
  type Clip,
} from '@t-capcut/schema';
import {
  ProjectDatabase,
  TCapCutEngineServer,
  applyChatCutPlan,
  buildChatCutPlan,
  createDemoMediaSample,
  detectBeats,
  detectScenes,
  detectSilence,
  exportProject,
  extractWaveformPeaks,
  generateProxy,
  generateThumbnailStrip,
  prerenderSegment,
  probeMedia,
  transcribeMedia,
} from '../index.js';

describe('@t-capcut/engine', () => {
  it('persists SQLite WAL snapshots and performs fast branching Undo/Redo', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcapcut-db-'));
    const db = new ProjectDatabase(path.join(tmpDir, 'test.sqlite'));
    try {
      const p0 = db.createProject('p1', 'WAL Test');
      assert.equal(p0.name, 'WAL Test');

      const t0 = Date.now();
      let cur = p0;
      for (let i = 0; i < 100; i++) {
        cur = db.applyProjectSnapshot('p1', `Step ${i}`, { ...cur, name: `WAL Test ${i}` });
      }
      const elapsed = Date.now() - t0;
      assert.ok(elapsed < 3000, `100 WAL commits took ${elapsed}ms`);

      const undone = db.undo('p1');
      assert.equal(undone.project.name, 'WAL Test 98');
      const redone = db.redo('p1');
      assert.equal(redone.project.name, 'WAL Test 99');
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('probes demo video, builds proxy/strip/waveform, detects silence/beats, runs ChatCut, and exports lossless + hardware MP4', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcapcut-media-'));
    const projectRoot = path.resolve(process.cwd(), '..', '..');
    const server = new TCapCutEngineServer({ projectRoot, dataDir: tmpDir });
    const { url } = await server.start(0);

    try {
      const samplePath = await createDemoMediaSample(path.join(tmpDir, 'media'));
      const asset = await probeMedia(samplePath, 'asset_demo');
      assert.equal(asset.kind, 'video');
      assert.ok(asset.durationUs > 5 * US_PER_SEC);
      assert.equal(asset.hasAudio, true);

      const [proxyPath, stripPath, waveformPath] = await Promise.all([
        generateProxy(asset, path.join(tmpDir, 'cache')),
        generateThumbnailStrip(asset, path.join(tmpDir, 'cache'), 12),
        extractWaveformPeaks(asset, path.join(tmpDir, 'cache')),
      ]);
      assert.ok(fs.existsSync(proxyPath));
      assert.ok(fs.existsSync(stripPath));
      assert.ok(fs.existsSync(waveformPath));

      const silences = await detectSilence(samplePath, -30, 0.4);
      assert.ok(silences.length >= 1, 'Expected at least 1 silence gap around 2.0-3.2s');

      const beats = await detectBeats(samplePath, path.join(tmpDir, 'tmp'));
      assert.ok(Array.isArray(beats));

      const scenes = await detectScenes(samplePath, 14);
      assert.ok(Array.isArray(scenes));

      const tx = await transcribeMedia(asset, path.join(tmpDir, 'tmp'), path.join(tmpDir, 'models'), 'vi');
      assert.ok(tx.segments.length >= 1);

      let project = server.db.createProject('p_e2e', 'E2E Pipeline');
      project.assets[asset.id] = asset;
      const clip: Clip = {
        id: 'c_main',
        trackId: 'track_main',
        assetId: asset.id,
        kind: 'video',
        name: asset.name,
        timelineStartUs: 0,
        durationUs: asset.durationUs,
        sourceStartUs: 0,
        sourceDurationUs: asset.durationUs,
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
      project.clips[clip.id] = clip;
      project = server.db.applyProjectSnapshot('p_e2e', 'Add main clip', project);

      // Test Segment Pre-Render Cache (miss then hit)
      const pre1 = await prerenderSegment(project, clip, path.join(tmpDir, 'cache', 'prerender'), server.db);
      assert.equal(pre1.cacheHit, false);
      const pre2 = await prerenderSegment(project, clip, path.join(tmpDir, 'cache', 'prerender'), server.db);
      assert.equal(pre2.cacheHit, true);

      // Test Lossless Hybrid Export
      const losslessOut = path.join(tmpDir, 'exports', 'lossless.mp4');
      const losslessRes = await exportProject(
        project,
        { mode: 'lossless-hybrid', outputPath: losslessOut },
        path.join(tmpDir, 'tmp'),
        server.db
      );
      assert.equal(losslessRes.modeUsed, 'lossless-hybrid-stream-copy');
      assert.ok(fs.existsSync(losslessOut) && fs.statSync(losslessOut).size > 10_000);

      // Test T-ChatCut Plan + Apply (silence removal + karaoke captions)
      const plan = await buildChatCutPlan(
        project,
        'Cắt hết khoảng lặng và thêm phụ đề karaoke màu vàng',
        path.join(tmpDir, 'tmp'),
        path.join(tmpDir, 'models')
      );
      assert.ok(plan.ops.length >= 2);
      const edited = applyChatCutPlan(project, plan);
      assert.ok(Object.values(edited.clips).some((c) => c.kind === 'text' && c.text?.karaokeEnabled));

      // Test Hardware VideoToolbox + Burn-in Karaoke Export
      const hwOut = path.join(tmpDir, 'exports', 'hardware.mp4');
      const hwRes = await exportProject(
        edited,
        { mode: 'hardware', codec: 'h264', burnSubtitles: true, loudnorm: true, outputPath: hwOut },
        path.join(tmpDir, 'tmp'),
        server.db
      );
      assert.ok(fs.existsSync(hwOut) && hwRes.fileSizeBytes > 10_000);

      // Test HTTP Range Streaming & Health
      const healthResp = await fetch(`${url}/api/health`);
      assert.equal(healthResp.status, 200);
      const healthJson = (await healthResp.json()) as { ok: boolean };
      assert.equal(healthJson.ok, true);

      const rangeResp = await fetch(`${url}/api/media/stream?path=${encodeURIComponent(hwOut)}`, {
        headers: { Range: 'bytes=0-1023' },
      });
      assert.equal(rangeResp.status, 206);
    } finally {
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
