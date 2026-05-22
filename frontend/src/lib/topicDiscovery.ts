import { logEvent } from "./db";
import { getSettings } from "./settings";
import { fetchKeywordIdeas, type KeywordIdea } from "./dataforseo";
import { llmJsonValidated } from "./ai";
import { createRequest, listRequests } from "./requests";
import { listBlogs } from "./blogs";
import { z } from "zod";

// ─── Autonomous topic discovery (Phase 4) ──────────────────────────────────
//
// Workflow on each run:
//
//   1. Read settings → seeds, filters, caps.
//   2. Call DataForSEO `keyword_ideas/live` with all seeds in a single
//      request (cost ~$0.01–0.05).
//   3. Local filtering: min volume / max KD / intent / excluded substrings /
//      already-known-keyword dedupe (vs existing requests + published
//      blogs).
//   4. Semantic clustering via a single LLM call (gpt-4.1-mini through the
//      configured writer provider). Returns N clusters with a chosen
//      representative keyword and a theme label each.
//   5. Score every cluster (`log10(volume) * (100 - kd) / 100`) and take
//      the top `max_new_requests`.
//   6. createRequest() for each pick, embedding the SEO context in the
//      instructions field so the writer agent treats them properly.
//
// Returns a summary { fetched, filtered, clustered, created, cost }
// which the routes hand back to the caller.

export interface DiscoveryResult {
  enabled: boolean;
  skipped_reason?: string;
  fetched: number;
  after_filter: number;
  clusters: number;
  created: number;
  cost_usd: number;
  created_ids: string[];
}

interface Cluster {
  theme: string;
  representative_keyword: string;
  all_keywords: string[];
  /** LLM-assigned 0–100 score for how relevant this cluster is to the
   *  brand. Filtered against `topic_discovery_min_relevance` before any
   *  Blog Request gets auto-created. */
  relevance_score: number;
  /** Opportunity score (log10(volume) × (100 − kd)/100) used for ranking
   *  inside an already-relevant set. */
  score: number;
  representative: KeywordIdea;
}

const ClusterSchema = z.object({
  clusters: z
    .array(
      z.object({
        theme: z.string().min(2).max(80),
        representative_keyword: z.string().min(2).max(200),
        // Sized to match the input ceiling — we feed up to 200 candidate
        // keywords per call, so a single LLM-produced cluster could in
        // principle contain all of them. Previous cap of 40 caused Zod
        // failures + a fallback that bypassed the relevance gate.
        all_keywords: z.array(z.string().min(2).max(200)).min(1).max(200),
        // 0-100; the clusterer is told that 0 = clearly unrelated to the
        // brand, 100 = squarely on-topic.
        relevance_score: z.number().min(0).max(100),
        /** Brief reason for the score — purely for debugging via the log;
         *  not load-bearing in the workflow. */
        relevance_reason: z.string().max(240).optional(),
      }),
    )
    .min(1)
    .max(50),
});

type ClusterPayload = z.infer<typeof ClusterSchema>;

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Score a candidate keyword: high volume + low KD wins. Uses log10 of
 * volume so a 100k-volume keyword doesn't completely drown out a 5k one
 * when KD is similar; (100 - kd)/100 weights difficulty linearly.
 */
function opportunityScore(k: KeywordIdea): number {
  const vol = Math.max(1, k.search_volume ?? 0);
  const kd = k.keyword_difficulty ?? 50;
  return Math.log10(vol) * Math.max(0, (100 - kd) / 100);
}

/**
 * Single LLM call that semantically clusters all candidate keywords and
 * picks the best representative per cluster. We feed in the stats so the
 * model can make an opportunity-aware choice rather than just picking
 * the lexically shortest term.
 */
async function clusterKeywords(
  candidates: KeywordIdea[],
  brandContext: string,
): Promise<ClusterPayload> {
  // Cap the LLM payload — 200 keywords is plenty for one cluster pass.
  const trimmed = candidates.slice(0, 200);
  const rows = trimmed
    .map(
      (k) =>
        `- "${k.keyword}" — volume: ${k.search_volume ?? "n/a"}, kd: ${
          k.keyword_difficulty ?? "n/a"
        }, intent: ${k.search_intent ?? "n/a"}`,
    )
    .join("\n");

  const payload = await llmJsonValidated<ClusterPayload>({
    system:
      "You are an SEO topic strategist. You cluster keyword ideas into semantic groups, pick the single best keyword per group as the representative — judged by the volume + difficulty trade-off — AND score each cluster for relevance to a specific brand's domain. You return ONLY valid JSON exactly matching the requested schema.",
    prompt: `## Brand context
${brandContext}

## Task
Group the following keywords into semantic clusters (one cluster per distinct topic). For each cluster:

- "theme": a short 2–4 word label describing the cluster's topic
- "representative_keyword": the SINGLE keyword from the cluster most worth writing a blog post about. Trade off search volume against keyword difficulty — high volume + low difficulty wins. Prefer informational intent.
- "all_keywords": every keyword that belongs to this cluster (verbatim)
- "relevance_score": integer 0–100 — how relevant is the cluster's topic to the BRAND CONTEXT above?
    - 90–100 = squarely in the brand's domain; a customer would expect to see this content on the brand's blog
    - 60–89  = adjacent but defensible (related industry, related use-case, valid awareness-stage content)
    - 30–59  = tangentially related, would feel off-brand if published
    - 0–29   = clearly unrelated; the keyword just happens to share a word with the seeds (e.g. "industrial sewing machine" sharing "industrial"; "carpenter jobs" sharing "machinist")
  Be strict — when in doubt, score lower. The brand would rather skip an off-topic keyword than publish irrelevant content.
- "relevance_reason": one short sentence explaining the score, especially for borderline calls.

Aim for 5–15 distinct clusters. Score every cluster, even obvious off-topic ones — the calling code filters by threshold, not you.

Candidate keywords (verbatim — use these exact strings in "all_keywords" and "representative_keyword"):
${rows}

Return JSON exactly like:
{
  "clusters": [
    {
      "theme": "string",
      "representative_keyword": "string",
      "all_keywords": ["string", ...],
      "relevance_score": 0-100,
      "relevance_reason": "string"
    }
  ]
}
No prose outside JSON.`,
    validate: (raw) => ClusterSchema.parse(raw),
    maxTokens: 5000,
    temperature: 0.2,
    maxRetries: 1,
  });

  return payload;
}

/**
 * Apply the user's filters + dedupe against the existing requests + blogs
 * universe. Returns a fresh array (caller owns it).
 */
function filterCandidates(
  ideas: KeywordIdea[],
  args: {
    minVolume: number;
    maxKd: number;
    intent: string;
    excluded: string[];
    knownKeywords: Set<string>;
  },
): { kept: KeywordIdea[]; rejected: number } {
  const kept: KeywordIdea[] = [];
  let rejected = 0;
  const excludedLower = args.excluded
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const k of ideas) {
    const norm = normalize(k.keyword);
    if (!norm) {
      rejected++;
      continue;
    }
    if ((k.search_volume ?? 0) < args.minVolume) {
      rejected++;
      continue;
    }
    if (
      k.keyword_difficulty !== null &&
      k.keyword_difficulty !== undefined &&
      k.keyword_difficulty > args.maxKd
    ) {
      rejected++;
      continue;
    }
    if (args.intent !== "any" && k.search_intent && k.search_intent !== args.intent) {
      rejected++;
      continue;
    }
    if (excludedLower.some((e) => norm.includes(e))) {
      rejected++;
      continue;
    }
    if (args.knownKeywords.has(norm)) {
      rejected++;
      continue;
    }
    kept.push(k);
  }
  return { kept, rejected };
}

/**
 * The full discovery run. Idempotent in the sense that dedup against
 * existing requests / blogs means a second consecutive run won't create
 * the same Blog Request twice.
 */
export async function runTopicDiscovery(opts?: {
  /** Override the per-run cap from settings. */
  limit?: number;
}): Promise<DiscoveryResult> {
  const settings = getSettings();

  if (!settings.topic_discovery_enabled) {
    logEvent(
      "topic_discovery.skip",
      "topic_discovery_enabled is off — skipping run",
    );
    return baseSkip("disabled in Settings");
  }

  const seeds = (settings.topic_discovery_seeds || [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (!seeds.length) {
    logEvent(
      "topic_discovery.skip",
      "no seed keywords configured — open Settings → SEO Intelligence → Autonomous topic discovery",
    );
    return baseSkip("no seeds configured");
  }

  if (!settings.dataforseo_login || !settings.dataforseo_password) {
    logEvent(
      "topic_discovery.skip",
      "DataForSEO credentials missing — cannot fetch keyword ideas",
    );
    return baseSkip("DataForSEO credentials missing");
  }

  logEvent(
    "topic_discovery.start",
    `seeds=${seeds.length} max_new=${opts?.limit ?? settings.topic_discovery_max_new_requests}`,
    {
      payload: {
        seeds,
        intent: settings.topic_discovery_intent_filter,
        excluded: settings.topic_discovery_excluded_keywords,
        max_new: opts?.limit ?? settings.topic_discovery_max_new_requests,
      },
    },
  );

  // ── 1. Fetch keyword ideas ─────────────────────────────────────────────
  let ideas: KeywordIdea[] = [];
  let cost = 0;
  try {
    const res = await fetchKeywordIdeas({
      keywords: seeds.slice(0, 20), // DataForSEO recommends ≤20 seeds per call
      locationCode: settings.dataforseo_location_code || 2840,
      languageCode: settings.dataforseo_language_code || "en",
      limit: 500,
    });
    ideas = res.ideas;
    cost = res.cost;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent("topic_discovery.fail", `keyword_ideas error: ${msg}`);
    throw err;
  }
  logEvent(
    "topic_discovery.fetched",
    `${ideas.length} ideas from DataForSEO (cost $${cost.toFixed(4)})`,
    { payload: { count: ideas.length, cost } },
  );

  // ── 2. Filter + dedupe ─────────────────────────────────────────────────
  const knownKeywords = new Set<string>();
  for (const r of listRequests()) {
    if (r.label) knownKeywords.add(normalize(r.label));
    if (r.topic) knownKeywords.add(normalize(r.topic));
    for (const k of r.keywords) knownKeywords.add(normalize(k));
  }
  for (const b of listBlogs()) {
    if (b.title) knownKeywords.add(normalize(b.title));
    if (b.primary_keyword) knownKeywords.add(normalize(b.primary_keyword));
  }

  const { kept: filtered, rejected } = filterCandidates(ideas, {
    minVolume: settings.dataforseo_min_search_volume ?? 100,
    maxKd: settings.dataforseo_max_keyword_difficulty ?? 60,
    intent: settings.topic_discovery_intent_filter || "any",
    excluded: settings.topic_discovery_excluded_keywords || [],
    knownKeywords,
  });
  logEvent(
    "topic_discovery.filtered",
    `kept=${filtered.length} rejected=${rejected}`,
    { payload: { kept: filtered.length, rejected } },
  );

  if (filtered.length === 0) {
    return {
      enabled: true,
      fetched: ideas.length,
      after_filter: 0,
      clusters: 0,
      created: 0,
      cost_usd: cost,
      created_ids: [],
    };
  }

  // ── 3. Semantic clustering + relevance scoring ─────────────────────────
  // The clusterer also scores each cluster 0-100 for relevance to the
  // brand. The brand-context block comes from Settings → brand_name +
  // brand_tone — that's where Faclon-specific framing lives. Without this
  // step the workflow would happily auto-create requests for off-topic
  // keywords that just happen to share a token with the seeds (e.g.
  // "industrial sewing machine" hitching on the word "industrial").
  const brandContext = [
    `Brand: ${settings.brand_name || "the brand"}`,
    settings.brand_tone
      ? `Brand focus / voice: ${settings.brand_tone}`
      : null,
    `Seed topics the brand cares about: ${seeds.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  let clusters: Cluster[] = [];
  try {
    const payload = await clusterKeywords(filtered, brandContext);
    const byKeyword = new Map(filtered.map((k) => [normalize(k.keyword), k]));
    for (const c of payload.clusters) {
      const repNorm = normalize(c.representative_keyword);
      const rep = byKeyword.get(repNorm);
      if (!rep) continue; // LLM hallucinated a keyword we didn't send
      clusters.push({
        theme: c.theme,
        representative_keyword: rep.keyword,
        all_keywords: c.all_keywords.filter((k) =>
          byKeyword.has(normalize(k)),
        ),
        relevance_score: c.relevance_score,
        score: opportunityScore(rep),
        representative: rep,
      });
    }
  } catch (err) {
    // LLM clustering failed AND we cannot safely auto-create requests
    // without relevance scores — falling back to "every keyword is its
    // own cluster" would happily ship off-topic keywords (industrial
    // piercing, carpenter jobs, etc.) because they look like high-volume
    // SEO opportunities. So we abort the run with a clear error instead
    // and ask the admin to re-run.
    const msg = err instanceof Error ? err.message : String(err);
    logEvent(
      "topic_discovery.fail",
      `clustering failed and aborting to avoid off-topic auto-creation: ${msg}`,
    );
    return {
      enabled: true,
      skipped_reason:
        "LLM clustering failed — aborted to prevent off-topic requests. Re-run discovery, and if it keeps failing check writer-provider quota.",
      fetched: ideas.length,
      after_filter: filtered.length,
      clusters: 0,
      created: 0,
      cost_usd: cost,
      created_ids: [],
    };
  }
  // De-dupe clusters whose representative was already added by a sibling
  // (LLM occasionally repeats), then sort by opportunity score desc.
  const seenReps = new Set<string>();
  clusters = clusters.filter((c) => {
    const k = normalize(c.representative_keyword);
    if (seenReps.has(k)) return false;
    seenReps.add(k);
    return true;
  });

  // Apply the relevance threshold. Default 60 = "adjacent but defensible";
  // admins can tune this in Settings.
  const minRelevance = settings.topic_discovery_min_relevance ?? 60;
  const allClusters = clusters;
  clusters = clusters.filter((c) => c.relevance_score >= minRelevance);
  clusters.sort((a, b) => b.score - a.score);

  const dropped = allClusters.length - clusters.length;
  logEvent(
    "topic_discovery.clustered",
    `kept=${clusters.length} dropped=${dropped} (relevance>=${minRelevance})` +
      (clusters[0] ? ` top score=${clusters[0].score.toFixed(2)}` : ""),
    {
      payload: {
        kept: clusters.length,
        dropped,
        min_relevance: minRelevance,
        dropped_themes: allClusters
          .filter((c) => c.relevance_score < minRelevance)
          .slice(0, 10)
          .map((c) => ({
            theme: c.theme,
            relevance: c.relevance_score,
            representative: c.representative_keyword,
          })),
      },
    },
  );

  // ── 4. Auto-create requests for top N ──────────────────────────────────
  const maxNew = Math.max(
    1,
    Math.min(50, opts?.limit ?? settings.topic_discovery_max_new_requests ?? 5),
  );
  const picks = clusters.slice(0, maxNew);
  const createdIds: string[] = [];
  const runDate = new Date().toISOString().slice(0, 10);

  for (const cluster of picks) {
    const k = cluster.representative;
    try {
      const r = createRequest({
        label: k.keyword,
        topic: k.keyword,
        keywords: [k.keyword],
        instructions: [
          `Auto-discovered by topic discovery on ${runDate}.`,
          `Cluster theme: ${cluster.theme}.`,
          `Brand relevance: ${cluster.relevance_score}/100.`,
          k.search_volume !== null
            ? `Monthly search volume: ${k.search_volume.toLocaleString()}.`
            : null,
          k.keyword_difficulty !== null
            ? `Keyword difficulty: ${k.keyword_difficulty}/100.`
            : null,
          k.search_intent ? `Search intent: ${k.search_intent}.` : null,
          cluster.all_keywords.length > 1
            ? `Related keywords in this cluster: ${cluster.all_keywords
                .filter((x) => normalize(x) !== normalize(k.keyword))
                .slice(0, 10)
                .join(", ")}.`
            : null,
          "Focus on answering the searcher's actual question concretely.",
        ]
          .filter(Boolean)
          .join("\n"),
        // Prioritise higher-scoring opportunities so they run first when
        // the queue cron picks pending requests.
        priority: Math.round(cluster.score * 10),
      });
      createdIds.push(r.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent(
        "topic_discovery.create.fail",
        `keyword="${k.keyword}" ${msg}`,
      );
    }
  }

  logEvent(
    "topic_discovery.done",
    `created=${createdIds.length} fetched=${ideas.length} cost=$${cost.toFixed(4)}`,
    {
      payload: {
        created: createdIds.length,
        fetched: ideas.length,
        cost,
        run_date: runDate,
      },
    },
  );

  return {
    enabled: true,
    fetched: ideas.length,
    after_filter: filtered.length,
    clusters: clusters.length,
    created: createdIds.length,
    cost_usd: cost,
    created_ids: createdIds,
  };
}

function baseSkip(reason: string): DiscoveryResult {
  return {
    enabled: false,
    skipped_reason: reason,
    fetched: 0,
    after_filter: 0,
    clusters: 0,
    created: 0,
    cost_usd: 0,
    created_ids: [],
  };
}
