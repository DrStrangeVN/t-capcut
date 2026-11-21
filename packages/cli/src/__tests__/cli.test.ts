import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectDatabase } from '@t-capcut/engine';
import { runCli } from '../index.js';

describe('@t-capcut/cli', () => {
  it('runs info and projects commands', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcapcut-cli-'));
    const projectRoot = path.resolve(process.cwd(), '..', '..');
    const db = new ProjectDatabase(path.join(tmpDir, 'tcapcut.sqlite'));
    db.createProject('p_cli', 'CLI Project');
    db.close();

    try {
      const infoOut = await runCli(['info'], tmpDir, projectRoot);
      const info = JSON.parse(infoOut);
      assert.equal(info.ai.visionAvailable, true);

      const projOut = await runCli(['projects'], tmpDir, projectRoot);
      const list = JSON.parse(projOut);
      assert.equal(list[0].id, 'p_cli');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
