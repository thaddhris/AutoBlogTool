import { NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";
import { processQueue } from "@/lib/queue";

// Queue tick. Call this from n8n (or any scheduler) on a slow cadence —
// typically every 5–15 minutes. It picks the top `batch_size` pending
// requests and generates drafts. If publish_mode = "auto" each draft is
// stamped with `scheduled_at = now + draft_hold_hours`. It does NOT publish.
async function run(request: NextRequest) {
  const settings = getSettings();
  if (settings.cron_secret) {
    const header = request.headers.get("x-cron-secret");
    const query = request.nextUrl.searchParams.get("secret");
    if (header !== settings.cron_secret && query !== settings.cron_secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await processQueue();
  return Response.json(result);
}

export async function POST(request: NextRequest) {
  return run(request);
}

export async function GET(request: NextRequest) {
  return run(request);
}
