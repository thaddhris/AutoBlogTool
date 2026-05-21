import { NextRequest } from "next/server";
import { drainExpiredDrafts, processQueue } from "@/lib/queue";

/**
 * Admin-only synchronous trigger for the two cron tasks.
 *
 *   POST /api/admin/run-now      { "kind": "process" | "publish" }
 *
 * This is the endpoint the dashboard's "Run queue now" / "Drain due drafts"
 * buttons use. It deliberately does NOT require the cron secret — the
 * secret exists to keep outside callers from burning your tokens by hitting
 * /api/cron/{process,publish}, but admin clicks already come from the
 * authenticated admin UI on the same origin. Prompting the admin for the
 * secret on every click was pure friction.
 *
 * The same secret-protected /api/cron/{process,publish} routes stay around
 * unchanged — n8n / external schedulers should keep using those.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const kind = body?.kind;
  if (kind !== "process" && kind !== "publish") {
    return Response.json(
      { error: "Provide `kind`: 'process' or 'publish'." },
      { status: 400 },
    );
  }
  try {
    const result =
      kind === "process" ? await processQueue() : await drainExpiredDrafts();
    return Response.json({ kind, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ kind, error: msg }, { status: 500 });
  }
}
