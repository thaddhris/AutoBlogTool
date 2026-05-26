import { nanoid } from "nanoid";
import { db } from "./db";
import type { KeywordIdea } from "./dataforseo";

// ─── Keyword research session persistence ──────────────────────────────────
//
// Every search on /admin/seo/keywords is stashed here so admins can revisit
// past research without burning another DataForSEO call. Ideas are stored
// verbatim along with the filter configuration that produced them.

export interface KeywordSession {
  id: string;
  seeds: string[];
  location_code: number;
  language_code: string;
  min_volume: number;
  max_kd: number;
  limit_requested: number;
  ideas: KeywordIdea[];
  cost_usd: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Lightweight summary returned by `listKeywordSessions` — omits the heavy
 *  `ideas` array so the list endpoint stays cheap. */
export interface KeywordSessionSummary {
  id: string;
  seeds: string[];
  location_code: number;
  language_code: string;
  ideas_count: number;
  cost_usd: number;
  notes: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  seeds_json: string;
  location_code: number;
  language_code: string;
  min_volume: number;
  max_kd: number;
  limit_requested: number;
  ideas_json: string;
  cost_usd: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

function rowToSession(r: SessionRow): KeywordSession {
  return {
    id: r.id,
    seeds: safeJsonArray<string>(r.seeds_json),
    location_code: r.location_code,
    language_code: r.language_code,
    min_volume: r.min_volume,
    max_kd: r.max_kd,
    limit_requested: r.limit_requested,
    ideas: safeJsonArray<KeywordIdea>(r.ideas_json),
    cost_usd: r.cost_usd,
    notes: r.notes ?? "",
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function safeJsonArray<T>(s: string): T[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export interface SaveSessionInput {
  seeds: string[];
  location_code: number;
  language_code: string;
  min_volume: number;
  max_kd: number;
  limit_requested: number;
  ideas: KeywordIdea[];
  cost_usd: number;
}

export function saveKeywordSession(input: SaveSessionInput): KeywordSession {
  const id = nanoid(12);
  db()
    .prepare(
      `INSERT INTO keyword_research_sessions
         (id, seeds_json, location_code, language_code, min_volume, max_kd,
          limit_requested, ideas_json, cost_usd, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
    )
    .run(
      id,
      JSON.stringify(input.seeds),
      input.location_code,
      input.language_code,
      input.min_volume,
      input.max_kd,
      input.limit_requested,
      JSON.stringify(input.ideas),
      input.cost_usd,
    );
  return getKeywordSession(id)!;
}

export function getKeywordSession(id: string): KeywordSession | null {
  const row = db()
    .prepare<[string], SessionRow>(
      `SELECT * FROM keyword_research_sessions WHERE id = ?`,
    )
    .get(id);
  return row ? rowToSession(row) : null;
}

/**
 * Return recent sessions sorted by created_at desc. Summaries only —
 * doesn't carry the ideas array, so the list endpoint stays cheap even
 * with hundreds of saved sessions.
 */
export function listKeywordSessions(
  opts?: { limit?: number },
): KeywordSessionSummary[] {
  const rows = db()
    .prepare(
      `SELECT id, seeds_json, location_code, language_code, ideas_json,
              cost_usd, notes, created_at
       FROM keyword_research_sessions
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(opts?.limit ?? 30) as Array<{
    id: string;
    seeds_json: string;
    location_code: number;
    language_code: string;
    ideas_json: string;
    cost_usd: number;
    notes: string;
    created_at: string;
  }>;
  return rows.map((r) => {
    const ideas = safeJsonArray<KeywordIdea>(r.ideas_json);
    return {
      id: r.id,
      seeds: safeJsonArray<string>(r.seeds_json),
      location_code: r.location_code,
      language_code: r.language_code,
      ideas_count: ideas.length,
      cost_usd: r.cost_usd,
      notes: r.notes ?? "",
      created_at: r.created_at,
    };
  });
}

export function deleteKeywordSession(id: string): boolean {
  const res = db()
    .prepare(`DELETE FROM keyword_research_sessions WHERE id = ?`)
    .run(id);
  return res.changes > 0;
}

export function updateKeywordSessionNotes(
  id: string,
  notes: string,
): KeywordSession | null {
  db()
    .prepare(
      `UPDATE keyword_research_sessions
       SET notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(notes.slice(0, 1000), id);
  return getKeywordSession(id);
}
