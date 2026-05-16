import { db } from "./db";
import { Blog, BlogStatus } from "./types";

interface BlogRow {
  id: string;
  request_id: string;
  title: string;
  slug: string;
  excerpt: string;
  content_md: string;
  meta_title: string;
  meta_desc: string;
  keywords_json: string;
  tags_json: string;
  faq_json: string;
  schema_json: string;
  banner_url: string | null;
  banner_alt: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
}

function safeArr<T>(s: string, fallback: T[]): T[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function rowToBlog(r: BlogRow): Blog {
  return {
    id: r.id,
    request_id: r.request_id,
    title: r.title,
    slug: r.slug,
    excerpt: r.excerpt,
    content_md: r.content_md,
    meta_title: r.meta_title,
    meta_desc: r.meta_desc,
    keywords: safeArr<string>(r.keywords_json, []),
    tags: safeArr<string>(r.tags_json, []),
    faq: safeArr<{ q: string; a: string }>(r.faq_json, []),
    schema_json: r.schema_json,
    banner_url: r.banner_url,
    banner_alt: r.banner_alt,
    status: r.status as BlogStatus,
    scheduled_at: r.scheduled_at,
    published_at: r.published_at,
    published_url: r.published_url,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function getBlog(id: string): Blog | null {
  const row = db()
    .prepare<[string], BlogRow>(`SELECT * FROM blogs WHERE id = ?`)
    .get(id);
  return row ? rowToBlog(row) : null;
}

export function getBlogByRequest(requestId: string): Blog | null {
  const row = db()
    .prepare<[string], BlogRow>(`SELECT * FROM blogs WHERE request_id = ?`)
    .get(requestId);
  return row ? rowToBlog(row) : null;
}

export function listBlogs(opts?: {
  status?: BlogStatus | BlogStatus[];
  limit?: number;
}): Blog[] {
  let where = "";
  const params: (string | number)[] = [];
  if (opts?.status) {
    const arr = Array.isArray(opts.status) ? opts.status : [opts.status];
    where = `WHERE status IN (${arr.map(() => "?").join(",")})`;
    params.push(...arr);
  }
  params.push(opts?.limit ?? 500);
  const rows = db()
    .prepare(`SELECT * FROM blogs ${where} ORDER BY updated_at DESC LIMIT ?`)
    .all(...params) as BlogRow[];
  return rows.map(rowToBlog);
}

export function updateBlog(
  id: string,
  patch: Partial<{
    title: string;
    slug: string;
    excerpt: string;
    content_md: string;
    meta_title: string;
    meta_desc: string;
    keywords: string[];
    tags: string[];
    faq: { q: string; a: string }[];
    schema_json: string;
    banner_url: string | null;
    banner_alt: string | null;
    status: BlogStatus;
    scheduled_at: string | null;
    published_at: string | null;
    published_url: string | null;
  }>,
): Blog | null {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  const setField = (col: string, val: string | number | null) => {
    fields.push(`${col} = ?`);
    values.push(val);
  };
  if (patch.title !== undefined) setField("title", patch.title);
  if (patch.slug !== undefined) setField("slug", patch.slug);
  if (patch.excerpt !== undefined) setField("excerpt", patch.excerpt);
  if (patch.content_md !== undefined) setField("content_md", patch.content_md);
  if (patch.meta_title !== undefined) setField("meta_title", patch.meta_title);
  if (patch.meta_desc !== undefined) setField("meta_desc", patch.meta_desc);
  if (patch.keywords !== undefined)
    setField("keywords_json", JSON.stringify(patch.keywords));
  if (patch.tags !== undefined) setField("tags_json", JSON.stringify(patch.tags));
  if (patch.faq !== undefined) setField("faq_json", JSON.stringify(patch.faq));
  if (patch.schema_json !== undefined)
    setField("schema_json", patch.schema_json);
  if (patch.banner_url !== undefined) setField("banner_url", patch.banner_url);
  if (patch.banner_alt !== undefined) setField("banner_alt", patch.banner_alt);
  if (patch.status !== undefined) setField("status", patch.status);
  if (patch.scheduled_at !== undefined)
    setField("scheduled_at", patch.scheduled_at);
  if (patch.published_at !== undefined)
    setField("published_at", patch.published_at);
  if (patch.published_url !== undefined)
    setField("published_url", patch.published_url);
  if (!fields.length) return getBlog(id);
  fields.push(`updated_at = datetime('now')`);
  db().prepare(`UPDATE blogs SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values, id);
  return getBlog(id);
}

/**
 * Drafts whose auto-publish timer has elapsed. Includes legacy 'scheduled'
 * rows from the old data model so they still get drained.
 */
export function dueDrafts(now = new Date()): Blog[] {
  const rows = db()
    .prepare(
      `SELECT * FROM blogs
       WHERE status IN ('draft','scheduled')
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= ?
       ORDER BY scheduled_at ASC`,
    )
    .all(now.toISOString()) as BlogRow[];
  return rows.map(rowToBlog);
}

export function blogStatusCounts(): Record<BlogStatus, number> {
  const rows = db()
    .prepare<[], { status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM blogs GROUP BY status`,
    )
    .all();
  const out: Record<BlogStatus, number> = {
    draft: 0,
    scheduled: 0,
    publishing: 0,
    published: 0,
    failed: 0,
  };
  for (const r of rows) {
    if (r.status in out) out[r.status as BlogStatus] = r.n;
  }
  return out;
}
