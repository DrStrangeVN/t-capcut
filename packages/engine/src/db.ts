import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyJsonPatch,
  createEmptyProject,
  createJsonPatch,
  type JsonPatchOp,
  type MediaAsset,
  type Project,
} from '@t-capcut/schema';

export interface StoredCommandRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  label: string;
  timestamp: number;
  before_json: string;
  after_json: string;
  patch_forward: string | null;
  patch_inverse: string | null;
  is_snapshot: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  clipCount: number;
  aspectRatio: string;
}

const SNAPSHOT_INTERVAL = 25;

/**
 * Crash-proof SQLite WAL persistence + RFC6902 JSON-Patch command-sourced Undo/Redo store.
 */
export class ProjectDatabase {
  private db: DatabaseSync;
  private undoCursors = new Map<string, string | null>();
  private stepCounters = new Map<string, number>();

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        json_data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        cursor_cmd_id TEXT
      );

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT,
        label TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        before_json TEXT NOT NULL,
        after_json TEXT NOT NULL,
        patch_forward TEXT,
        patch_inverse TEXT,
        is_snapshot INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_commands_project ON commands(project_id, timestamp);

      CREATE TABLE IF NOT EXISTS cache_entries (
        hash TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL
      );
    `);

    const cols = this.db.prepare('PRAGMA table_info(commands)').all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has('patch_forward')) {
      this.db.exec('ALTER TABLE commands ADD COLUMN patch_forward TEXT');
    }
    if (!colNames.has('patch_inverse')) {
      this.db.exec('ALTER TABLE commands ADD COLUMN patch_inverse TEXT');
    }
    if (!colNames.has('is_snapshot')) {
      this.db.exec('ALTER TABLE commands ADD COLUMN is_snapshot INTEGER NOT NULL DEFAULT 0');
    }
  }

  close(): void {
    this.db.close();
  }

  listProjects(): ProjectSummary[] {
    const stmt = this.db.prepare(
      'SELECT id, name, json_data, updated_at FROM projects ORDER BY updated_at DESC'
    );
    const rows = stmt.all() as Array<{ id: string; name: string; json_data: string; updated_at: number }>;
    return rows.map((r) => {
      try {
        const p = JSON.parse(r.json_data) as Project;
        return {
          id: r.id,
          name: r.name,
          updatedAt: r.updated_at,
          clipCount: Object.keys(p.clips ?? {}).length,
          aspectRatio: p.settings?.aspectRatio ?? '16:9',
        };
      } catch {
        return { id: r.id, name: r.name, updatedAt: r.updated_at, clipCount: 0, aspectRatio: '16:9' };
      }
    });
  }

  findAssetById(assetId: string): MediaAsset | null {
    const rows = this.db.prepare('SELECT json_data FROM projects').all() as Array<{ json_data: string }>;
    for (const r of rows) {
      try {
        const p = JSON.parse(r.json_data) as Project;
        if (p.assets?.[assetId]) return p.assets[assetId];
      } catch {
        // ignore corrupt row
      }
    }
    return null;
  }

  createProject(id: string, name: string): Project {
    const project = createEmptyProject(id, name);
    this.db
      .prepare('INSERT INTO projects (id, name, json_data, updated_at, cursor_cmd_id) VALUES (?, ?, ?, ?, NULL)')
      .run(project.id, project.name, JSON.stringify(project), project.updatedAt);
    this.undoCursors.set(project.id, null);
    this.stepCounters.set(project.id, 0);
    return project;
  }

  saveImportedProject(project: Project): Project {
    const existing = this.getProject(project.id);
    if (existing) {
      return this.applyProjectSnapshot(project.id, 'Import / Replace Project', project);
    }
    this.db
      .prepare('INSERT INTO projects (id, name, json_data, updated_at, cursor_cmd_id) VALUES (?, ?, ?, ?, NULL)')
      .run(project.id, project.name, JSON.stringify(project), Date.now());
    this.undoCursors.set(project.id, null);
    this.stepCounters.set(project.id, 0);
    return project;
  }

  getProject(id: string): Project | null {
    const row = this.db
      .prepare('SELECT json_data, cursor_cmd_id FROM projects WHERE id = ?')
      .get(id) as { json_data: string; cursor_cmd_id: string | null } | undefined;
    if (!row) return null;
    if (!this.undoCursors.has(id)) {
      this.undoCursors.set(id, row.cursor_cmd_id);
    }
    return JSON.parse(row.json_data) as Project;
  }

  deleteProject(id: string): boolean {
    const info = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    this.undoCursors.delete(id);
    this.stepCounters.delete(id);
    return Number(info.changes) > 0;
  }

  applyProjectSnapshot(projectId: string, label: string, nextProject: Project): Project {
    const current = this.getProject(projectId);
    if (!current) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const updated: Project = { ...nextProject, updatedAt: Date.now() };
    const afterJson = JSON.stringify(updated);
    const parentId = this.undoCursors.get(projectId) ?? null;
    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const forwardPatch = createJsonPatch(current, updated);
    const inversePatch = createJsonPatch(updated, current);

    const stepCount = (this.stepCounters.get(projectId) ?? 0) + 1;
    this.stepCounters.set(projectId, stepCount);
    const isSnapshot = stepCount % SNAPSHOT_INTERVAL === 0 ? 1 : 0;

    const beforeCol = isSnapshot ? JSON.stringify(current) : '';
    const afterCol = isSnapshot ? afterJson : '';

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO commands
            (id, project_id, parent_id, label, timestamp, before_json, after_json, patch_forward, patch_inverse, is_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          cmdId,
          projectId,
          parentId,
          label,
          updated.updatedAt,
          beforeCol,
          afterCol,
          JSON.stringify(forwardPatch),
          JSON.stringify(inversePatch),
          isSnapshot
        );

      this.db
        .prepare('UPDATE projects SET name = ?, json_data = ?, updated_at = ?, cursor_cmd_id = ? WHERE id = ?')
        .run(updated.name, afterJson, updated.updatedAt, cmdId, projectId);

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    this.undoCursors.set(projectId, cmdId);
    return updated;
  }

  undo(projectId: string): { project: Project; undoneLabel: string | null } {
    const current = this.getProject(projectId);
    if (!current) throw new Error(`Project not found: ${projectId}`);

    const cursorId = this.undoCursors.get(projectId) ?? null;
    if (!cursorId) return { project: current, undoneLabel: null };

    const cmd = this.db
      .prepare('SELECT id, parent_id, label, before_json, patch_inverse FROM commands WHERE id = ? AND project_id = ?')
      .get(cursorId, projectId) as StoredCommandRow | undefined;

    if (!cmd) return { project: current, undoneLabel: null };

    let restored: Project;
    if (cmd.patch_inverse) {
      const ops = JSON.parse(cmd.patch_inverse) as JsonPatchOp[];
      restored = applyJsonPatch(current, ops);
    } else if (cmd.before_json) {
      restored = JSON.parse(cmd.before_json) as Project;
    } else {
      return { project: current, undoneLabel: null };
    }

    restored.updatedAt = Date.now();
    this.db
      .prepare('UPDATE projects SET name = ?, json_data = ?, updated_at = ?, cursor_cmd_id = ? WHERE id = ?')
      .run(restored.name, JSON.stringify(restored), restored.updatedAt, cmd.parent_id, projectId);

    this.undoCursors.set(projectId, cmd.parent_id);
    return { project: restored, undoneLabel: cmd.label };
  }

  redo(projectId: string): { project: Project; redoneLabel: string | null } {
    const current = this.getProject(projectId);
    if (!current) throw new Error(`Project not found: ${projectId}`);

    const cursorId = this.undoCursors.get(projectId) ?? null;
    const child = (
      cursorId === null
        ? this.db
            .prepare(
              'SELECT id, label, after_json, patch_forward FROM commands WHERE project_id = ? AND parent_id IS NULL ORDER BY timestamp DESC LIMIT 1'
            )
            .get(projectId)
        : this.db
            .prepare(
              'SELECT id, label, after_json, patch_forward FROM commands WHERE project_id = ? AND parent_id = ? ORDER BY timestamp DESC LIMIT 1'
            )
            .get(projectId, cursorId)
    ) as StoredCommandRow | undefined;

    if (!child) return { project: current, redoneLabel: null };

    let restored: Project;
    if (child.patch_forward) {
      const ops = JSON.parse(child.patch_forward) as JsonPatchOp[];
      restored = applyJsonPatch(current, ops);
    } else if (child.after_json) {
      restored = JSON.parse(child.after_json) as Project;
    } else {
      return { project: current, redoneLabel: null };
    }

    restored.updatedAt = Date.now();
    this.db
      .prepare('UPDATE projects SET name = ?, json_data = ?, updated_at = ?, cursor_cmd_id = ? WHERE id = ?')
      .run(restored.name, JSON.stringify(restored), restored.updatedAt, child.id, projectId);

    this.undoCursors.set(projectId, child.id);
    return { project: restored, redoneLabel: child.label };
  }

  jumpToCommand(projectId: string, targetCmdId: string): Project {
    let steps = 0;
    while (steps < 60) {
      const cursor = this.undoCursors.get(projectId) ?? null;
      if (cursor === targetCmdId) break;
      const res = this.undo(projectId);
      if (!res.undoneLabel) break;
      steps++;
    }
    return this.getProject(projectId)!;
  }

  getHistory(projectId: string): Array<{ id: string; parentId: string | null; label: string; timestamp: number; isCurrent: boolean }> {
    const cursorId = this.undoCursors.get(projectId) ?? null;
    const rows = this.db
      .prepare('SELECT id, parent_id, label, timestamp FROM commands WHERE project_id = ? ORDER BY timestamp DESC LIMIT 50')
      .all(projectId) as Array<{ id: string; parent_id: string | null; label: string; timestamp: number }>;

    return rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      label: r.label,
      timestamp: r.timestamp,
      isCurrent: r.id === cursorId,
    }));
  }

  getCommandStorageStats(projectId: string): { count: number; totalBytes: number } {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(LENGTH(before_json) + LENGTH(after_json) + LENGTH(COALESCE(patch_forward, '')) + LENGTH(COALESCE(patch_inverse, ''))), 0) as bytes FROM commands WHERE project_id = ?"
      )
      .get(projectId) as { cnt: number; bytes: number };
    return { count: row.cnt, totalBytes: row.bytes };
  }

  getCacheEntry(hash: string): { filePath: string; bytes: number } | null {
    const row = this.db
      .prepare('SELECT file_path, bytes FROM cache_entries WHERE hash = ?')
      .get(hash) as { file_path: string; bytes: number } | undefined;
    if (!row || !fs.existsSync(row.file_path)) return null;
    this.db.prepare('UPDATE cache_entries SET last_accessed = ? WHERE hash = ?').run(Date.now(), hash);
    return { filePath: row.file_path, bytes: row.bytes };
  }

  putCacheEntry(hash: string, kind: string, filePath: string): void {
    const bytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    this.db
      .prepare(
        `INSERT INTO cache_entries (hash, kind, file_path, bytes, last_accessed)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(hash) DO UPDATE SET file_path = excluded.file_path, bytes = excluded.bytes, last_accessed = excluded.last_accessed`
      )
      .run(hash, kind, filePath, bytes, Date.now());
  }
}
