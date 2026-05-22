import { NextRequest } from "next/server";
import {
  DataForSeoError,
  fetchKeywordIdeas,
} from "@/lib/dataforseo";
import { getSettings } from "@/lib/settings";
import { logEvent } from "@/lib/db";

/**
 * Run a keyword-ideas query against DataForSEO and return a normalised list
 * of opportunities the UI can render.
 *
 *   POST /api/seo/keyword-ideas
 *   {
 *     "seeds": ["industrial ai", "iiot"],
 *     "location_code": 2840,            // optional, defaults to Settings
 *     "language_code": "en",            // optional, defaults to Settings
 *     "limit": 50,                       // optional, max 1000
 *     "min_volume": 100,                 // optional, defaults to Settings
 *     "max_kd": 60                       // optional, defaults to Settings
 *   }
 *
 * Response:
 *   {
 *     "seeds": [...],
 *     "ideas": [{ keyword, search_volume, keyword_difficulty, cpc, ... }],
 *     "cost": 0.0125,
 *     "count": 47,
 *     "filtered_out": 3
 *   }
 *
 * The `cost` figure is what DataForSEO billed for this single call —
 * surfaced to the UI so admins can see spend per query in real time.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const seeds = Array.isArray(body.seeds)
    ? body.seeds.map(String).map((s: string) => s.trim()).filter(Boolean)
    : [];
  if (!seeds.length) {
    return Response.json(
      { error: "Provide at least one seed keyword in `seeds`." },
      { status: 400 },
    );
  }
  if (seeds.length > 20) {
    return Response.json(
      { error: "Too many seeds in one call (max 20)." },
      { status: 400 },
    );
  }

  const settings = getSettings();
  const locationCode =
    Number.isFinite(body.location_code) && body.location_code > 0
      ? Number(body.location_code)
      : settings.dataforseo_location_code || 2840;
  const languageCode =
    typeof body.language_code === "string" && body.language_code.trim()
      ? body.language_code.trim()
      : settings.dataforseo_language_code || "en";
  const limit =
    Number.isFinite(body.limit) && body.limit > 0
      ? Math.min(1000, Number(body.limit))
      : 50;
  const minVolume = Number.isFinite(body.min_volume)
    ? Number(body.min_volume)
    : settings.dataforseo_min_search_volume ?? 100;
  const maxKd = Number.isFinite(body.max_kd)
    ? Number(body.max_kd)
    : settings.dataforseo_max_keyword_difficulty ?? 60;

  try {
    const { ideas, cost } = await fetchKeywordIdeas({
      keywords: seeds,
      locationCode,
      languageCode,
      limit,
    });

    // Apply our local volume + KD filters on top of DataForSEO's own
    // filtering. We do this server-side so the UI gets a clean list.
    const before = ideas.length;
    const filtered = ideas.filter((k) => {
      if ((k.search_volume ?? 0) < minVolume) return false;
      if (
        k.keyword_difficulty !== null &&
        k.keyword_difficulty !== undefined &&
        k.keyword_difficulty > maxKd
      ) {
        return false;
      }
      return true;
    });

    logEvent(
      "seo.keyword_ideas.ok",
      `seeds=${seeds.join(", ")} ideas=${filtered.length} cost=$${cost.toFixed(4)}`,
      {
        payload: {
          seeds,
          location_code: locationCode,
          language_code: languageCode,
          ideas_returned: filtered.length,
          ideas_filtered_out: before - filtered.length,
          cost,
        },
      },
    );

    return Response.json({
      seeds,
      location_code: locationCode,
      language_code: languageCode,
      ideas: filtered,
      count: filtered.length,
      filtered_out: before - filtered.length,
      cost,
    });
  } catch (err) {
    const status = err instanceof DataForSeoError ? err.status : 500;
    const msg = err instanceof Error ? err.message : String(err);
    logEvent("seo.keyword_ideas.fail", msg);
    return Response.json({ error: msg }, { status });
  }
}
