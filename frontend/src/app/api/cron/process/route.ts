import { NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";
import { processQueue } from "@/lib/queue";

// POST is for cron triggers (gated by cron_secret).
// GET is provided for manual "Run now" from the admin UI (same gate).
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
