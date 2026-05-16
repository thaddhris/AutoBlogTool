import { NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";
import { drainExpiredDrafts } from "@/lib/queue";

// Publish tick. Call this from n8n on a fast cadence — typically every
// 1–5 minutes. It scans drafts whose `scheduled_at` is in the past and
// publishes them. It does NOT generate.
async function run(request: NextRequest) {
  const settings = getSettings();
  if (settings.cron_secret) {
    const header = request.headers.get("x-cron-secret");
    const query = request.nextUrl.searchParams.get("secret");
    if (header !== settings.cron_secret && query !== settings.cron_secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await drainExpiredDrafts();
  return Response.json(result);
}

export async function POST(request: NextRequest) {
  return run(request);
}

export async function GET(request: NextRequest) {
  return run(request);
}
