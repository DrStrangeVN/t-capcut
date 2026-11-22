export interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

function escapePointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function diffNode(before: unknown, after: unknown, basePath: string, ops: JsonPatchOp[]): void {
  if (deepEqual(before, after)) return;

  if (Array.isArray(before) && Array.isArray(after)) {
    // Replace arrays cleanly when lengths differ significantly or diff element-by-element if equal length
    if (before.length === after.length) {
      for (let i = 0; i < before.length; i++) {
        diffNode(before[i], after[i], `${basePath}/${i}`, ops);
      }
      return;
    }
    ops.push({ op: 'replace', path: basePath || '/', value: after });
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key) && before[key] !== undefined;
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key) && after[key] !== undefined;
      const ptr = `${basePath}/${escapePointer(key)}`;
      if (hasBefore && !hasAfter) {
        ops.push({ op: 'remove', path: ptr });
      } else if (!hasBefore && hasAfter) {
        ops.push({ op: 'add', path: ptr, value: after[key] });
      } else if (hasBefore && hasAfter) {
        diffNode(before[key], after[key], ptr, ops);
      }
    }
    return;
  }

  ops.push({ op: 'replace', path: basePath || '/', value: after });
}

export function createJsonPatch(before: unknown, after: unknown): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  diffNode(before, after, '', ops);
  return ops;
}

export function applyJsonPatch<T>(doc: T, ops: JsonPatchOp[]): T {
  let root = JSON.parse(JSON.stringify(doc)) as unknown;

  for (const op of ops) {
    if (op.path === '' || op.path === '/') {
      if (op.op === 'replace' || op.op === 'add') {
        root = JSON.parse(JSON.stringify(op.value));
      }
      continue;
    }

    const parts = op.path.split('/').slice(1).map(unescapePointer);
    let cursor = root as Record<string, unknown> | unknown[];
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (Array.isArray(cursor)) {
        cursor = cursor[Number(seg)] as Record<string, unknown> | unknown[];
      } else {
        if (cursor[seg] === undefined) cursor[seg] = {};
        cursor = cursor[seg] as Record<string, unknown> | unknown[];
      }
    }

    const last = parts[parts.length - 1];
    if (Array.isArray(cursor)) {
      const idx = last === '-' ? cursor.length : Number(last);
      if (op.op === 'remove') cursor.splice(idx, 1);
      else if (op.op === 'add') cursor.splice(idx, 0, JSON.parse(JSON.stringify(op.value)));
      else cursor[idx] = JSON.parse(JSON.stringify(op.value));
    } else {
      if (op.op === 'remove') delete cursor[last];
      else cursor[last] = JSON.parse(JSON.stringify(op.value));
    }
  }

  return root as T;
}
