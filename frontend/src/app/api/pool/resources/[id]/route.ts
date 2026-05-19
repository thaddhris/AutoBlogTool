import { NextRequest } from "next/server";
import {
  deletePoolResource,
  getPoolResource,
  setTags,
} from "@/lib/pool";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const r = getPoolResource(id);
  if (!r) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ resource: r });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  if (Array.isArray(body.tags)) {
    setTags(id, body.tags.map(String));
  } else if (typeof body.tags === "string") {
    setTags(
      id,
      body.tags
        .split(/[,\n]/)
        .map((s: string) => s.trim())
        .filter(Boolean),
    );
  }
  const r = getPoolResource(id);
  if (!r) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ resource: r });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ok = deletePoolResource(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
