import { NextRequest } from "next/server";
import { getBlog, updateBlog } from "@/lib/blogs";
import { logEvent } from "@/lib/db";

const APPLIABLE = [
  "title_tag",
  "meta_description",
  "excerpt",
  "tldr",
  "faq",
] as const;

type AppliableField = (typeof APPLIABLE)[number];

/**
 * Apply one or more rewrites from the cached SEO audit's `rewrites` block to
 * the blog. Caller sends `{ fields: ["title_tag", "meta_description"] }`;
 * server reads the cached audit and writes those fields. Unknown / unsafe
 * fields are silently ignored.
 *
 *   POST /api/blogs/<id>/seo-apply
 *   { "fields": ["title_tag", "meta_description", "tldr"] }
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const blog = getBlog(id);
  if (!blog) return Response.json({ error: "Blog not found" }, { status: 404 });
  if (!blog.seo_audit) {
    return Response.json(
      { error: "No SEO audit cached. Run an audit first." },
      { status: 400 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const requested: AppliableField[] = Array.isArray(body.fields)
    ? body.fields.filter((f: string): f is AppliableField =>
        (APPLIABLE as readonly string[]).includes(f),
      )
    : [];
  if (requested.length === 0) {
    return Response.json(
      { error: "Provide a non-empty `fields` array." },
      { status: 400 },
    );
  }

  const rewrites = blog.seo_audit.rewrites;
  const patch: Parameters<typeof updateBlog>[1] = {};
  const applied: string[] = [];

  if (requested.includes("title_tag") && rewrites.title_tag) {
    patch.meta_title = rewrites.title_tag;
    applied.push("title_tag");
  }
  if (requested.includes("meta_description") && rewrites.meta_description) {
    patch.meta_desc = rewrites.meta_description;
    applied.push("meta_description");
  }
  if (requested.includes("excerpt") && rewrites.excerpt) {
    patch.excerpt = rewrites.excerpt;
    applied.push("excerpt");
  }
  if (requested.includes("tldr") && rewrites.tldr) {
    patch.tldr = rewrites.tldr;
    applied.push("tldr");
  }
  if (requested.includes("faq") && rewrites.faq && rewrites.faq.length > 0) {
    patch.faq = rewrites.faq;
    applied.push("faq");
  }

  if (applied.length === 0) {
    return Response.json(
      {
        error:
          "Requested fields have no rewrite suggestions cached. Re-run audit to refresh.",
      },
      { status: 400 },
    );
  }

  const updated = updateBlog(id, patch);
  logEvent("seo.apply", `applied=${applied.join(",")}`, {
    blogId: id,
    payload: { applied },
  });
  return Response.json({ blog: updated, applied });
}
