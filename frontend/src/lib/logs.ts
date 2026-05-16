import { db } from "./db";

export interface LogEntry {
  id: number;
  kind: string;
  message: string;
  request_id: string | null;
  blog_id: string | null;
  payload: string | null;
  created_at: string;
}

export interface ListLogsOpts {
  kind?: string; // e.g. "request.generate.fail" or "request." (prefix)
  level?: "all" | "errors";
  since_id?: number;
  /** Inclusive lower bound on created_at (ISO string, UTC). */
  since?: string;
  /** Inclusive upper bound on created_at (ISO string, UTC). */
  until?: string;
  request_id?: string;
  blog_id?: string;
  limit?: number;
}

// SQLite stores datetime('now') as "YYYY-MM-DD HH:MM:SS" UTC, without a Z.
// We compare against the same shape, so normalize ISO inputs to that form.
function toSqliteUtc(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

const MAX_LIMIT = 500;

export function listLogs(opts: ListLogsOpts = {}): LogEntry[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (opts.kind) {
    if (opts.kind.endsWith(".")) {
      where.push("kind LIKE ?");
      params.push(`${opts.kind}%`);
    } else {
      where.push("kind = ?");
      params.push(opts.kind);
    }
  }

  if (opts.level === "errors") {
    where.push("(kind LIKE '%.fail' OR kind LIKE '%.error')");
  }

  if (opts.since_id !== undefined) {
    where.push("id > ?");
    params.push(opts.since_id);
  }

  if (opts.since) {
    const s = toSqliteUtc(opts.since);
    if (s) {
      where.push("created_at >= ?");
      params.push(s);
    }
  }

  if (opts.until) {
    const u = toSqliteUtc(opts.until);
    if (u) {
      where.push("created_at <= ?");
      params.push(u);
    }
  }

  if (opts.request_id) {
    where.push("request_id = ?");
    params.push(opts.request_id);
  }

  if (opts.blog_id) {
    where.push("blog_id = ?");
    params.push(opts.blog_id);
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? 200));
  params.push(limit);

  const sql = `SELECT id, kind, message, request_id, blog_id, payload, created_at
               FROM run_log
               ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY id DESC
               LIMIT ?`;
  return db().prepare(sql).all(...params) as LogEntry[];
}

export function clearLogs(): number {
  const info = db().prepare(`DELETE FROM run_log`).run();
  return info.changes;
}

/** Distinct `kind` values, sorted, for the filter dropdown. */
export function knownKinds(): string[] {
  const rows = db()
    .prepare<[], { kind: string }>(
      `SELECT DISTINCT kind FROM run_log ORDER BY kind ASC`,
    )
    .all();
  return rows.map((r) => r.kind);
}
