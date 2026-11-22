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
  type MediaAsset,
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
  it('persists SQLite WAL JSON-Patch deltas cleanly and performs fast branching Undo/Redo', () => {
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
      assert.ok(elapsed < 3000, `100 WAL patch commits took ${elapsed}ms`);

      const stats = db.getCommandStorageStats('p1');
      assert.equal(stats.count, 100);
      assert.ok(stats.totalBytes < 120_000, `Expected compact JSON patch history, got ${stats.totalBytes} bytes`);

      const undone = db.undo('p1');
      assert.equal(undone.project.name, 'WAL Test 98');
      const redone = db.redo('p1');
      assert.equal(redone.project.name, 'WAL Test 99');
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('enforces session-token auth & media path confinement, exports compounds & LUTs, and streams SSE progress', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcapcut-media-'));
    const projectRoot = path.resolve(process.cwd(), '..', '..');
    const server = new TCapCutEngineServer({ projectRoot, dataDir: tmpDir });
    const { url } = await server.start(0);
    const authHeaders = { 'X-TCapCut-Token': server.sessionToken };

    try {
      const samplePath = await createDemoMediaSample(path.join(tmpDir, 'media'));
      const asset = await probeMedia(samplePath, 'asset_demo');
      assert.equal(asset.kind, 'video');
      assert.ok(asset.durationUs > 5 * US_PER_SEC);
      assert.equal(asset.hasAudio, true);
      assert.equal(asset.filmstripCols, 24);

      const [proxyPath, stripPath, waveformPath] = await Promise.all([
        generateProxy(asset, path.join(tmpDir, 'cache')),
        generateThumbnailStrip(asset, path.join(tmpDir, 'cache'), 24),
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

      // Upload a 3D LUT via API and attach it to clip
      const lutCube = `TITLE "Warm Test"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;
      const lutRes = await fetch(`${url}/api/luts/upload`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'lut_test_warm', content: lutCube }),
      });
      assert.equal(lutRes.status, 200);
      const lutJson = (await lutRes.json()) as { id: string; title: string; size: number; filePath: string };
      project.luts = { [lutJson.id]: { id: lutJson.id, title: lutJson.title, size: lutJson.size, filePath: lutJson.filePath } };

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
        colorGrade: { ...createDefaultColorGrade(), lutId: lutJson.id, lutName: lutJson.title },
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

      // Test Security: unauthenticated API rejected (401)
      const unauthResp = await fetch(`${url}/api/projects`);
      assert.equal(unauthResp.status, 401);

      // Test Security: /etc/passwd traversal rejected even WITH token (403)
      const traversalResp = await fetch(`${url}/api/media/stream?path=${encodeURIComponent('/etc/passwd')}`, {
        headers: authHeaders,
      });
      assert.equal(traversalResp.status, 403);

      // Test asset streaming by assetId with HTTP 206 Range
      const assetStreamResp = await fetch(
        `${url}/api/media/asset/${encodeURIComponent(asset.id)}?variant=source&token=${server.sessionToken}`,
        { headers: { Range: 'bytes=0-1023' } }
      );
      assert.equal(assetStreamResp.status, 206);

      // Test Compound Clip Export
      const cmpProject = JSON.parse(JSON.stringify(project)) as typeof project;
      cmpProject.nestedTimelines = {
        cmp_e2e: {
          id: 'cmp_e2e',
          name: 'Compound E2E',
          tracks: [cmpProject.tracks[3]],
          clips: { c_inner: { ...clip, id: 'c_inner', durationUs: 2 * US_PER_SEC, sourceDurationUs: 2 * US_PER_SEC } },
        },
      };
      cmpProject.clips = {
        c_cmp: {
          ...clip,
          id: 'c_cmp',
          kind: 'compound',
          assetId: null,
          compoundTimelineId: 'cmp_e2e',
          durationUs: 2 * US_PER_SEC,
        },
      };
      const cmpOut = path.join(tmpDir, 'exports', 'compound.mp4');
      const cmpRes = await exportProject(
        cmpProject,
        { mode: 'hardware', codec: 'h264', lutsDir: server.lutsDir, outputPath: cmpOut },
        path.join(tmpDir, 'tmp'),
        server.db
      );
      assert.ok(fs.existsSync(cmpOut) && cmpRes.fileSizeBytes > 5_000);

      // Test T-ChatCut v2 Plan + Apply + Word-level Karaoke Export + Audio-only mix
      const plan = await buildChatCutPlan(
        project,
        'Cắt hết khoảng lặng và thêm phụ đề karaoke màu vàng',
        path.join(tmpDir, 'tmp'),
        path.join(tmpDir, 'models')
      );
      assert.ok(plan.ops.length >= 2);
      const edited = applyChatCutPlan(project, plan);
      assert.ok(Object.values(edited.clips).some((c) => c.kind === 'text' && c.text?.karaokeEnabled));

      const hwOut = path.join(tmpDir, 'exports', 'hardware.mp4');
      const progressSeen: number[] = [];
      const hwRes = await exportProject(
        edited,
        {
          mode: 'hardware',
          codec: 'h264',
          burnSubtitles: true,
          loudnorm: true,
          lutsDir: server.lutsDir,
          outputPath: hwOut,
          onProgress: (ev) => progressSeen.push(ev.percent),
        },
        path.join(tmpDir, 'tmp'),
        server.db
      );
      assert.ok(fs.existsSync(hwOut) && hwRes.fileSizeBytes > 10_000);
      assert.ok(progressSeen.length >= 1, 'Expected FFmpeg progress callbacks');

      const wavOut = path.join(tmpDir, 'exports', 'mix.wav');
      const wavRes = await exportProject(
        edited,
        { mode: 'audio-only', loudnorm: true, outputPath: wavOut },
        path.join(tmpDir, 'tmp'),
        server.db
      );
      assert.ok(fs.existsSync(wavOut) && wavRes.fileSizeBytes > 10_000);

      // Test HTTP Range Streaming on exported MP4 in exportsDir
      const rangeResp = await fetch(`${url}/api/media/stream?path=${encodeURIComponent(hwOut)}`, {
        headers: { ...authHeaders, Range: 'bytes=0-1023' },
      });
      assert.equal(rangeResp.status, 206);

      // Test Public Health endpoint
      const healthResp = await fetch(`${url}/api/health`);
      assert.equal(healthResp.status, 200);
      const healthJson = (await healthResp.json()) as { ok: boolean; version: string };
      assert.equal(healthJson.ok, true);
      assert.equal(healthJson.version, '4.0.0');

      // Test SSE /api/export/start + /events progress stream
      const startRes = await fetch(`${url}/api/export/start`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          options: { mode: 'audio-only', loudnorm: false },
        }),
      });
      assert.equal(startRes.status, 200);
      const { jobId } = (await startRes.json()) as { jobId: string };
      const sseRes = await fetch(`${url}/api/export/${encodeURIComponent(jobId)}/events`, {
        headers: authHeaders,
      });
      assert.equal(sseRes.status, 200);
      const sseText = await sseRes.text();
      assert.ok(sseText.includes('event: done'), `Expected SSE done event, got:\n${sseText}`);

      // Test Exact WYSIWYG Frame-Pipe Export endpoint (4 solid cyan RGBA frames at 320x180)
      const pipeProj = server.db.createProject('p_pipe', 'Pipe Test');
      pipeProj.settings.width = 320;
      pipeProj.settings.height = 180;
      pipeProj.settings.fps = 2;
      server.db.saveImportedProject(pipeProj);
      const pipeOut = path.join(tmpDir, 'exports', 'wysiwyg_pipe.mp4');
      const pipeStart = await fetch(`${url}/api/export/start`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: pipeProj.id,
          options: { mode: 'wysiwyg-pipe', codec: 'h264', width: 320, height: 180, fps: 2, outputPath: pipeOut },
        }),
      });
      assert.equal(pipeStart.status, 200);
      const { jobId: pipeJobId } = (await pipeStart.json()) as { jobId: string };
      const rgbaFrame = new Uint8Array(320 * 180 * 4);
      for (let i = 0; i < rgbaFrame.length; i += 4) {
        rgbaFrame[i] = 34;
        rgbaFrame[i + 1] = 211;
        rgbaFrame[i + 2] = 238;
        rgbaFrame[i + 3] = 255;
      }
      for (let f = 0; f < 4; f++) {
        const fRes = await fetch(`${url}/api/export/${encodeURIComponent(pipeJobId)}/frames`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/octet-stream' },
          body: rgbaFrame,
        });
        assert.equal(fRes.status, 200);
      }
      const finishRes = await fetch(`${url}/api/export/${encodeURIComponent(pipeJobId)}/finish-frames`, {
        method: 'POST',
        headers: authHeaders,
      });
      assert.equal(finishRes.status, 200);
      assert.ok(fs.existsSync(pipeOut) && fs.statSync(pipeOut).size > 500);
      const probedPipe = await probeMedia(pipeOut, 'pipe_out');
      assert.equal(probedPipe.kind, 'video');
      assert.equal(probedPipe.width, 320);
      assert.equal(probedPipe.height, 180);

      // Verify v3.0.0 Embedded Offline Presets endpoints (LUTs, Audio Range 206, Audio Add + ChatCut v3)
      const presetLutRes = await fetch(`${url}/api/presets/luts/lut_kodak_2383`, { headers: authHeaders });
      assert.equal(presetLutRes.status, 200);
      const presetLutJson = (await presetLutRes.json()) as { id: string; size: number; data: number[] };
      assert.equal(presetLutJson.id, 'lut_kodak_2383');
      assert.equal(presetLutJson.size, 17);
      assert.equal(presetLutJson.data.length, 17 * 17 * 17 * 3);

      const audioRangeRes = await fetch(`${url}/api/presets/audio/mus_lofi_midnight.m4a`, {
        headers: { ...authHeaders, Range: 'bytes=0-1023' },
      });
      assert.equal(audioRangeRes.status, 206);
      const audioBytes = await audioRangeRes.arrayBuffer();
      assert.equal(audioBytes.byteLength, 1024);

      const addAudioRes = await fetch(`${url}/api/presets/audio/add`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId: 'mus_beat_tiktok128' }),
      });
      assert.equal(addAudioRes.status, 200);
      const { asset: addedMus } = (await addAudioRes.json()) as { asset: MediaAsset };
      assert.equal(addedMus.kind, 'audio');
      assert.ok((addedMus.beatsUs?.length ?? 0) > 15);

      pipeProj.clips.clip_chat = {
        id: 'clip_chat',
        trackId: pipeProj.tracks.find((t) => t.isMain)?.id ?? 'track_main',
        assetId: null,
        kind: 'video',
        name: 'Sample Clip',
        timelineStartUs: 0,
        durationUs: 3 * US_PER_SEC,
        sourceStartUs: 0,
        sourceDurationUs: 3 * US_PER_SEC,
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
      server.db.saveImportedProject(pipeProj);

      const v3ChatRes = await fetch(`${url}/api/chatcut/plan`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: pipeProj.id,
          prompt: 'Gắn màu Kodak 2383 và hiệu ứng Halation',
        }),
      });
      assert.equal(v3ChatRes.status, 200);
      const { plan: v3Plan } = (await v3ChatRes.json()) as { plan: { ops: Array<{ op: string; payload?: Record<string, unknown> }> } };
      assert.ok(v3Plan.ops.some((o) => o.op === 'apply_color' && o.payload?.lutId === 'lut_kodak_2383'));
      assert.ok(v3Plan.ops.some((o) => o.op === 'add_effect' && o.payload?.shaderId === 'halation'));

      // Verify v4.0 Universal Template Pack ZIP + System Fonts + Offline TTS + Smart Music Remix
      const packRes = await fetch(`${url}/api/templates/export-pack`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: pipeProj.id, templateName: 'V4 Pack Test' }),
      });
      assert.equal(packRes.status, 200);
      const packJson = (await packRes.json()) as { filename: string; contentBase64: string };
      assert.ok(packJson.filename.endsWith('.tcapcut-tpl'));

      const importUnivRes = await fetch(`${url}/api/interop/import-universal`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: packJson.filename, contentBase64: packJson.contentBase64 }),
      });
      assert.equal(importUnivRes.status, 200);
      const univJson = (await importUnivRes.json()) as { kind: string; project?: { name: string } };
      assert.equal(univJson.kind, 'project');
      assert.equal(univJson.project?.name, 'V4 Pack Test');

      const fontsRes = await fetch(`${url}/api/system/fonts`, { headers: authHeaders });
      assert.equal(fontsRes.status, 200);
      const fontsJson = (await fontsRes.json()) as { fonts: string[] };
      assert.ok(fontsJson.fonts.length >= 4);

      const ttsRes = await fetch(`${url}/api/ai/tts`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Xin chào T-CapCut Studio', language: 'vi' }),
      });
      assert.equal(ttsRes.status, 200);
      const ttsJson = (await ttsRes.json()) as { asset: MediaAsset };
      assert.equal(ttsJson.asset.kind, 'audio');
      assert.ok(ttsJson.asset.durationUs > 400_000);

      const remixRes = await fetch(`${url}/api/audio/smart-remix`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: addedMus.id, targetDurationUs: 5_000_000 }),
      });
      assert.equal(remixRes.status, 200);
      const remixJson = (await remixRes.json()) as { asset: MediaAsset };
      assert.ok(remixJson.asset.durationUs > 4_000_000 && remixJson.asset.durationUs < 6_500_000);
    } finally {
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
