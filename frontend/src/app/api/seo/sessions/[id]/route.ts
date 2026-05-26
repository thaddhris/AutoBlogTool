import { NextRequest } from "next/server";
import {
  deleteKeywordSession,
  getKeywordSession,
  updateKeywordSessionNotes,
} from "@/lib/keywordSessions";

/**
 * Read / update / delete a stored keyword-research session.
 *
 *   GET    /api/seo/sessions/<id>          → full session payload (ideas + filters)
 *   PATCH  /api/seo/sessions/<id> { notes } → update the free-form notes field
 *   DELETE /api/seo/sessions/<id>          → remove the session
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = getKeywordSession(id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ session });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.notes !== "string") {
    return Response.json(
      { error: "Provide a `notes` string." },
      { status: 400 },
    );
  }
  const session = updateKeywordSessionNotes(id, body.notes);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ session });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ok = deleteKeywordSession(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
