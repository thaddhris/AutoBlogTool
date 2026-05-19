import { nanoid } from "nanoid";
import { db, logEvent } from "./db";
import { BlogRequest, RequestStatus } from "./types";

interface RequestRow {
  id: string;
  label: string;
  topic: string;
  keywords_json: string;
  instructions: string;
  tags_json: string | null;
  priority: number;
  status: string;
  blog_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRequest(r: RequestRow): BlogRequest {
  return {
    id: r.id,
    label: r.label,
    topic: r.topic,
    keywords: safeArray(r.keywords_json),
    instructions: r.instructions,
    tags: safeArray(r.tags_json ?? "[]"),
    priority: r.priority,
    status: r.status as RequestStatus,
    blog_id: r.blog_id,
    last_error: r.last_error,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function safeArray(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export interface CreateRequestInput {
  label: string;
  topic: string;
  keywords?: string[];
  instructions?: string;
  tags?: string[];
  priority?: number;
}

export function createRequest(input: CreateRequestInput): BlogRequest {
  const id = nanoid(12);
  db()
    .prepare(
      `INSERT INTO blog_requests
         (id, label, topic, keywords_json, instructions, tags_json, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.label,
      input.topic,
      JSON.stringify(input.keywords ?? []),
      input.instructions ?? "",
      JSON.stringify(normalizeTags(input.tags ?? [])),
      input.priority ?? 0,
    );
  logEvent("request.create", input.label, { requestId: id });
  return getRequest(id)!;
}

/**
 * Canonicalize tag strings: lowercase, trim, collapse internal whitespace
 * to a single hyphen, drop empty entries, dedupe. So "AI", "ai ", and
 * "  AI  " all become "ai"; "Predictive Maintenance" becomes
 * "predictive-maintenance".
 */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const clean = raw
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-");
    if (!clean) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export function getRequest(id: string): BlogRequest | null {
  const row = db()
    .prepare<[string], RequestRow>(`SELECT * FROM blog_requests WHERE id = ?`)
    .get(id);
  return row ? rowToRequest(row) : null;
}

export function listRequests(opts?: {
  status?: RequestStatus;
  limit?: number;
}): BlogRequest[] {
  const where = opts?.status ? `WHERE status = ?` : "";
  const limit = opts?.limit ?? 500;
  const params: (string | number)[] = opts?.status
    ? [opts.status, limit]
    : [limit];
  const rows = db()
    .prepare(
      `SELECT * FROM blog_requests ${where}
       ORDER BY priority DESC, created_at ASC LIMIT ?`,
    )
    .all(...params) as RequestRow[];
  return rows.map(rowToRequest);
}

export function updateRequest(
  id: string,
  patch: Partial<{
    label: string;
    topic: string;
    keywords: string[];
    instructions: string;
    tags: string[];
    priority: number;
    status: RequestStatus;
    blog_id: string | null;
    last_error: string | null;
  }>,
): BlogRequest | null {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.label !== undefined) {
    fields.push("label = ?");
    values.push(patch.label);
  }
  if (patch.topic !== undefined) {
    fields.push("topic = ?");
    values.push(patch.topic);
  }
  if (patch.keywords !== undefined) {
    fields.push("keywords_json = ?");
    values.push(JSON.stringify(patch.keywords));
  }
  if (patch.instructions !== undefined) {
    fields.push("instructions = ?");
    values.push(patch.instructions);
  }
  if (patch.tags !== undefined) {
    fields.push("tags_json = ?");
    values.push(JSON.stringify(normalizeTags(patch.tags)));
  }
  if (patch.priority !== undefined) {
    fields.push("priority = ?");
    values.push(patch.priority);
  }
  if (patch.status !== undefined) {
    fields.push("status = ?");
    values.push(patch.status);
  }
  if (patch.blog_id !== undefined) {
    fields.push("blog_id = ?");
    values.push(patch.blog_id);
  }
  if (patch.last_error !== undefined) {
    fields.push("last_error = ?");
    values.push(patch.last_error);
  }
  if (!fields.length) return getRequest(id);
  fields.push(`updated_at = datetime('now')`);
  db()
    .prepare(`UPDATE blog_requests SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values, id);
  return getRequest(id);
}

export function deleteRequest(id: string): boolean {
  const info = db().prepare(`DELETE FROM blog_requests WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function pickPending(limit: number): BlogRequest[] {
  const rows = db()
    .prepare(
      `SELECT * FROM blog_requests WHERE status = 'pending'
       ORDER BY priority DESC, created_at ASC LIMIT ?`,
    )
    .all(limit) as RequestRow[];
  return rows.map(rowToRequest);
}

export function statusCounts(): Record<RequestStatus, number> {
  const rows = db()
    .prepare<[], { status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM blog_requests GROUP BY status`,
    )
    .all();
  const out: Record<RequestStatus, number> = {
    pending: 0,
    processing: 0,
    draft: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
  };
  for (const r of rows) {
    if (r.status in out) out[r.status as RequestStatus] = r.n;
  }
  return out;
}
