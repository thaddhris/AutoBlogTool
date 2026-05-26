import { getSettings } from "./settings";

// ─── Exa AI REST client ────────────────────────────────────────────────────
//
// We hit Exa's `POST /search` endpoint directly (no SDK) for symmetry with
// our DataForSEO and Gemini wrappers — keeps the surface area small and
// avoids a transitive dependency.
//
// Canonical reference:
//   https://docs.exa.ai/reference/search-api-guide-for-coding-agents

const API_URL = "https://api.exa.ai/search";

export interface ExaSearchResult {
  /** Final URL (post-redirect). */
  url: string;
  title: string | null;
  /** ISO date of publication when Exa could detect one. */
  publishedDate?: string | null;
  author?: string | null;
  /** Top query-relevant excerpts. We always ask for these so the writer
   *  can quote / paraphrase real text rather than hallucinate. */
  highlights?: string[];
  /** Domain-level score (not always populated). */
  score?: number;
}

interface RawExaResponse {
  results?: Array<{
    url: string;
    title?: string | null;
    publishedDate?: string | null;
    author?: string | null;
    highlights?: string[] | null;
    score?: number | null;
  }>;
  /** Some Exa responses include cost; defensive parse. */
  costDollars?: { total?: number };
  error?: string;
  message?: string;
}

export class ExaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ExaError";
    this.status = status;
  }
}

export interface FetchAuthoritativeSourcesOptions {
  /** The post's primary keyword (e.g. "predictive maintenance"). */
  primaryKeyword: string;
  /** Secondary keywords used to tighten the query. */
  secondaryKeywords?: string[];
  /** Number of results to return. Default 8. */
  numResults?: number;
  /** Latency / depth dial. Default "fast". */
  type?: "auto" | "fast" | "instant" | "deep-lite" | "deep";
  /** Optional include/exclude domain filters. Usually unnecessary — Exa's
   *  neural search surfaces authoritative pages without help. */
  includeDomains?: string[];
  excludeDomains?: string[];
}

/**
 * Build the Exa query. We combine the primary keyword (quoted to force an
 * exact match) with 1–2 secondary keywords as a refinement signal. Quoting
 * the primary keyword reliably surfaces pages that actually treat the
 * topic, rather than pages tangentially related to a single word.
 */
function buildQuery(opts: FetchAuthoritativeSourcesOptions): string {
  const parts: string[] = [];
  const primary = opts.primaryKeyword.trim();
  if (primary.includes(" ")) parts.push(`"${primary}"`);
  else parts.push(primary);
  for (const k of (opts.secondaryKeywords ?? []).slice(0, 2)) {
    if (k.trim()) parts.push(k.trim());
  }
  // Bias the query toward authoritative content forms (guides, case
  // studies, whitepapers, technical articles) rather than retail / forum
  // hits. Light bias only — too prescriptive hurts recall.
  parts.push("guide OR analysis OR best practices");
  return parts.join(" ");
}

/**
 * Fetch real, authoritative sources for a blog topic via Exa AI.
 *
 * Used by the generation pipeline after the outline pass to replace the
 * LLM's hallucinated source URLs with real ones. Returns an empty array
 * if Exa isn't configured / errors out — caller falls back to whatever
 * the LLM produced (which is at least not catastrophic, just sometimes
 * 404s).
 */
export async function fetchAuthoritativeSources(
  opts: FetchAuthoritativeSourcesOptions,
): Promise<{
  sources: ExaSearchResult[];
  cost_usd: number;
}> {
  const settings = getSettings();
  const key = (settings.exa_api_key || "").trim();
  if (!key) {
    throw new ExaError("Exa API key not configured", 400);
  }

  const body: Record<string, unknown> = {
    query: buildQuery(opts),
    type: opts.type ?? "fast",
    numResults: Math.max(1, Math.min(25, opts.numResults ?? 8)),
    contents: {
      highlights: true,
    },
  };
  if (opts.includeDomains?.length) body.includeDomains = opts.includeDomains;
  if (opts.excludeDomains?.length) body.excludeDomains = opts.excludeDomains;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed: RawExaResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as RawExaResponse) : {};
  } catch {
    /* leave empty */
  }
  if (!res.ok) {
    const msg =
      parsed.error ||
      parsed.message ||
      raw.slice(0, 300) ||
      res.statusText;
    throw new ExaError(`Exa ${res.status}: ${msg}`, res.status);
  }

  const sources: ExaSearchResult[] = (parsed.results ?? []).map((r) => ({
    url: r.url,
    title: r.title ?? null,
    publishedDate: r.publishedDate ?? null,
    author: r.author ?? null,
    highlights: r.highlights ?? [],
    score: r.score ?? undefined,
  }));

  return {
    sources,
    cost_usd: parsed.costDollars?.total ?? 0,
  };
}

/**
 * Format an array of Exa sources into a single human-readable block ready
 * to drop into an LLM prompt. The writer agent uses this to ground inline
 * citations in real text rather than hallucinating URLs.
 *
 * IMPORTANT: We deliberately do NOT prefix sources with a numeric label
 * like "Source 1:" — the writer would copy that label verbatim as the
 * anchor text, e.g. "[Source 1](https://…)" or worse the bare string
 * "[Source 1]" with no link at all. Instead we list each as
 * `Title — URL` so the writer is forced to invent meaningful anchor
 * text that fits the surrounding sentence.
 */
export function buildSourcesPromptBlock(
  sources: ExaSearchResult[],
): string {
  if (!sources.length) return "";
  const rows = sources.map((s) => {
    const header = `- ${s.title ?? "(no title)"} — ${s.url}`;
    const highlights = (s.highlights ?? [])
      .slice(0, 2)
      .map((h) => `    ↳ ${h.replace(/\s+/g, " ").trim().slice(0, 220)}`)
      .join("\n");
    return highlights ? `${header}\n${highlights}` : header;
  });
  return [
    "## Verified external sources (real URLs found via Exa AI)",
    "Use these as inline citations to back up specific claims in the body.",
    "Rules — read carefully:",
    '  • Each citation MUST be a markdown link: `[meaningful anchor phrase](https://exact-url-from-list)`. The anchor phrase is the surrounding wording (e.g. "industry research", "a recent BusinessInsider report", "as noted in this guide"), NOT a numeric label.',
    '  • NEVER write the literal text "[Source N]", "[1]", "[source 1]", or any bracketed number. Those are NOT links — they render as plain text.',
    "  • Paraphrase facts; do not copy verbatim.",
    "  • ONLY use URLs from this list — never invent or recall other URLs.",
    "",
    rows.join("\n"),
  ].join("\n");
}
