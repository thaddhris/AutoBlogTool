import { NextRequest } from "next/server";
import {
  deleteRequest,
  getRequest,
  updateRequest,
} from "@/lib/requests";
import { listResources } from "@/lib/resources";
import { getBlogByRequest } from "@/lib/blogs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const req = getRequest(id);
  if (!req) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    request: req,
    resources: listResources(id),
    blog: getBlogByRequest(id),
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json();
  const patch: Parameters<typeof updateRequest>[1] = {};
  if (body.label !== undefined) patch.label = String(body.label);
  if (body.topic !== undefined) patch.topic = String(body.topic);
  if (body.keywords !== undefined) {
    patch.keywords = Array.isArray(body.keywords)
      ? body.keywords.map(String)
      : String(body.keywords)
          .split(/[,;\n]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
  }
  if (body.tags !== undefined) {
    patch.tags = Array.isArray(body.tags)
      ? body.tags.map(String)
      : String(body.tags)
          .split(/[,;\n]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
  }
  if (body.instructions !== undefined)
    patch.instructions = String(body.instructions);
  if (body.priority !== undefined && Number.isFinite(body.priority))
    patch.priority = Number(body.priority);
  if (body.status !== undefined) patch.status = body.status;
  const updated = updateRequest(id, patch);
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ request: updated });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const existing = getRequest(id);
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status === "published") {
    return Response.json(
      {
        error:
          "Cannot delete a published request. Unpublish the blog first (it reverts the status to draft).",
      },
      { status: 409 },
    );
  }
  const ok = deleteRequest(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
