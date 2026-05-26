import { NextRequest } from "next/server";
import { listKeywordSessions } from "@/lib/keywordSessions";

/**
 * List recent keyword-research sessions, newest first. Summaries only —
 * the heavy `ideas` array is not included here; call /sessions/[id] to
 * get the full data.
 *
 *   GET /api/seo/sessions?limit=30
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(200, limitRaw)
      : 30;
  return Response.json({ sessions: listKeywordSessions({ limit }) });
}
