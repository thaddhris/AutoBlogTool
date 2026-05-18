import { marked } from "marked";
import { getSettings } from "../settings";
import { absolutizeBannerUrl } from "../images";
import { Blog } from "../types";

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
 * Render the markdown body to HTML and append FAQ + Sources sections.
 * Webflow's rich-text field doesn't have a separate FAQ slot on this
 * collection, so we inline it as an `<h2>FAQ</h2>` block followed by
 * question/answer pairs. JSON-LD is not injected — Webflow's rich-text
 * strips <script> tags. If JSON-LD is needed later, embed it via a
 * site-wide template Embed bound to a dedicated CMS field.
 */
function buildBodyHtml(blog: Blog): string {
  const html = marked.parse(blog.content_md || "", { async: false }) as string;
  const parts = [html];

  if (blog.faq.length > 0) {
    const faqHtml = blog.faq
      .map(
        (f) =>
          `<h3>${escapeHtml(f.q)}</h3>\n<p>${escapeHtml(f.a)}</p>`,
      )
      .join("\n\n");
    parts.push(`<h2>Frequently asked questions</h2>\n${faqHtml}`);
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

function readingTime(blog: Blog, wpm: number): string | null {
  if (!blog.word_count || blog.word_count < 1) return null;
  const mins = Math.max(1, Math.round(blog.word_count / Math.max(60, wpm)));
  return `${mins} Min${mins === 1 ? "" : "s"}`;
}

/**
 * Send a blog to Webflow's /items/live endpoint. Field mapping is driven by
 * the *_field settings — each one is a Webflow CMS field SLUG on the
 * configured collection. Empty slugs are silently skipped so the publisher
 * never sends keys the collection doesn't have.
 */
export async function publish(blog: Blog): Promise<PublishResult> {
  const settings = getSettings();
  const token = settings.webflow_token;
  const collectionId = settings.webflow_collection_id;
  if (!token) throw new Error("Webflow token is not configured");
  if (!collectionId) throw new Error("Webflow collection ID is not configured");

  // ── Core fields (slugs that have existed since the first Webflow setup) ──
  const fieldData: Record<string, unknown> = {
    name: blog.title,
    slug: blog.slug,
    "post-body": buildBodyHtml(blog),
    featured: settings.webflow_featured_default ?? false,
  };

  // Helper: only write the field if both the configured slug AND a value exist.
  const sendIf = (
    slug: string | undefined | null,
    value: unknown,
  ): void => {
    const s = (slug || "").trim();
    if (!s) return;
    if (value === null || value === undefined || value === "") return;
    fieldData[s] = value;
  };

  // ── Hero image (main-image by default) ──
  if (blog.banner_url) {
    const absolute = absolutizeBannerUrl(blog.banner_url);
    if (absolute && !absolute.startsWith("data:")) {
      const imageValue = {
        url: absolute,
        alt: blog.banner_alt ?? blog.title,
      };
      sendIf(settings.webflow_image_field, imageValue);
      // Thumbnail mirrors the main image. If a separate thumbnail provider is
      // wired in later, branch here.
      sendIf(settings.webflow_thumbnail_field, imageValue);
    }
  }

  // ── Excerpt / summary card text ──
  sendIf(settings.webflow_post_summary_field, blog.excerpt);

  // ── SEO meta (Meta Tag + Meta Description on the Faclon collection) ──
  sendIf(settings.webflow_meta_tag_field, blog.meta_title);
  sendIf(settings.webflow_meta_description_field, blog.meta_desc);

  // ── Reading time (computed from word_count) ──
  sendIf(
    settings.webflow_reading_time_field,
    readingTime(blog, settings.webflow_reading_wpm || 220),
  );

  // ── Reference fields: Webflow expects the referenced collection's item id.
  //    A blog-level override would go here in the future; for now we use the
  //    single default configured in settings. Skipped silently if the id is
  //    blank, so it's safe to leave unset during early setup.
  sendIf(settings.webflow_author_field, settings.webflow_author_item_id);
  if (
    settings.webflow_categories_field &&
    settings.webflow_default_category_id
  ) {
    // Multi-reference fields in Webflow v2 take an array of ids. The Faclon
    // collection's "Categories" pill supports multi-select.
    fieldData[settings.webflow_categories_field.trim()] = [
      settings.webflow_default_category_id.trim(),
    ];
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
