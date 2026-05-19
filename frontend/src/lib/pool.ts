import { db, logEvent } from "./db";
import { normalizeTags } from "./requests";
import {
  PoolResource,
  ResourceStatus,
  ResourceType,
} from "./types";

interface PoolResourceRow {
  id: string;
  name: string;
  type: string;
  source: string;
  content: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPoolResource(r: PoolResourceRow, tags: string[]): PoolResource {
  return {
    id: r.id,
    name: r.name,
    type: r.type as ResourceType,
    source: r.source,
    content: r.content,
    tags,
    status: r.status as ResourceStatus,
    error: r.error,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** Tags for a single resource. */
function getTags(resourceId: string): string[] {
  const rows = db()
    .prepare<[string], { tag: string }>(
      `SELECT tag FROM pool_resource_tags WHERE resource_id = ? ORDER BY tag`,
    )
    .all(resourceId);
  return rows.map((r) => r.tag);
}

/** Replace a resource's tag set in one transaction. */
export function setTags(resourceId: string, tags: string[]): string[] {
  const clean = normalizeTags(tags);
  const tx = db().transaction(() => {
    db()
      .prepare(`DELETE FROM pool_resource_tags WHERE resource_id = ?`)
      .run(resourceId);
    const insert = db().prepare(
      `INSERT INTO pool_resource_tags (resource_id, tag) VALUES (?, ?)`,
    );
    for (const t of clean) insert.run(resourceId, t);
    db()
      .prepare(
        `UPDATE pool_resources SET updated_at = datetime('now') WHERE id = ?`,
      )
      .run(resourceId);
  });
  tx();
  return clean;
}

export function getPoolResource(id: string): PoolResource | null {
  const row = db()
    .prepare<[string], PoolResourceRow>(
      `SELECT * FROM pool_resources WHERE id = ?`,
    )
    .get(id);
  if (!row) return null;
  return rowToPoolResource(row, getTags(id));
}

/**
 * List pool resources, optionally filtered to those tagged with ANY of the
 * supplied tags. Returns tags pre-joined onto each row.
 */
export function listPoolResources(opts?: {
  tags?: string[];
  limit?: number;
}): PoolResource[] {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 200));
  const tagFilter = opts?.tags ? normalizeTags(opts.tags) : [];

  let rows: PoolResourceRow[];
  if (tagFilter.length > 0) {
    const placeholders = tagFilter.map(() => "?").join(",");
    rows = db()
      .prepare(
        `SELECT DISTINCT r.*
         FROM pool_resources r
         JOIN pool_resource_tags t ON t.resource_id = r.id
         WHERE t.tag IN (${placeholders})
         ORDER BY r.created_at DESC
         LIMIT ?`,
      )
      .all(...tagFilter, limit) as PoolResourceRow[];
  } else {
    rows = db()
      .prepare(
        `SELECT * FROM pool_resources
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as PoolResourceRow[];
  }

  // Fetch tags for all returned rows in one query and group by resource_id.
  const ids = rows.map((r) => r.id);
  const tagMap = new Map<string, string[]>();
  if (ids.length > 0) {
    const ph = ids.map(() => "?").join(",");
    const tagRows = db()
      .prepare<string[], { resource_id: string; tag: string }>(
        `SELECT resource_id, tag FROM pool_resource_tags
         WHERE resource_id IN (${ph})
         ORDER BY tag`,
      )
      .all(...ids);
    for (const t of tagRows) {
      const arr = tagMap.get(t.resource_id) ?? [];
      arr.push(t.tag);
      tagMap.set(t.resource_id, arr);
    }
  }

  return rows.map((r) => rowToPoolResource(r, tagMap.get(r.id) ?? []));
}

/** All distinct tags in the pool, with usage counts. */
export function listAllTags(): { tag: string; count: number }[] {
  const rows = db()
    .prepare<[], { tag: string; count: number }>(
      `SELECT tag, COUNT(*) AS count
       FROM pool_resource_tags
       GROUP BY tag
       ORDER BY count DESC, tag ASC`,
    )
    .all();
  return rows;
}

export function deletePoolResource(id: string): boolean {
  const info = db().prepare(`DELETE FROM pool_resources WHERE id = ?`).run(id);
  if (info.changes > 0) {
    logEvent("pool.resource.delete", id);
  }
  return info.changes > 0;
}

export function poolResourceCount(): number {
  const row = db()
    .prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM pool_resources`)
    .get();
  return row?.c ?? 0;
}
