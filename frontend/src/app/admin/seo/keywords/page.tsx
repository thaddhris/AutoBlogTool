import { getSettings } from "@/lib/settings";
import KeywordsView from "./KeywordsView";
import { COMMON_LANGUAGES, COMMON_LOCATIONS } from "@/lib/dataforseo";
import { listKeywordSessions } from "@/lib/keywordSessions";
import { listRequests } from "@/lib/requests";
import { listBlogs } from "@/lib/blogs";

export const dynamic = "force-dynamic";

/**
 * Server component for the keyword opportunities page. Loads:
 *   - DataForSEO credential status
 *   - Default filter values from Settings
 *   - The 30 most recent saved keyword-research sessions
 *   - A set of normalised keyword strings that already correspond to a
 *     Blog Request OR a generated blog, so the client can render an
 *     "already created" badge per row.
 */
export default async function KeywordsPage() {
  const s = getSettings();
  const credsReady = Boolean(
    (s.dataforseo_login || "").trim() &&
      (s.dataforseo_password || "").trim(),
  );

  const sessions = listKeywordSessions({ limit: 30 });

  // Build the "already-known keywords" set so the UI can flag rows the
  // admin has already converted to a request (or that match an existing
  // blog's primary keyword). Normalised the same way topic discovery
  // normalises (lowercase + whitespace collapsed).
  const knownKeywords = new Set<string>();
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  for (const r of listRequests()) {
    if (r.label) knownKeywords.add(norm(r.label));
    if (r.topic) knownKeywords.add(norm(r.topic));
    for (const k of r.keywords) knownKeywords.add(norm(k));
  }
  for (const b of listBlogs()) {
    if (b.title) knownKeywords.add(norm(b.title));
    if (b.primary_keyword) knownKeywords.add(norm(b.primary_keyword));
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Keyword opportunities
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Enter one or more seed terms and we&apos;ll pull related keywords
          from DataForSEO with monthly volume, keyword difficulty, intent,
          and CPC. Every search is saved so you can revisit research later
          without paying for the same call twice.
        </p>
      </div>
      <KeywordsView
        credsReady={credsReady}
        defaultLocationCode={s.dataforseo_location_code || 2840}
        defaultLanguageCode={s.dataforseo_language_code || "en"}
        defaultMinVolume={s.dataforseo_min_search_volume ?? 100}
        defaultMaxKd={s.dataforseo_max_keyword_difficulty ?? 60}
        locationOptions={COMMON_LOCATIONS}
        languageOptions={COMMON_LANGUAGES}
        initialSessions={sessions}
        knownKeywords={Array.from(knownKeywords)}
      />
    </div>
  );
}
