import { NextRequest } from "next/server";
import { moveDraftToScheduled } from "@/lib/queue";
import { getBlog } from "@/lib/blogs";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const whenRaw = body.scheduled_at as string | undefined;
  const when = whenRaw ? new Date(whenRaw) : new Date();
  if (isNaN(when.getTime())) {
    return Response.json(
      { error: "scheduled_at must be a valid ISO date" },
      { status: 400 },
    );
  }
  moveDraftToScheduled(id, when);
  const blog = getBlog(id);
  return Response.json({ blog });
}
