import { NextRequest } from "next/server";
import { deleteResource } from "@/lib/resources";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; resourceId: string }> },
) {
  const { resourceId } = await ctx.params;
  const ok = deleteResource(resourceId);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
