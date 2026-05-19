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
 * tags overlap with the supplied tag set.
 *
 * Strategy:
 *   1. Find every pool resource whose tags overlap with `tags` (status=ready).
 *   2. Within that set, run FTS5 on `query` and take the top-ranked chunks.
 *   3. If FTS didn't cover the limit OR some tagged resources had zero FTS
 *      hits, top up with the first chunk of each uncovered resource. This
 *      guarantees that explicitly tagged resources always make it into the
 *      source block even when the post topic doesn't share keywords with the
 *      document (e.g. a "company overview" doc tagged on every post).
 *   4. Annotate each returned row with the tag list of its parent resource.
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

  // ── Step 1: tagged + ready resources ─────────────────────────────────────
  const tagPh = tags.map(() => "?").join(",");
  const taggedIds = db()
    .prepare<string[], { resource_id: string }>(
      `SELECT DISTINCT r.id AS resource_id
       FROM pool_resources r
       JOIN pool_resource_tags t ON t.resource_id = r.id
       WHERE t.tag IN (${tagPh}) AND r.status = 'ready'`,
    )
    .all(...tags)
    .map((r) => r.resource_id);
  if (taggedIds.length === 0) return [];

  type Hit = {
    content: string;
    resource_id: string;
    resource_name: string;
  };
  const idPh = taggedIds.map(() => "?").join(",");

  // ── Step 2: FTS-ranked chunks within the tagged set ──────────────────────
  let hits: Hit[] = [];
  const q = ftsQueryFromTerms([query]);
  if (q) {
    try {
      hits = db()
        .prepare(
          `SELECT c.content AS content,
                  c.resource_id AS resource_id,
                  r.name AS resource_name
           FROM pool_chunks_fts f
           JOIN pool_chunks c ON c.rowid = f.rowid
           JOIN pool_resources r ON r.id = c.resource_id
           WHERE pool_chunks_fts MATCH ?
             AND c.resource_id IN (${idPh})
           ORDER BY rank
           LIMIT ?`,
        )
        .all(q, ...taggedIds, limit) as Hit[];
    } catch {
      hits = [];
    }
  }

  // ── Step 3: coverage fallback ────────────────────────────────────────────
  // Any tagged resource without an FTS hit gets its FIRST FEW chunks added
  // so the model sees real content even when the topic doesn't overlap the
  // document text. Two chunks per resource is the sweet spot: handles the
  // common case where a doc opens with a cover page (mostly metadata) and
  // real content starts in the second chunk. Cheap insurance against the
  // "tag matched but useless content" failure mode.
  const COVERAGE_PER_RESOURCE = 2;
  const seen = new Set(hits.map((h) => h.resource_id));
  const uncovered = taggedIds.filter((id) => !seen.has(id));
  const remaining = Math.max(0, limit - hits.length);
  if (uncovered.length > 0 && remaining > 0) {
    const maxResources = Math.ceil(remaining / COVERAGE_PER_RESOURCE);
    const take = uncovered.slice(0, maxResources);
    const takePh = take.map(() => "?").join(",");
    const coverage = db()
      .prepare(
        `SELECT c.content AS content,
                c.resource_id AS resource_id,
                r.name AS resource_name
         FROM pool_chunks c
         JOIN pool_resources r ON r.id = c.resource_id
         WHERE c.resource_id IN (${takePh})
           AND c.position < ${COVERAGE_PER_RESOURCE}
         ORDER BY c.resource_id, c.position`,
      )
      .all(...take) as Hit[];
    hits.push(...coverage.slice(0, remaining));
  }

  if (hits.length === 0) return [];

  // ── Step 4: annotate with tags ───────────────────────────────────────────
  const hitIds = Array.from(new Set(hits.map((r) => r.resource_id)));
  const hitIdPh = hitIds.map(() => "?").join(",");
  const tagRows = db()
    .prepare<string[], { resource_id: string; tag: string }>(
      `SELECT resource_id, tag FROM pool_resource_tags
       WHERE resource_id IN (${hitIdPh})`,
    )
    .all(...hitIds);
  const tagMap = new Map<string, string[]>();
  for (const t of tagRows) {
    const arr = tagMap.get(t.resource_id) ?? [];
    arr.push(t.tag);
    tagMap.set(t.resource_id, arr);
  }
  return hits.map((r) => ({
    ...r,
    tags: tagMap.get(r.resource_id) ?? [],
  }));
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
