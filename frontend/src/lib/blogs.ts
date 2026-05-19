import { db } from "./db";
import {
  Blog,
  BlogStatus,
  FocusIntent,
  LlmSeoAudit,
  QualityWarning,
  SeoAudit,
} from "./types";

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
  // Phase-A SEO columns (nullable on existing rows)
  h1: string | null;
  primary_keyword: string | null;
  secondary_keywords_json: string | null;
  focus_intent: string | null;
  tldr: string | null;
  readability_score: number | null;
  keyword_density: number | null;
  uniqueness_score: number | null;
  quality_warnings_json: string | null;
  claims_to_verify_json: string | null;
  author: string | null;
  reviewed_by: string | null;
  sources_json: string | null;
  internal_links_resolved: number | null;
  word_count: number | null;
  seo_audit_json: string | null;
  llm_seo_audit_json: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
}

function safeArr<T>(s: string | null | undefined, fallback: T[]): T[] {
  if (!s) return fallback;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseSeoAudit(s: string | null | undefined): SeoAudit | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && typeof v.overall_score === "number") {
      return v as SeoAudit;
    }
    return null;
  } catch {
    return null;
  }
}

function parseLlmSeoAudit(s: string | null | undefined): LlmSeoAudit | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && typeof v.overall_score === "number") {
      return v as LlmSeoAudit;
    }
    return null;
  } catch {
    return null;
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
    h1: r.h1,
    primary_keyword: r.primary_keyword,
    secondary_keywords: safeArr<string>(r.secondary_keywords_json, []),
    focus_intent: (r.focus_intent as FocusIntent | null) ?? null,
    tldr: r.tldr,
    readability_score: r.readability_score,
    keyword_density: r.keyword_density,
    uniqueness_score: r.uniqueness_score,
    quality_warnings: safeArr<QualityWarning>(r.quality_warnings_json, []),
    claims_to_verify: safeArr<string>(r.claims_to_verify_json, []),
    author: r.author,
    reviewed_by: r.reviewed_by,
    sources: safeArr<string>(r.sources_json, []),
    internal_links_resolved: r.internal_links_resolved ?? 0,
    word_count: r.word_count,
    seo_audit: parseSeoAudit(r.seo_audit_json),
    llm_seo_audit: parseLlmSeoAudit(r.llm_seo_audit_json),
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

export type BlogPatch = Partial<{
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
  h1: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  focus_intent: FocusIntent | null;
  tldr: string | null;
  readability_score: number | null;
  keyword_density: number | null;
  uniqueness_score: number | null;
  quality_warnings: QualityWarning[];
  claims_to_verify: string[];
  author: string | null;
  reviewed_by: string | null;
  sources: string[];
  internal_links_resolved: number;
  word_count: number | null;
  seo_audit: SeoAudit | null;
  llm_seo_audit: LlmSeoAudit | null;
  status: BlogStatus;
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
}>;

export function updateBlog(id: string, patch: BlogPatch): Blog | null {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  const setField = (col: string, val: string | number | null) => {
    fields.push(`${col} = ?`);
    values.push(val);
  };
  // Direct-mapped scalar fields
  if (patch.title !== undefined) setField("title", patch.title);
  if (patch.slug !== undefined) setField("slug", patch.slug);
  if (patch.excerpt !== undefined) setField("excerpt", patch.excerpt);
  if (patch.content_md !== undefined) setField("content_md", patch.content_md);
  if (patch.meta_title !== undefined) setField("meta_title", patch.meta_title);
  if (patch.meta_desc !== undefined) setField("meta_desc", patch.meta_desc);
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
  // JSON-encoded array fields
  if (patch.keywords !== undefined)
    setField("keywords_json", JSON.stringify(patch.keywords));
  if (patch.tags !== undefined) setField("tags_json", JSON.stringify(patch.tags));
  if (patch.faq !== undefined) setField("faq_json", JSON.stringify(patch.faq));
  // Phase-A SEO additions
  if (patch.h1 !== undefined) setField("h1", patch.h1);
  if (patch.primary_keyword !== undefined)
    setField("primary_keyword", patch.primary_keyword);
  if (patch.secondary_keywords !== undefined)
    setField(
      "secondary_keywords_json",
      JSON.stringify(patch.secondary_keywords),
    );
  if (patch.focus_intent !== undefined)
    setField("focus_intent", patch.focus_intent);
  if (patch.tldr !== undefined) setField("tldr", patch.tldr);
  if (patch.readability_score !== undefined)
    setField("readability_score", patch.readability_score);
  if (patch.keyword_density !== undefined)
    setField("keyword_density", patch.keyword_density);
  if (patch.uniqueness_score !== undefined)
    setField("uniqueness_score", patch.uniqueness_score);
  if (patch.quality_warnings !== undefined)
    setField("quality_warnings_json", JSON.stringify(patch.quality_warnings));
  if (patch.claims_to_verify !== undefined)
    setField("claims_to_verify_json", JSON.stringify(patch.claims_to_verify));
  if (patch.author !== undefined) setField("author", patch.author);
  if (patch.reviewed_by !== undefined)
    setField("reviewed_by", patch.reviewed_by);
  if (patch.sources !== undefined)
    setField("sources_json", JSON.stringify(patch.sources));
  if (patch.internal_links_resolved !== undefined)
    setField("internal_links_resolved", patch.internal_links_resolved);
  if (patch.word_count !== undefined) setField("word_count", patch.word_count);
  if (patch.seo_audit !== undefined) {
    if (patch.seo_audit === null) {
      setField("seo_audit_json", null);
      setField("seo_audit_at", null);
    } else {
      setField("seo_audit_json", JSON.stringify(patch.seo_audit));
      setField("seo_audit_at", patch.seo_audit.generated_at);
    }
  }
  if (patch.llm_seo_audit !== undefined) {
    if (patch.llm_seo_audit === null) {
      setField("llm_seo_audit_json", null);
      setField("llm_seo_audit_at", null);
    } else {
      setField("llm_seo_audit_json", JSON.stringify(patch.llm_seo_audit));
      setField("llm_seo_audit_at", patch.llm_seo_audit.generated_at);
    }
  }

  if (!fields.length) return getBlog(id);
  fields.push(`updated_at = datetime('now')`);
  db()
    .prepare(`UPDATE blogs SET ${fields.join(", ")} WHERE id = ?`)
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
