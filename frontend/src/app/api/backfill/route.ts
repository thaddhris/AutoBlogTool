import { NextRequest } from "next/server";
import { backfillAllBlogs } from "@/lib/backfill";
import { getSettings } from "@/lib/settings";

// One-off endpoint to bring existing blog rows up to the Phase-A SEO contract.
// Gated by the same cron_secret as the cron endpoints — set it in Settings
// before running in any environment with shared access.
//
//   curl -X POST http://localhost:5025/api/backfill?secret=...&metricsOnly=1
//
// Query params:
//   metricsOnly=1 — skip the LLM step, only recompute readability/density/
//                   uniqueness/word_count/claims and rebuild JSON-LD.
//   limit=N       — limit how many rows to touch (test-run safety).
async function run(request: NextRequest) {
  const settings = getSettings();
  if (settings.cron_secret) {
    const header = request.headers.get("x-cron-secret");
    const query = request.nextUrl.searchParams.get("secret");
    if (header !== settings.cron_secret && query !== settings.cron_secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const metricsOnly = request.nextUrl.searchParams.get("metricsOnly") === "1";
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Number(limitRaw)) : undefined;
  try {
    const result = await backfillAllBlogs({ metricsOnly, limit });
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}
export async function GET(request: NextRequest) {
  return run(request);
}
