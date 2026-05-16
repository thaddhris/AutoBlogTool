import { NextRequest } from "next/server";
import { setDraftHold } from "@/lib/queue";
import { getBlog } from "@/lib/blogs";

// Pin (or clear) the auto-publish time on a draft.
//   body: { scheduled_at: ISO string }  → set timer
//   body: { scheduled_at: null }        → clear timer (pause auto-publish)
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  if (body.scheduled_at === null) {
    setDraftHold(id, null);
    return Response.json({ blog: getBlog(id) });
  }

  const whenRaw = body.scheduled_at as string | undefined;
  const when = whenRaw ? new Date(whenRaw) : new Date();
  if (isNaN(when.getTime())) {
    return Response.json(
      { error: "scheduled_at must be a valid ISO date or null" },
      { status: 400 },
    );
  }
  setDraftHold(id, when);
  return Response.json({ blog: getBlog(id) });
}
