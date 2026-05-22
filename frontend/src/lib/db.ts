import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.join(process.cwd(), ".data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "autoblog.db");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  migrate(instance);
  _db = instance;
  return _db;
}

/**
 * Idempotently add a column to a table. SQLite's ALTER TABLE ADD COLUMN
 * errors if the column already exists, so we probe first.
 */
function addColumn(
  d: Database.Database,
  table: string,
  column: string,
  ddl: string,
) {
  const existing = d
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  if (existing.some((c) => c.name === column)) return;
  d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- A Blog Request is a single unit of work in the queue.
    -- Each one becomes (at most) one Blog after AI generation.
    CREATE TABLE IF NOT EXISTS blog_requests (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      topic TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      instructions TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      blog_id TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_requests_status ON blog_requests(status);
    CREATE INDEX IF NOT EXISTS idx_requests_priority ON blog_requests(priority DESC, created_at ASC);

    -- Resources are scoped per-request: PDFs, docs, URLs, notes.
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES blog_requests(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_resources_request ON resources(request_id);

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL REFERENCES blog_requests(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_request ON chunks(request_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      request_id UNINDEXED,
      content='chunks',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content, request_id) VALUES (new.rowid, new.content, new.request_id);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content, request_id) VALUES('delete', old.rowid, old.content, old.request_id);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content, request_id) VALUES('delete', old.rowid, old.content, old.request_id);
      INSERT INTO chunks_fts(rowid, content, request_id) VALUES (new.rowid, new.content, new.request_id);
    END;

    CREATE TABLE IF NOT EXISTS blogs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES blog_requests(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      content_md TEXT NOT NULL DEFAULT '',
      meta_title TEXT NOT NULL DEFAULT '',
      meta_desc TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      faq_json TEXT NOT NULL DEFAULT '[]',
      schema_json TEXT NOT NULL DEFAULT '{}',
      banner_url TEXT,
      banner_alt TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      published_at TEXT,
      published_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status);
    CREATE INDEX IF NOT EXISTS idx_blogs_scheduled_at ON blogs(scheduled_at);

    -- Centralized resource pool. Resources here are reusable across many
    -- blog requests via tag matching, complementing the per-request
    -- resources table above.
    CREATE TABLE IF NOT EXISTS pool_resources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pool_resource_tags (
      resource_id TEXT NOT NULL REFERENCES pool_resources(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (resource_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_pool_resource_tags_tag
      ON pool_resource_tags(tag);

    CREATE TABLE IF NOT EXISTS pool_chunks (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL REFERENCES pool_resources(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pool_chunks_resource
      ON pool_chunks(resource_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS pool_chunks_fts USING fts5(
      content,
      resource_id UNINDEXED,
      content='pool_chunks',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS pool_chunks_ai
      AFTER INSERT ON pool_chunks BEGIN
      INSERT INTO pool_chunks_fts(rowid, content, resource_id)
        VALUES (new.rowid, new.content, new.resource_id);
    END;
    CREATE TRIGGER IF NOT EXISTS pool_chunks_ad
      AFTER DELETE ON pool_chunks BEGIN
      INSERT INTO pool_chunks_fts(pool_chunks_fts, rowid, content, resource_id)
        VALUES('delete', old.rowid, old.content, old.resource_id);
    END;
    CREATE TRIGGER IF NOT EXISTS pool_chunks_au
      AFTER UPDATE ON pool_chunks BEGIN
      INSERT INTO pool_chunks_fts(pool_chunks_fts, rowid, content, resource_id)
        VALUES('delete', old.rowid, old.content, old.resource_id);
      INSERT INTO pool_chunks_fts(rowid, content, resource_id)
        VALUES (new.rowid, new.content, new.resource_id);
    END;

    CREATE TABLE IF NOT EXISTS run_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT,
      blog_id TEXT,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Phase-A SEO columns. All nullable so existing rows keep working.
  // Naming uses the SEO-spec terms; legacy columns kept as-is for back-compat:
  //   meta_title   ↔ title_tag (legacy column, still the canonical title tag)
  //   meta_desc    ↔ meta_description (legacy column)
  //   banner_url   ↔ hero_image_url (legacy column)
  //   banner_alt   ↔ hero_image_alt (legacy column)
  //   excerpt      ↔ short hook (kept; tldr is new and distinct)
  addColumn(d, "blogs", "h1", "TEXT");
  addColumn(d, "blogs", "primary_keyword", "TEXT");
  addColumn(d, "blogs", "secondary_keywords_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn(d, "blogs", "focus_intent", "TEXT"); // informational|commercial|transactional
  addColumn(d, "blogs", "tldr", "TEXT");
  addColumn(d, "blogs", "readability_score", "REAL");
  addColumn(d, "blogs", "keyword_density", "REAL");
  addColumn(d, "blogs", "uniqueness_score", "REAL");
  addColumn(d, "blogs", "quality_warnings_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn(d, "blogs", "claims_to_verify_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn(d, "blogs", "author", "TEXT");
  addColumn(d, "blogs", "reviewed_by", "TEXT");
  addColumn(d, "blogs", "sources_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn(d, "blogs", "internal_links_resolved", "INTEGER NOT NULL DEFAULT 0");
  addColumn(d, "blogs", "word_count", "INTEGER");

  // Tag set selected at request-creation time. Pool resources whose tags
  // overlap with this set are auto-attached at generation time.
  addColumn(d, "blog_requests", "tags_json", "TEXT NOT NULL DEFAULT '[]'");

  // Optional per-request Webflow collection override. NULL → fall back to
  // settings.webflow_collection_id at publish time. Set per-request to
  // route specific posts to a different collection (e.g. one batch to a
  // staging collection, another to prod).
  addColumn(d, "blog_requests", "collection_id", "TEXT");

  // Cached DataForSEO SERP insights for the request's primary keyword.
  // Populated either by the admin clicking "Analyze SERP" on the request
  // page or by the pipeline on the first generation. Cached so regenerates
  // don't re-bill DataForSEO. Stored as the full SerpInsights JSON.
  addColumn(d, "blog_requests", "serp_analysis_json", "TEXT");

  // LLM-powered SEO audit caches. Populated when the admin clicks "Run SEO
  // audit" on a blog; we cache so the editor doesn't burn tokens on every
  // page load. Nullable — absence means "no audit run yet".
  //  - seo_audit_json:      traditional SEO (Google-style ranker view)
  //  - llm_seo_audit_json:  LLM/AI crawlability (RAG / AI-search view)
  addColumn(d, "blogs", "seo_audit_json", "TEXT");
  addColumn(d, "blogs", "seo_audit_at", "TEXT");
  addColumn(d, "blogs", "llm_seo_audit_json", "TEXT");
  addColumn(d, "blogs", "llm_seo_audit_at", "TEXT");
}

export function logEvent(
  kind: string,
  message: string,
  opts?: { requestId?: string; blogId?: string; payload?: unknown },
) {
  try {
    db()
      .prepare(
        `INSERT INTO run_log (kind, message, request_id, blog_id, payload) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        kind,
        message,
        opts?.requestId ?? null,
        opts?.blogId ?? null,
        opts?.payload ? JSON.stringify(opts.payload) : null,
      );
  } catch {
    // logging must never throw
  }
}
