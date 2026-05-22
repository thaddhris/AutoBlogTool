import { NextRequest } from "next/server";
import { drainExpiredDrafts, processQueue } from "@/lib/queue";
import { runTopicDiscovery } from "@/lib/topicDiscovery";
import { logEvent } from "@/lib/db";

/**
 * Admin-only trigger for the cron tasks — returns immediately, runs in the
 * background.
 *
 *   POST /api/admin/run-now      { "kind": "process" | "publish" | "discover" }
 *
 * Why background-mode: a single `processQueue()` call with `batch_size=3`
 * + a slow writer (Gemini under load, ~30–90s per blog) can easily run
 * past nginx's 60s `proxy_read_timeout`, returning a 504 to the browser
 * even though the work is still happening on the server. Identical
 * problem we already solved on the generate route — same fix here.
 *
 * The route returns 202 with `{ kind, started: true }` immediately and
 * fires the underlying task in the background. The client gets a clean
 * "started" toast and the user refreshes Drafts / Logs to see results.
 *
 * The secret-protected `/api/cron/*` routes still run synchronously
 * (n8n's HTTP node has long timeouts and wants tick stats in the
 * response). External schedulers continue to use those unchanged.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const kind = body?.kind;
  if (kind !== "process" && kind !== "publish" && kind !== "discover") {
    return Response.json(
      {
        error: "Provide `kind`: 'process' | 'publish' | 'discover'.",
      },
      { status: 400 },
    );
  }

  // Fire-and-forget. We log every background failure so admins can debug
  // via the Activity Log without the route handler hanging.
  const runner: () => Promise<unknown> =
    kind === "process"
      ? processQueue
      : kind === "publish"
        ? drainExpiredDrafts
        : runTopicDiscovery;

  runner().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent(`admin.run_now.${kind}.fail`, msg);
  });

  return Response.json({ kind, started: true }, { status: 202 });
}
