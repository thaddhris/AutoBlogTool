import { NextRequest } from "next/server";
import { getBlog, updateBlog } from "@/lib/blogs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const blog = getBlog(id);
  if (!blog) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ blog });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json();
  const patch: Parameters<typeof updateBlog>[1] = {};
  for (const k of [
    "title",
    "slug",
    "excerpt",
    "content_md",
    "meta_title",
    "meta_desc",
    "banner_url",
    "banner_alt",
    "status",
    "scheduled_at",
  ] as const) {
    if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k];
  }
  if (body.keywords !== undefined)
    patch.keywords = Array.isArray(body.keywords)
      ? body.keywords.map(String)
      : [];
  if (body.tags !== undefined)
    patch.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  if (body.faq !== undefined) patch.faq = body.faq;
  const updated = updateBlog(id, patch);
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ blog: updated });
}
