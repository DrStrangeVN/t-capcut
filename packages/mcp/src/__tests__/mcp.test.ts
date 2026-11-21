import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectDatabase } from '@t-capcut/engine';
import { MCP_TOOLS, TCapCutMcpHandler } from '../index.js';

describe('@t-capcut/mcp', () => {
  it('handles MCP initialize, tools/list, and tools/call against SQLite project store', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcapcut-mcp-'));
    const db = new ProjectDatabase(path.join(tmpDir, 'tcapcut.sqlite'));
    db.createProject('p_mcp', 'MCP Demo');
    const handler = new TCapCutMcpHandler(db, tmpDir);

    try {
      const init = (await handler.handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' })) as {
        serverInfo: { name: string };
      };
      assert.equal(init.serverInfo.name, 'tcapcut-mcp');

      const listed = (await handler.handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as {
        tools: typeof MCP_TOOLS;
      };
      assert.ok(listed.tools.length >= 6);

      const added = (await handler.handleRpc({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'add_text_caption',
          arguments: { projectId: 'p_mcp', text: 'T-CapCut MCP Works', startSec: 0, durationSec: 2 },
        },
      })) as { content: Array<{ text: string }> };
      assert.ok(added.content[0].text.includes('T-CapCut MCP Works'));
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
