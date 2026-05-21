import { NextRequest } from "next/server";
import { generateBlogForRequest } from "@/lib/pipeline";
import { getRequest, updateRequest } from "@/lib/requests";
import { logEvent } from "@/lib/db";

/**
 * Kick off blog generation for a request and return immediately.
 *
 * Why background-mode: the pipeline (outline pass + body pass + image gen +
 * banner overlay + persist) routinely takes 60–150 seconds when Gemini is
 * the writer and gpt-image-1 is the image provider. nginx's default
 * `proxy_read_timeout` is 60s, so a synchronous response shape was reliably
 * 504-ing in the browser even though the work was succeeding on the server.
 *
 * Behaviour:
 *  - Returns 202 + `{ started: true }` immediately on the happy path.
 *  - Returns 409 if the request is already in `processing` state (double-
 *    click guard) — the client should keep polling instead.
 *  - Returns 404 if the request id is unknown.
 *
 * The pipeline owns the request's state machine — it sets status to
 * 'processing' at the start, then 'draft' on success or 'failed' with a
 * `last_error` on any throw. Clients poll `/api/requests/[id]` to know
 * when the work has finished.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const req = getRequest(id);
  if (!req) {
    return Response.json({ error: "Request not found." }, { status: 404 });
  }
  if (req.status === "processing") {
    return Response.json(
      {
        error:
          "Already generating — wait for it to finish, then click again to re-run.",
      },
      { status: 409 },
    );
  }

  // Eagerly flip status before the response goes out so the next GET (or
  // server-component refresh) sees the new state. The pipeline does the
  // same on entry, but doing it here as well closes a small race where the
  // client polls before the pipeline has had a chance to update.
  updateRequest(id, { status: "processing", last_error: null });

  // Fire and forget. We don't await the pipeline — that's the whole point.
  // The pipeline updates request state on its own (status -> draft on
  // success, status -> failed with last_error on any throw), so the
  // catch here only exists to make sure an unhandled rejection doesn't
  // crash the Node process.
  generateBlogForRequest(id).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent("request.generate.background.fail", msg, { requestId: id });
  });

  return Response.json({ started: true, requestId: id }, { status: 202 });
}
