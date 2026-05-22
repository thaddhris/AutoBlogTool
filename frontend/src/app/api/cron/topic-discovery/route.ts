import { NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";
import { runTopicDiscovery } from "@/lib/topicDiscovery";

/**
 * Autonomous topic discovery cron tick.
 *
 *   POST /api/cron/topic-discovery?secret=…
 *
 * Recommended cadence: daily (or every 6–12 hours). Each run:
 *  1. Pulls keyword ideas from DataForSEO for the seeds configured in
 *     Settings → SEO Intelligence → Autonomous topic discovery.
 *  2. Filters + semantic-clusters them via an LLM.
 *  3. Auto-creates up to `topic_discovery_max_new_requests` Blog Requests
 *     from the top-scoring clusters (dedup against existing requests +
 *     blogs).
 *
 * Skips silently if `topic_discovery_enabled` is off or no seeds are set
 * — that lets the cron job stay configured in n8n even when the admin
 * temporarily disables discovery.
 */
async function run(request: NextRequest) {
  const settings = getSettings();
  if (settings.cron_secret) {
    const header = request.headers.get("x-cron-secret");
    const query = request.nextUrl.searchParams.get("secret");
    if (header !== settings.cron_secret && query !== settings.cron_secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await runTopicDiscovery();
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}
// Allow GET too so admins can hit the URL from a browser tab for sanity
// checks (n8n typically uses POST).
export async function GET(request: NextRequest) {
  return run(request);
}
