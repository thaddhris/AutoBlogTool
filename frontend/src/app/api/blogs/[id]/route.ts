import { NextRequest } from "next/server";
import { deleteBlog, getBlog, updateBlog, BlogPatch } from "@/lib/blogs";
import { logEvent } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const blog = getBlog(id);
  if (!blog) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ blog });
}

const SCALAR_KEYS = [
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
  "primary_keyword",
] as const;

const ARRAY_KEYS = [
  "keywords",
  "tags",
  "secondary_keywords",
  "sources",
] as const;

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: BlogPatch = {};

  for (const k of SCALAR_KEYS) {
    if (body[k] !== undefined)
      (patch as Record<string, unknown>)[k] = body[k];
  }

  for (const k of ARRAY_KEYS) {
    if (body[k] === undefined) continue;
    if (Array.isArray(body[k])) {
      (patch as Record<string, unknown>)[k] = (body[k] as unknown[]).map(
        String,
      );
    } else if (typeof body[k] === "string") {
      (patch as Record<string, unknown>)[k] = (body[k] as string)
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  if (body.faq !== undefined)
    patch.faq = body.faq as { q: string; a: string }[];

  const updated = updateBlog(id, patch);
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ blog: updated });
}

/**
 * Hard-delete a blog. Refuses to touch published / publishing blogs to avoid
 * orphaning the live CMS item — the admin should hit Unpublish first, which
 * reverts the local row to draft and then DELETE will work.
 *
 *   DELETE /api/blogs/<id>
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const existing = getBlog(id);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "published" || existing.status === "publishing") {
    return Response.json(
      {
        error:
          "Cannot delete a published or publishing blog. Open the blog and click Unpublish first — that reverts it to draft, then delete will work.",
      },
      { status: 409 },
    );
  }
  const ok = deleteBlog(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  logEvent("blog.delete", existing.title, { blogId: id });
  return Response.json({ ok: true });
}
