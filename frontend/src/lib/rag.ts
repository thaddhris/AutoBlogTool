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
