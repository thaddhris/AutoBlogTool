import { marked } from "marked";
import { getSettings } from "../settings";
import { absolutizeBannerUrl } from "../images";
import { getRequest } from "../requests";
import { decorateBlogBodyHtml } from "../seoBlocks";
import { Blog, ContentField, WebflowFieldMapEntry } from "../types";

export interface PublishResult {
  url: string;
}

interface WebflowItemResponse {
  id?: string;
  fieldData?: { slug?: string; [k: string]: unknown };
  [k: string]: unknown;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the markdown body to HTML. The FAQ block is appended inline ONLY
 * when there's no separate `faq_html` mapping — otherwise the admin would
 * see the FAQ twice (once in the body field, once in its own field).
 * Sources always render at the end of the body because we don't expose a
 * standalone sources mapping yet.
 *
 * Webflow's rich-text field strips <script> tags, so JSON-LD never goes in
 * the body. Map `schema_json` to a dedicated PlainText / Code field if you
 * want it on Webflow.
 */
function buildBodyHtml(blog: Blog, opts: { includeFaq: boolean }): string {
  const raw = marked.parse(blog.content_md || "", { async: false }) as string;
  // Safety net: if the writer forgot the AEO Quick Answer wrapper but we
  // do have a `tldr` field, inject it as the first block so Speakable
  // schema (selector `.quick-answer`) still has a target. We check both
  // the explicit class and a loose attribute match because some HTML
  // sanitisers strip / rewrite class= attributes.
  let html = raw;
  const hasQuickAnswer = /class\s*=\s*["'][^"']*\bquick-answer\b/i.test(raw);
  if (!hasQuickAnswer && blog.tldr && blog.tldr.trim()) {
    const escaped = escapeHtml(blog.tldr.trim());
    html =
      `<div class="quick-answer"><strong>Quick answer:</strong> ${escaped}</div>\n\n` +
      raw;
  }
  // Apply every body-decoration block (TOC + mid-CTA + final-CTA +
  // related + author bio) — same logic the admin Preview uses.
  html = decorateBlogBodyHtml(html, blog);
  const parts = [html];

  if (opts.includeFaq && blog.faq.length > 0) {
    parts.push(
      `<h2>Frequently asked questions</h2>\n${buildFaqHtml(blog)}`,
    );
  }

  if (blog.sources.length > 0) {
    const items = blog.sources
      .map(
        (s) =>
          `<li><a href="${escapeHtml(s)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s)}</a></li>`,
      )
      .join("");
    parts.push(`<h2>Sources</h2>\n<ul>${items}</ul>`);
  }

  return parts.join("\n\n");
}

function buildFaqHtml(blog: Blog): string {
  if (!blog.faq.length) return "";
  return blog.faq
    .map(
      (f) =>
        `<h3>${escapeHtml(f.q)}</h3>\n<p>${escapeHtml(f.a)}</p>`,
    )
    .join("\n\n");
}

function readingTime(blog: Blog, wpm: number): string | null {
  if (!blog.word_count || blog.word_count < 1) return null;
  const mins = Math.max(1, Math.round(blog.word_count / Math.max(60, wpm)));
  return `${mins} Min${mins === 1 ? "" : "s"}`;
}

/**
 * Resolve one of our ContentField identifiers to the actual value we'd send
 * to Webflow. Returns `null` for fields that have no value on this blog
 * (the caller should then skip the Webflow field rather than send null).
 */
function resolveContentField(
  field: ContentField | null,
  blog: Blog,
  ctx: {
    bodyHtml: string;
    faqHtml: string;
    readingTimeText: string | null;
    authorRef: string;
    categoriesRef: string[];
    featuredDefault: boolean;
  },
): unknown {
  if (!field) return null;
  switch (field) {
    case "title":
      return blog.title || null;
    case "slug":
      return blog.slug || null;
    case "body_html":
      return ctx.bodyHtml || null;
    case "excerpt":
      return blog.excerpt || null;
    case "meta_title":
      return blog.meta_title || null;
    case "meta_description":
      return blog.meta_desc || null;
    case "hero_image": {
      if (!blog.banner_url) return null;
      const absolute = absolutizeBannerUrl(blog.banner_url);
      if (!absolute || absolute.startsWith("data:")) return null;
      return { url: absolute, alt: blog.banner_alt ?? blog.title };
    }
    case "hero_image_alt":
      return blog.banner_alt || blog.title || null;
    case "reading_time":
      return ctx.readingTimeText;
    case "faq_html":
      return ctx.faqHtml || null;
    case "schema_json":
      return blog.schema_json || null;
    case "author_ref":
      return ctx.authorRef || null;
    case "categories_ref":
      return ctx.categoriesRef.length > 0 ? ctx.categoriesRef : null;
    case "featured_flag":
      return ctx.featuredDefault;
  }
}

/**
 * Send a blog to Webflow's /items/live endpoint.
 *
 * Field selection uses one of two paths:
 *   1. **New mapping** (preferred) — `settings.webflow_field_mappings[collectionId]`
 *      populated via Settings → Webflow → "Fetch fields". Each entry says
 *      which of our `ContentField`s feeds which Webflow slug, with an
 *      `enabled` flag. Only enabled fields with a resolved value are sent.
 *   2. **Legacy slug fields** — when no mapping exists for the active
 *      collection, fall back to the hand-typed `webflow_*_field` settings
 *      so existing setups keep working until they hit "Fetch fields" once.
 */
export async function publish(blog: Blog): Promise<PublishResult> {
  const settings = getSettings();
  const token = settings.webflow_token;
  // Per-request override > global Settings default. The override is
  // stored on the parent blog_request, so a single Settings instance can
  // route different posts to different collections (e.g. one batch to a
  // staging collection, another to prod). Empty / null falls back to the
  // global value.
  const req = getRequest(blog.request_id);
  const collectionId =
    (req?.collection_id && req.collection_id.trim()) ||
    settings.webflow_collection_id;
  if (!token) throw new Error("Webflow token is not configured");
  if (!collectionId)
    throw new Error(
      "No Webflow collection ID configured (neither the global default in Settings nor a per-request override).",
    );

  // Decide whether the FAQ section goes inline in the body. If the active
  // collection's mapping pipes `faq_html` into its own field, keep FAQ out
  // of the body so it doesn't render twice. Otherwise (no mapping, or
  // mapping doesn't route faq_html) inline it in the body as before.
  const activeMapping = settings.webflow_field_mappings?.[collectionId];
  const faqGoesToOwnField = activeMapping
    ? Object.values(activeMapping.fields).some(
        (f) => f.enabled && f.contentField === "faq_html",
      )
    : false;
  const bodyHtml = buildBodyHtml(blog, { includeFaq: !faqGoesToOwnField });
  const faqHtml = buildFaqHtml(blog);
  const readingTimeText = readingTime(
    blog,
    settings.webflow_reading_wpm || 220,
  );
  const ctx = {
    bodyHtml,
    faqHtml,
    readingTimeText,
    authorRef: (settings.webflow_author_item_id || "").trim(),
    categoriesRef: settings.webflow_default_category_id
      ? [settings.webflow_default_category_id.trim()]
      : [],
    featuredDefault: settings.webflow_featured_default ?? false,
  };

  const fieldData: Record<string, unknown> = {};
  const mapping = settings.webflow_field_mappings?.[collectionId];

  if (mapping && Object.keys(mapping.fields).length > 0) {
    // ── Path 1: driven by the saved per-collection mapping. ─────────────────
    for (const entry of Object.values(mapping.fields) as WebflowFieldMapEntry[]) {
      if (!entry.enabled) continue;
      const value = resolveContentField(entry.contentField, blog, ctx);
      if (value === null || value === undefined || value === "") continue;
      // MultiReference fields expect arrays; categories_ref already returns
      // an array. Everything else passes through unchanged.
      fieldData[entry.slug] = value;
    }
    // Hard requirements Webflow imposes on every CMS collection. If the
    // mapping didn't cover them (e.g. someone unchecked `name`), force them
    // here so the request doesn't 400.
    if (!("name" in fieldData)) fieldData.name = blog.title;
    if (!("slug" in fieldData)) fieldData.slug = blog.slug;
  } else {
    // ── Path 2: legacy per-slug settings (kept for back-compat). ────────────
    fieldData.name = blog.title;
    fieldData.slug = blog.slug;
    fieldData["post-body"] = bodyHtml;
    fieldData.featured = ctx.featuredDefault;
    const sendIf = (slug: string | undefined | null, value: unknown): void => {
      const s = (slug || "").trim();
      if (!s) return;
      if (value === null || value === undefined || value === "") return;
      fieldData[s] = value;
    };
    if (blog.banner_url) {
      const absolute = absolutizeBannerUrl(blog.banner_url);
      if (absolute && !absolute.startsWith("data:")) {
        const imageValue = {
          url: absolute,
          alt: blog.banner_alt ?? blog.title,
        };
        sendIf(settings.webflow_image_field, imageValue);
        sendIf(settings.webflow_thumbnail_field, imageValue);
      }
    }
    sendIf(settings.webflow_post_summary_field, blog.excerpt);
    sendIf(settings.webflow_meta_tag_field, blog.meta_title);
    sendIf(settings.webflow_meta_description_field, blog.meta_desc);
    sendIf(settings.webflow_reading_time_field, readingTimeText);
    sendIf(settings.webflow_author_field, ctx.authorRef);
    if (
      settings.webflow_categories_field &&
      settings.webflow_default_category_id
    ) {
      fieldData[settings.webflow_categories_field.trim()] = ctx.categoriesRef;
    }
  }

  const body = { fieldData };

  const res = await fetch(
    `https://api.webflow.com/v2/collections/${encodeURIComponent(collectionId)}/items/live`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const raw = await res.text();
  let parsed: WebflowItemResponse | { message?: string; err?: string } = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    /* parsed stays empty */
  }

  if (!res.ok) {
    const detail =
      ("message" in parsed && parsed.message) ||
      ("err" in parsed && parsed.err) ||
      raw.slice(0, 300) ||
      res.statusText;
    throw new Error(`Webflow ${res.status}: ${detail}`);
  }

  const itemId =
    "id" in parsed && typeof parsed.id === "string" ? parsed.id : undefined;
  const url = itemId
    ? `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}`
    : `https://api.webflow.com/v2/collections/${collectionId}/items?slug=${encodeURIComponent(
        blog.slug,
      )}`;
  return { url };
}
