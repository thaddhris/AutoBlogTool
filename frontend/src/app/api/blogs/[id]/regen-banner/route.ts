import { NextRequest } from "next/server";
import { getBlog, updateBlog } from "@/lib/blogs";
import { generateBanner } from "@/lib/images";
import { applyTitleOverlay, bannerUrlToPath } from "@/lib/bannerCompose";
import { getSettings } from "@/lib/settings";
import { logEvent } from "@/lib/db";

/**
 * Re-run the banner pipeline (image provider + glass-panel overlay) on an
 * existing draft. Useful when the admin doesn't like the first generation
 * and wants another shot without re-running the entire blog pipeline.
 *
 * Status guard: refuses to touch published / publishing blogs — the live
 * CMS item would still point at the old URL and the new file would just
 * sit there orphaned. Unpublish first.
 *
 *   POST /api/blogs/<id>/regen-banner
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const blog = getBlog(id);
  if (!blog) return Response.json({ error: "Blog not found" }, { status: 404 });
  if (blog.status === "published" || blog.status === "publishing") {
    return Response.json(
      {
        error:
          "Cannot regenerate a published blog's banner — the live CMS item would still point at the old image. Unpublish first.",
      },
      { status: 409 },
    );
  }

  try {
    const settings = getSettings();
    const banner = await generateBanner({
      title: blog.title,
      description: blog.meta_desc || blog.excerpt,
      brand: settings.brand_name,
      primary_keyword: blog.primary_keyword,
    });

    // Apply the glassmorphism title overlay so the new banner matches the
    // visual style of the rest of the system. Skip silently if the user
    // disabled the overlay in Settings or the file isn't on local disk
    // (e.g. fallback placeholder data: URL).
    if (
      settings.banner_title_overlay !== false &&
      banner.url.startsWith("/api/banners/")
    ) {
      try {
        await applyTitleOverlay(bannerUrlToPath(banner.url), {
          brand: settings.brand_name,
          title: blog.title,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logEvent("image.overlay.fail", `regen-banner → ${msg}`, { blogId: id });
      }
    }

    const updated = updateBlog(id, {
      banner_url: banner.url,
      banner_alt: banner.alt,
    });
    logEvent("blog.banner.regen", `${blog.title} → ${banner.url}`, {
      blogId: id,
    });
    return Response.json({ blog: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent("blog.banner.regen.fail", msg, { blogId: id });
    return Response.json({ error: msg }, { status: 500 });
  }
}
