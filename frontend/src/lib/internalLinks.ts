import { db } from "./db";
import { getSettings } from "./settings";

const PLACEHOLDER_RE = /\[\[related:\s*([^\]]+?)\s*]]/gi;

interface PostRow {
  id: string;
  slug: string;
  title: string;
  primary_keyword: string | null;
  keywords_json: string;
  secondary_keywords_json: string | null;
}

interface ScoredPost {
  id: string;
  slug: string;
  title: string;
  score: number;
}

function toLowerWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9'-]*/g) ?? []).filter(
    (w) => w.length > 2,
  );
}

function safeJsonArr(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Pick the best published post for a `[[related: X]]` placeholder using
 * simple keyword overlap. Higher scores for matches against
 * `primary_keyword`, then `secondary_keywords`, then the generic
 * `keywords` array, then the title.
 *
 * Returns null if nothing scores above zero.
 *
 * NOTE: marked simple/local. To switch to embeddings later, replace just
 * this function with a vector-similarity lookup.
 */
export function findBestRelatedPost(
  placeholderText: string,
  excludeBlogId: string | null,
): ScoredPost | null {
  const needleWords = new Set(toLowerWords(placeholderText));
  if (needleWords.size === 0) return null;

  const rows = db()
    .prepare<[], PostRow>(
      `SELECT id, slug, title, primary_keyword, keywords_json, secondary_keywords_json
       FROM blogs
       WHERE status = 'published'`,
    )
    .all();

  let best: ScoredPost | null = null;
  for (const r of rows) {
    if (excludeBlogId && r.id === excludeBlogId) continue;

    const titleWords = new Set(toLowerWords(r.title));
    const primary = r.primary_keyword
      ? new Set(toLowerWords(r.primary_keyword))
      : new Set<string>();
    const secondary = new Set(
      safeJsonArr(r.secondary_keywords_json).flatMap(toLowerWords),
    );
    const generic = new Set(
      safeJsonArr(r.keywords_json).flatMap(toLowerWords),
    );

    let score = 0;
    for (const w of needleWords) {
      if (primary.has(w)) score += 4;
      if (secondary.has(w)) score += 3;
      if (generic.has(w)) score += 2;
      if (titleWords.has(w)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: r.id, slug: r.slug, title: r.title, score };
    }
  }
  return best;
}

export interface ResolveResult {
  body: string;
  resolved: number; // count of placeholders that became links
  skipped: number; // count removed because no match was found
}

/**
 * Walk `[[related: ...]]` placeholders in markdown body. For each:
 *   - find the best published post via keyword overlap
 *   - replace with `[<post title>](<absolute blog URL>)`
 *   - if nothing matches, drop the placeholder entirely (leaves surrounding
 *     prose intact)
 */
export function resolveInternalLinks(
  body: string,
  excludeBlogId: string | null,
): ResolveResult {
  const settings = getSettings();
  const base = (settings.site_url || "").replace(/\/$/, "");
  let resolved = 0;
  let skipped = 0;
  const next = body.replace(PLACEHOLDER_RE, (_match, term: string) => {
    const best = findBestRelatedPost(term, excludeBlogId);
    if (!best) {
      skipped++;
      return "";
    }
    resolved++;
    const href = base ? `${base}/blog/${best.slug}` : `/blog/${best.slug}`;
    return `[${best.title}](${href})`;
  });
  // Collapse the empty space we may have left behind from `skipped` cases.
  const cleaned = next.replace(/[ \t]{2,}/g, " ").replace(/ \./g, ".");
  return { body: cleaned, resolved, skipped };
}
