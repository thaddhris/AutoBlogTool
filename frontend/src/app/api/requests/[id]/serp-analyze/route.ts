import { NextRequest } from "next/server";
import { getRequest, updateRequest } from "@/lib/requests";
import { getSettings } from "@/lib/settings";
import { DataForSeoError, fetchSerpInsights } from "@/lib/dataforseo";
import { logEvent } from "@/lib/db";

/**
 * Fetch / refresh the cached SERP analysis for a request.
 *
 *   POST /api/requests/<id>/serp-analyze
 *   { "query": "<override keyword>", "force": true }
 *
 * Body fields (all optional):
 *  - query: override the keyword we SERP for. Defaults to the request's
 *    first keyword, falling back to its topic string.
 *  - force: re-fetch even if a cached SerpInsights is present (cost ~$0.002).
 *
 * Used by the admin's "Analyze SERP" button on the request detail page,
 * and indirectly by the pipeline through its own cache-aware path.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const req = getRequest(id);
  if (!req) return Response.json({ error: "Request not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const settings = getSettings();
  const queryOverride =
    typeof body.query === "string" && body.query.trim()
      ? body.query.trim()
      : null;
  const force = Boolean(body.force);

  if (!force && req.serp_analysis) {
    return Response.json({ request: req, cached: true });
  }

  const query = queryOverride || req.keywords[0] || req.topic;
  if (!query || !query.trim()) {
    return Response.json(
      { error: "No keyword or topic available to SERP-analyze." },
      { status: 400 },
    );
  }
  if (!settings.dataforseo_login || !settings.dataforseo_password) {
    return Response.json(
      {
        error:
          "DataForSEO credentials are not configured. Add them under Settings → SEO Intelligence first.",
      },
      { status: 400 },
    );
  }

  try {
    const insights = await fetchSerpInsights({
      keyword: query,
      locationCode: settings.dataforseo_location_code || 2840,
      languageCode: settings.dataforseo_language_code || "en",
    });
    const updated = updateRequest(id, { serp_analysis: insights });
    logEvent(
      "serp.analyze.ok",
      `manual query="${query}" organic=${insights.organic.length} paa=${insights.people_also_ask.length} cost=$${insights.cost.toFixed(4)}`,
      { requestId: id, payload: { cost: insights.cost, manual: true } },
    );
    return Response.json({
      request: updated,
      serp: insights,
      cached: false,
    });
  } catch (err) {
    const status = err instanceof DataForSeoError ? err.status : 500;
    const msg = err instanceof Error ? err.message : String(err);
    logEvent("serp.analyze.fail", msg, { requestId: id });
    return Response.json({ error: msg }, { status });
  }
}
