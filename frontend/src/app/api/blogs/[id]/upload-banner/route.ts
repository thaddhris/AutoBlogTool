import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { getBlog, updateBlog } from "@/lib/blogs";
import { applyTitleOverlay } from "@/lib/bannerCompose";
import { getSettings } from "@/lib/settings";
import { logEvent } from "@/lib/db";

const BANNERS_DIR = path.join(process.cwd(), ".data", "banners");
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — generous; gpt-image-1 outputs are ~3 MB.

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

/**
 * Replace the banner with an admin-uploaded image.
 *
 * Accepts `multipart/form-data` with a `file` field. The same status guard
 * as regen-banner applies — refuses to touch published blogs.
 *
 * The uploaded file is written to `.data/banners/<id>.<ext>`, the glass-
 * panel title overlay is applied (so an external photo gets the same brand
 * treatment as an AI-generated one), and `blogs.banner_url` is updated.
 *
 *   POST /api/blogs/<id>/upload-banner
 *   FormData: { file: <image/png|jpeg|webp>, alt?: string }
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const blog = getBlog(id);
  if (!blog) return Response.json({ error: "Blog not found" }, { status: 404 });
  if (blog.status === "published" || blog.status === "publishing") {
    return Response.json(
      {
        error:
          "Cannot change a published blog's banner — unpublish first so the CMS picks up the new image.",
      },
      { status: 409 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const customAlt =
    typeof form?.get("alt") === "string"
      ? (form?.get("alt") as string).trim()
      : "";
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Provide a `file` form field with an image." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `File is ${file.size} bytes — max is ${MAX_BYTES}.` },
      { status: 413 },
    );
  }
  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return Response.json(
      {
        error: `Unsupported file type "${file.type}". Use PNG, JPEG, or WebP.`,
      },
      { status: 415 },
    );
  }

  if (!fs.existsSync(BANNERS_DIR))
    fs.mkdirSync(BANNERS_DIR, { recursive: true });
  const filename = `${Date.now().toString(36)}-${nanoid(8)}.${ext}`;
  const absPath = path.join(BANNERS_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(absPath, buffer);

  const settings = getSettings();
  const altText = customAlt || `${settings.brand_name} — ${blog.title}`;

  // Apply the same title overlay we apply to AI-generated banners so the
  // visual style stays uniform across the brand. Skip silently if the user
  // disabled overlays globally.
  if (settings.banner_title_overlay !== false) {
    try {
      await applyTitleOverlay(absPath, {
        brand: settings.brand_name,
        title: blog.title,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent("image.overlay.fail", `upload-banner → ${msg}`, { blogId: id });
    }
  }

  const newUrl = `/api/banners/${filename}`;
  const updated = updateBlog(id, {
    banner_url: newUrl,
    banner_alt: altText,
  });
  logEvent("blog.banner.upload", `${blog.title} → ${newUrl}`, { blogId: id });
  return Response.json({ blog: updated });
}
