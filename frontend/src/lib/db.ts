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
