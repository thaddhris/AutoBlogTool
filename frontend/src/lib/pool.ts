import { nanoid } from "nanoid";
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

/** Rename a pool resource. Other fields use dedicated functions. */
export function renamePoolResource(id: string, name: string): PoolResource | null {
  db()
    .prepare(
      `UPDATE pool_resources SET name = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(name, id);
  return getPoolResource(id);
}

/**
 * Replace the content of a note-type pool resource. Drops + recreates the
 * chunks (FTS triggers stay in sync automatically). Only supported for
 * `type='note'` — binary resources (pdf/docx) require a fresh upload and
 * url-type resources should be re-fetched.
 */
export function replaceNoteContent(
  id: string,
  text: string,
  chunkText: (s: string) => string[],
): PoolResource | null {
  const row = db()
    .prepare<[string], { type: string }>(
      `SELECT type FROM pool_resources WHERE id = ?`,
    )
    .get(id);
  if (!row) return null;
  if (row.type !== "note") {
    throw new Error(
      `replaceNoteContent only supports note-type resources (got '${row.type}'). Delete and re-upload instead.`,
    );
  }

  const chunks = chunkText(text);
  const tx = db().transaction(() => {
    db().prepare(`DELETE FROM pool_chunks WHERE resource_id = ?`).run(id);
    const insert = db().prepare(
      `INSERT INTO pool_chunks (id, resource_id, content, position)
       VALUES (?, ?, ?, ?)`,
    );
    for (let i = 0; i < chunks.length; i++) {
      insert.run(nanoid(12), id, chunks[i], i);
    }
    db()
      .prepare(
        `UPDATE pool_resources
         SET content = ?, status = 'ready', error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(text, id);
  });
  tx();
  logEvent("pool.resource.edit", id, { payload: { chunks: chunks.length } });
  return getPoolResource(id);
}

/**
 * Re-index a pool resource from its existing `content` (no re-fetch, no
 * re-extraction). Used to pick up improvements in the chunker or to recover
 * from a bad ingest without making the admin delete + re-upload. Note-type
 * resources can also use replaceNoteContent for the same effect; this one
 * works for every type as long as content is non-empty.
 */
export function reindexPoolResource(
  id: string,
  chunkText: (s: string) => string[],
): PoolResource | null {
  const row = db()
    .prepare<[string], { content: string }>(
      `SELECT content FROM pool_resources WHERE id = ?`,
    )
    .get(id);
  if (!row) return null;
  if (!row.content || !row.content.trim()) {
    throw new Error(
      "Resource has no stored content. Delete and re-upload to extract from the original source.",
    );
  }
  // Also strip any leftover "-- N of M --" page markers from older ingests.
  const cleaned = row.content
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const chunks = chunkText(cleaned);
  const tx = db().transaction(() => {
    db().prepare(`DELETE FROM pool_chunks WHERE resource_id = ?`).run(id);
    const insert = db().prepare(
      `INSERT INTO pool_chunks (id, resource_id, content, position)
       VALUES (?, ?, ?, ?)`,
    );
    for (let i = 0; i < chunks.length; i++) {
      insert.run(nanoid(12), id, chunks[i], i);
    }
    db()
      .prepare(
        `UPDATE pool_resources
         SET content = ?, status = 'ready', error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(cleaned, id);
  });
  tx();
  logEvent("pool.resource.reindex", id, {
    payload: { chunks: chunks.length, cleaned_length: cleaned.length },
  });
  return getPoolResource(id);
}

export function poolResourceCount(): number {
  const row = db()
    .prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM pool_resources`)
    .get();
  return row?.c ?? 0;
}
