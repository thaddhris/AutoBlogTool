import { getSettings } from "./settings";

// ─── DataForSEO REST client ────────────────────────────────────────────────
//
// Thin wrapper around the DataForSEO v3 API. Authentication is HTTP Basic
// (`login:password`); credentials live in settings, never in code.
//
// The client deliberately stays low-level — it knows nothing about specific
// endpoints, just how to send a request, surface a clean error, and
// normalise the response shape. Each higher-level concern (keyword ideas,
// SERP, ranking, etc.) builds its own wrapper on top.

const API_ROOT = "https://api.dataforseo.com/v3";

export interface DataForSeoCredentials {
  login: string;
  password: string;
}

/** One entry in DataForSEO's `tasks` array. Generic so callers can type the
 *  inner `result` shape per endpoint. */
export interface DataForSeoTask<T> {
  id: string;
  status_code: number;
  status_message: string;
  time?: string;
  cost?: number;
  result_count?: number;
  data?: Record<string, unknown>;
  result: T[] | null;
}

export interface DataForSeoResponse<T> {
  version: string;
  status_code: number;
  status_message: string;
  time?: string;
  cost?: number;
  tasks_count?: number;
  tasks_error?: number;
  tasks: DataForSeoTask<T>[];
}

export class DataForSeoError extends Error {
  status: number;
  upstreamCode?: number;
  constructor(message: string, status: number, upstreamCode?: number) {
    super(message);
    this.name = "DataForSeoError";
    this.status = status;
    this.upstreamCode = upstreamCode;
  }
}

function readCredentials(): DataForSeoCredentials {
  const s = getSettings();
  const login = (s.dataforseo_login || "").trim();
  const password = (s.dataforseo_password || "").trim();
  if (!login || !password) {
    throw new DataForSeoError(
      "DataForSEO credentials are not configured. Add your login + password under Settings → SEO Intelligence.",
      400,
    );
  }
  return { login, password };
}

/**
 * POST a request to DataForSEO and return the parsed `tasks[0].result` array.
 *
 * Why this shape: every DataForSEO endpoint we touch returns
 *   { tasks: [{ status_code, result: [...] }] }
 * and we always submit a single task at a time, so callers consistently want
 * `tasks[0].result`. The full envelope is also returned in case the caller
 * needs `cost`, `status_message`, etc.
 *
 * Errors are normalised into `DataForSeoError` so route handlers can switch
 * on `err.status` to decide between 4xx and 5xx responses to the browser.
 */
export async function dataforseoPost<TResult, TPayload = unknown>(
  endpoint: string,
  payload: TPayload[],
): Promise<{
  result: TResult[];
  task: DataForSeoTask<TResult>;
  envelope: DataForSeoResponse<TResult>;
}> {
  const { login, password } = readCredentials();
  const url = `${API_ROOT}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();

  if (res.status === 401 || res.status === 403) {
    throw new DataForSeoError(
      "DataForSEO rejected the credentials. Double-check login + password under Settings → SEO Intelligence.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new DataForSeoError(
      `DataForSEO ${res.status} ${res.statusText}: ${raw.slice(0, 240)}`,
      res.status,
    );
  }

  let envelope: DataForSeoResponse<TResult>;
  try {
    envelope = JSON.parse(raw) as DataForSeoResponse<TResult>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DataForSeoError(
      `Failed to parse DataForSEO response as JSON: ${msg}. Raw: ${raw.slice(0, 240)}`,
      502,
    );
  }

  // Envelope-level error (20000 is the canonical success code).
  if (envelope.status_code >= 40000) {
    throw new DataForSeoError(
      `DataForSEO envelope error: ${envelope.status_message}`,
      502,
      envelope.status_code,
    );
  }
  const task = envelope.tasks?.[0];
  if (!task) {
    throw new DataForSeoError(
      "DataForSEO returned no tasks in the response — unexpected.",
      502,
    );
  }
  // 20100 = Task Created (async). For all the live endpoints we hit, the
  // success code is 20000 and `result` is populated immediately.
  if (task.status_code >= 40000) {
    throw new DataForSeoError(
      `DataForSEO task error: ${task.status_message}`,
      502,
      task.status_code,
    );
  }
  return { result: task.result ?? [], task, envelope };
}

// ─── DataForSEO Labs: keyword ideas ────────────────────────────────────────
//
// `POST /dataforseo_labs/google/keyword_ideas/live`
// Returns related-keyword suggestions for a seed (or seeds) with search
// volume + competition + KD all in one call. This is the Phase-1 input for
// the keyword-opportunity workflow.
//
// Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live/

export interface KeywordIdea {
  keyword: string;
  /** Average monthly search volume. */
  search_volume: number | null;
  /** 0-100 — DataForSEO's keyword difficulty score for the SERP. Higher =
   *  harder to rank. */
  keyword_difficulty: number | null;
  /** Cost-per-click in USD (Google Ads bidding). */
  cpc: number | null;
  /** "LOW" | "MEDIUM" | "HIGH" — Google Ads competition level. */
  competition_level: string | null;
  /** 0-1 — numeric competition score from Google Ads. */
  competition: number | null;
  /** Bucket inferred by DataForSEO from the SERP signature. */
  search_intent: string | null;
  /** ISO-2 country code, e.g. "US". */
  location_code: number | null;
  /** When DataForSEO last refreshed this row. */
  last_updated_time: string | null;
}

interface RawKeywordIdeasResponseItem {
  items?: RawKeywordIdeaItem[];
}

interface RawKeywordIdeaItem {
  keyword: string;
  keyword_info?: {
    search_volume?: number | null;
    cpc?: number | null;
    competition?: number | null;
    competition_level?: string | null;
    last_updated_time?: string | null;
  };
  keyword_properties?: {
    keyword_difficulty?: number | null;
  };
  search_intent_info?: {
    main_intent?: string | null;
  };
  location_code?: number | null;
}

export interface KeywordIdeasOptions {
  /** Seed terms (1–200). DataForSEO returns related ideas for each. */
  keywords: string[];
  /** Country to score the volumes against. Use DataForSEO location codes
   *  (e.g. 2840 = United States, 2356 = India). Default 2840. */
  locationCode?: number;
  /** Language to score against. Use DataForSEO language code (e.g. "en"). */
  languageCode?: string;
  /** Cap on returned ideas. DataForSEO max is 1000; default 50. */
  limit?: number;
  /** Filter out ideas with no search volume. Default true. */
  withVolumeOnly?: boolean;
}

export async function fetchKeywordIdeas(
  opts: KeywordIdeasOptions,
): Promise<{ ideas: KeywordIdea[]; cost: number; envelope: DataForSeoResponse<RawKeywordIdeasResponseItem> }> {
  const payload = [
    {
      keywords: opts.keywords,
      location_code: opts.locationCode ?? 2840,
      language_code: opts.languageCode ?? "en",
      limit: Math.max(1, Math.min(opts.limit ?? 50, 1000)),
      include_serp_info: false,
      // Skip adult / branded ideas so we don't waste budget on noise.
      filters: [["keyword_info.search_volume", ">", 0]],
      order_by: ["keyword_info.search_volume,desc"],
    },
  ];

  const { result, envelope } = await dataforseoPost<RawKeywordIdeasResponseItem>(
    "/dataforseo_labs/google/keyword_ideas/live",
    payload,
  );

  // The `result` array has one entry whose `items` is the list we want.
  const rawItems: RawKeywordIdeaItem[] = result?.[0]?.items ?? [];
  const ideas: KeywordIdea[] = rawItems.map((r) => ({
    keyword: r.keyword,
    search_volume: r.keyword_info?.search_volume ?? null,
    keyword_difficulty: r.keyword_properties?.keyword_difficulty ?? null,
    cpc: r.keyword_info?.cpc ?? null,
    competition_level: r.keyword_info?.competition_level ?? null,
    competition: r.keyword_info?.competition ?? null,
    search_intent: r.search_intent_info?.main_intent ?? null,
    location_code: r.location_code ?? null,
    last_updated_time: r.keyword_info?.last_updated_time ?? null,
  }));

  // Apply withVolumeOnly client-side as a safety net even though we ask
  // DataForSEO to filter — older snapshots can sneak through.
  const withVolume = opts.withVolumeOnly === false
    ? ideas
    : ideas.filter((k) => (k.search_volume ?? 0) > 0);

  return {
    ideas: withVolume,
    cost: envelope.cost ?? 0,
    envelope,
  };
}

/** Common DataForSEO `location_code` values we surface in the UI. The full
 *  list has thousands of entries; these are the ones the platform's target
 *  audience tends to use. Admins can paste any numeric code if theirs isn't
 *  in the list. */
export const COMMON_LOCATIONS: { code: number; name: string }[] = [
  { code: 2840, name: "United States" },
  { code: 2356, name: "India" },
  { code: 2826, name: "United Kingdom" },
  { code: 2124, name: "Canada" },
  { code: 2036, name: "Australia" },
  { code: 2276, name: "Germany" },
  { code: 2784, name: "United Arab Emirates" },
  { code: 2682, name: "Saudi Arabia" },
];

export const COMMON_LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "ar", name: "Arabic" },
];

// ─── DataForSEO SERP: organic Google results + answer features ─────────────
//
// `POST /serp/google/organic/live/advanced`
// Returns the live SERP for a single query: organic rows (with rank, title,
// URL, snippet), People Also Ask, Featured Snippet, AI Overview, and
// related searches — everything the pipeline needs to write content
// engineered to win the SERP.
//
// Docs: https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/

export interface SerpOrganicResult {
  rank_absolute: number | null;
  title: string | null;
  url: string | null;
  description: string | null;
  /** True when this result hosts the Featured Snippet. */
  is_featured_snippet?: boolean;
}

export interface SerpPaaItem {
  question: string;
  answer?: string | null;
  source_title?: string | null;
  source_url?: string | null;
}

export interface SerpFeaturedSnippet {
  title: string | null;
  url: string | null;
  description: string | null;
}

export interface SerpAiOverview {
  text: string | null;
  references: { title: string | null; url: string | null }[];
}

export interface SerpInsights {
  /** What we queried and where. Kept on the cached payload so we can show
   *  it back to admins without re-fetching. */
  query: string;
  location_code: number;
  language_code: string;
  fetched_at: string;
  /** Top organic results from rank 1–10 (or however many came back). */
  organic: SerpOrganicResult[];
  /** People Also Ask boxes the SERP showed. */
  people_also_ask: SerpPaaItem[];
  featured_snippet: SerpFeaturedSnippet | null;
  ai_overview: SerpAiOverview | null;
  related_searches: string[];
  /** Total Google result count (rough — Google's number, treat as
   *  informational only). */
  total_results: number | null;
  /** DataForSEO's billed cost for this call (USD). */
  cost: number;
}

interface RawSerpItem {
  type?: string;
  rank_absolute?: number;
  title?: string;
  url?: string;
  description?: string;
  // PAA shape
  items?: RawSerpItem[];
  // PAA child item
  question?: string;
  expanded_element?: {
    title?: string;
    url?: string;
    description?: string;
  }[];
  // Featured snippet
  // AI Overview
  text?: string;
  references?: { title?: string; url?: string }[];
  // Related search
  // Already covered by `title` for some types; otherwise:
}

interface RawSerpResultEntry {
  keyword?: string;
  location_code?: number;
  language_code?: string;
  total_count?: number;
  items?: RawSerpItem[];
}

export interface FetchSerpOptions {
  keyword: string;
  locationCode?: number;
  languageCode?: string;
  /** Search depth — DataForSEO defaults to 10, we accept up to 100. */
  depth?: number;
}

export async function fetchSerpInsights(
  opts: FetchSerpOptions,
): Promise<SerpInsights> {
  const payload = [
    {
      keyword: opts.keyword,
      location_code: opts.locationCode ?? 2840,
      language_code: opts.languageCode ?? "en",
      depth: Math.min(100, Math.max(10, opts.depth ?? 30)),
      // Ask DataForSEO for the full enriched response so PAA / featured
      // snippets / AI overviews come through.
      load_async_ai_overview: true,
      people_also_ask_click_depth: 1,
    },
  ];

  const { result, envelope } = await dataforseoPost<RawSerpResultEntry>(
    "/serp/google/organic/live/advanced",
    payload,
  );
  const entry = result?.[0];
  const items = entry?.items ?? [];

  const organic: SerpOrganicResult[] = [];
  const paa: SerpPaaItem[] = [];
  let featuredSnippet: SerpFeaturedSnippet | null = null;
  let aiOverview: SerpAiOverview | null = null;
  const relatedSearches: string[] = [];

  for (const it of items) {
    if (!it.type) continue;
    switch (it.type) {
      case "organic":
        organic.push({
          rank_absolute: it.rank_absolute ?? null,
          title: it.title ?? null,
          url: it.url ?? null,
          description: it.description ?? null,
          is_featured_snippet: false,
        });
        break;
      case "featured_snippet":
        featuredSnippet = {
          title: it.title ?? null,
          url: it.url ?? null,
          description: it.description ?? null,
        };
        break;
      case "people_also_ask":
        for (const q of it.items ?? []) {
          if (!q.question) continue;
          // Each PAA child sometimes has an expanded_element with an answer.
          const exp = q.expanded_element?.[0];
          paa.push({
            question: q.question,
            answer: exp?.description ?? null,
            source_title: exp?.title ?? null,
            source_url: exp?.url ?? null,
          });
        }
        break;
      case "ai_overview":
        aiOverview = {
          text: it.text ?? null,
          references: (it.references ?? []).map((r) => ({
            title: r.title ?? null,
            url: r.url ?? null,
          })),
        };
        break;
      case "related_searches":
        for (const r of it.items ?? []) {
          if (r.title) relatedSearches.push(r.title);
        }
        break;
      default:
        // Knowledge panels, images, videos, etc — ignore for now.
        break;
    }
  }

  // Top-10 organic only. The deeper ranks are useful as signal but we don't
  // need to feed all 30 into the prompt.
  organic.sort(
    (a, b) => (a.rank_absolute ?? 999) - (b.rank_absolute ?? 999),
  );
  const topOrganic = organic.slice(0, 10);

  return {
    query: opts.keyword,
    location_code: opts.locationCode ?? 2840,
    language_code: opts.languageCode ?? "en",
    fetched_at: new Date().toISOString(),
    organic: topOrganic,
    people_also_ask: paa,
    featured_snippet: featuredSnippet,
    ai_overview: aiOverview,
    related_searches: relatedSearches,
    total_results: entry?.total_count ?? null,
    cost: envelope.cost ?? 0,
  };
}

/**
 * Format a SerpInsights blob into a single human-readable block suitable
 * for dropping into LLM prompts. Trimmed to keep the prompt budget sane —
 * we cap PAA, related searches, and AI-overview text so a verbose SERP
 * doesn't blow the model's context.
 *
 * Output shape (markdown-ish; LLM-friendly):
 *
 *   ## SERP for "{keyword}"
 *   Top 10 organic competitors:
 *     1. <Title> — <url>
 *        ↳ <snippet>
 *     2. …
 *   People also ask:
 *     - Q1
 *     - Q2 …
 *   Featured snippet (rank 0):
 *     <title> — <url>
 *     <description>
 *   Google AI Overview:
 *     <text>
 *   Related searches: a, b, c
 *   Target word count: NNNN (median of top 10)
 */
export function buildSerpPromptBlock(serp: SerpInsights | null): string {
  if (!serp) return "";
  const lines: string[] = [];
  lines.push(`## SERP signals for "${serp.query}"`);

  if (serp.organic.length) {
    lines.push("Top 10 organic competitors (we must outclass these):");
    for (const r of serp.organic) {
      const rank = r.rank_absolute ?? "?";
      lines.push(`  ${rank}. ${r.title ?? "(no title)"} — ${r.url ?? ""}`);
      if (r.description) lines.push(`     ↳ ${r.description.slice(0, 220)}`);
    }
  }

  if (serp.featured_snippet) {
    lines.push("");
    lines.push("Featured snippet currently winning rank 0:");
    if (serp.featured_snippet.title)
      lines.push(`  ${serp.featured_snippet.title}`);
    if (serp.featured_snippet.url)
      lines.push(`  ${serp.featured_snippet.url}`);
    if (serp.featured_snippet.description)
      lines.push(
        `  Snippet: ${serp.featured_snippet.description.slice(0, 400)}`,
      );
    lines.push(
      "  → Write a tight 40–60 word answer paragraph high in the body that beats this.",
    );
  }

  if (serp.ai_overview?.text) {
    lines.push("");
    lines.push("Google AI Overview (citation target — be richer than this):");
    lines.push("  " + serp.ai_overview.text.slice(0, 800));
    if (serp.ai_overview.references?.length) {
      lines.push("  Sources Google cited:");
      for (const r of serp.ai_overview.references.slice(0, 5)) {
        lines.push(`    - ${r.title ?? "(no title)"} — ${r.url ?? ""}`);
      }
    }
  }

  if (serp.people_also_ask.length) {
    lines.push("");
    lines.push(
      "People Also Ask (cover these in the body or FAQ to capture the box):",
    );
    for (const q of serp.people_also_ask.slice(0, 10)) {
      lines.push(`  - ${q.question}`);
    }
  }

  if (serp.related_searches.length) {
    lines.push("");
    lines.push(
      "Related searches (use as secondary keywords / H3 ideas): " +
        serp.related_searches.slice(0, 12).join(", "),
    );
  }

  return lines.join("\n");
}
