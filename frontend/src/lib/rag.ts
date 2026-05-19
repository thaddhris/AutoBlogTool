import { db } from "./db";

function ftsQueryFromTerms(terms: string[]): string {
  return terms
    .map((t) => t.replace(/[^a-z0-9\s]/gi, " ").trim())
    .filter(Boolean)
    .flatMap((t) => t.split(/\s+/))
    .filter((w) => w.length > 2)
    .slice(0, 20)
    .map((w) => `${w}*`)
    .join(" OR ");
}

export function retrieve(
  requestId: string,
  query: string,
  limit = 8,
): { content: string; resource_id: string }[] {
  const q = ftsQueryFromTerms([query]);
  if (!q) return [];
  try {
    return db()
      .prepare<
        [string, string, number],
        { content: string; resource_id: string }
      >(
        `SELECT c.content AS content, c.resource_id AS resource_id
         FROM chunks_fts f
         JOIN chunks c ON c.rowid = f.rowid
         WHERE chunks_fts MATCH ? AND c.request_id = ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(q, requestId, limit);
  } catch {
    return [];
  }
}

export function requestCorpusSnippet(requestId: string, max = 6000): string {
  const rows = db()
    .prepare<[string], { content: string }>(
      `SELECT content FROM chunks WHERE request_id = ? ORDER BY position ASC`,
    )
    .all(requestId);
  let out = "";
  for (const r of rows) {
    if (out.length + r.content.length > max) break;
    out += (out ? "\n\n" : "") + r.content;
  }
  return out;
}

/**
 * Retrieve from the centralized resource pool, scoped to resources whose
 * tags overlap with the supplied tag set. Returns FTS-ranked chunks with
 * their parent resource and matching tag(s) for traceability.
 *
 * If `tags` is empty, returns nothing — pool retrieval is opt-in per request.
 */
export function retrieveFromPool(
  query: string,
  tags: string[],
  limit = 8,
): {
  content: string;
  resource_id: string;
  resource_name: string;
  tags: string[];
}[] {
  if (tags.length === 0) return [];
  const q = ftsQueryFromTerms([query]);
  if (!q) return [];
  try {
    const tagPh = tags.map(() => "?").join(",");
    const rows = db()
      .prepare(
        `SELECT c.content AS content,
                c.resource_id AS resource_id,
                r.name AS resource_name
         FROM pool_chunks_fts f
         JOIN pool_chunks c ON c.rowid = f.rowid
         JOIN pool_resources r ON r.id = c.resource_id
         WHERE pool_chunks_fts MATCH ?
           AND c.resource_id IN (
             SELECT resource_id FROM pool_resource_tags
             WHERE tag IN (${tagPh})
           )
           AND r.status = 'ready'
         ORDER BY rank
         LIMIT ?`,
      )
      .all(q, ...tags, limit) as {
      content: string;
      resource_id: string;
      resource_name: string;
    }[];

    if (rows.length === 0) return [];

    // Annotate each row with the tags for its parent resource.
    const ids = Array.from(new Set(rows.map((r) => r.resource_id)));
    const idPh = ids.map(() => "?").join(",");
    const tagRows = db()
      .prepare<string[], { resource_id: string; tag: string }>(
        `SELECT resource_id, tag FROM pool_resource_tags
         WHERE resource_id IN (${idPh})`,
      )
      .all(...ids);
    const tagMap = new Map<string, string[]>();
    for (const t of tagRows) {
      const arr = tagMap.get(t.resource_id) ?? [];
      arr.push(t.tag);
      tagMap.set(t.resource_id, arr);
    }
    return rows.map((r) => ({
      ...r,
      tags: tagMap.get(r.resource_id) ?? [],
    }));
  } catch {
    return [];
  }
}

export function requestStats(requestId: string) {
  const resources = db()
    .prepare<[string], { count: number }>(
      `SELECT COUNT(*) AS count FROM resources WHERE request_id = ?`,
    )
    .get(requestId);
  const chunks = db()
    .prepare<[string], { count: number }>(
      `SELECT COUNT(*) AS count FROM chunks WHERE request_id = ?`,
    )
    .get(requestId);
  return { resources: resources?.count ?? 0, chunks: chunks?.count ?? 0 };
}
