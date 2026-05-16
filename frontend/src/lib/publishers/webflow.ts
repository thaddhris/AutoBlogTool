import { marked } from "marked";
import { getSettings } from "../settings";
import { absolutizeBannerUrl } from "../images";
import { jsonLdScriptBlock, jsonLdObjects } from "../seo";
import { Blog } from "../types";

export interface PublishResult {
  url: string;
}

interface WebflowItemResponse {
  id?: string;
  fieldData?: { slug?: string; [k: string]: unknown };
  [k: string]: unknown;
}

/**
 * Build the HTML body that Webflow's rich-text field will store. Includes:
 *   - the rendered markdown body
 *   - the JSON-LD <script> tags (BlogPosting + FAQPage + Breadcrumb), which
 *     Webflow's rich-text field preserves and the rendered page emits in <body>
 *     for crawlers to read
 *   - a Sources section if blog.sources is non-empty
 */
function buildBodyHtml(blog: Blog): string {
  const html = marked.parse(blog.content_md || "", { async: false }) as string;
  const parts = [html];

  if (blog.sources.length > 0) {
    const items = blog.sources
      .map(
        (s) =>
          `<li><a href="${s}" target="_blank" rel="noopener noreferrer">${s}</a></li>`,
      )
      .join("");
    parts.push(`<h2>Sources</h2>\n<ul>${items}</ul>`);
  }

  parts.push(jsonLdScriptBlock(blog));

  return parts.join("\n\n");
}

/**
 * Send a blog to Webflow's "items/live" endpoint (creates + publishes in one
 * call).
 *
 * Field mapping uses two layers:
 *  - Hardcoded core slugs that have existed since the first Webflow setup:
 *    `name`, `slug`, `post-body`, `post-summary`, `featured`.
 *  - Configurable extras driven by settings. Each is only sent if the
 *    corresponding `webflow_*_field` setting is non-empty AND we have data
 *    to send. This keeps the publisher robust if the collection schema
 *    doesn't have every field.
 */
export async function publish(blog: Blog): Promise<PublishResult> {
  const settings = getSettings();
  const token = settings.webflow_token;
  const collectionId = settings.webflow_collection_id;
  if (!token) throw new Error("Webflow token is not configured");
  if (!collectionId) throw new Error("Webflow collection ID is not configured");

  const fieldData: Record<string, unknown> = {
    name: blog.title,
    slug: blog.slug,
    "post-body": buildBodyHtml(blog),
    "post-summary": blog.excerpt,
    featured: settings.webflow_featured_default ?? false,
  };

  // Hero image (existing behavior)
  const imageField = settings.webflow_image_field?.trim();
  if (imageField && blog.banner_url) {
    const absolute = absolutizeBannerUrl(blog.banner_url);
    if (absolute && !absolute.startsWith("data:")) {
      fieldData[imageField] = {
        url: absolute,
        alt: blog.banner_alt ?? blog.title,
      };
    }
  }

  // Helper that only writes the field if the configured slug AND value exist.
  const sendIf = (slug: string | undefined | null, value: unknown) => {
    const s = (slug || "").trim();
    if (!s) return;
    if (value === null || value === undefined || value === "") return;
    fieldData[s] = value;
  };

  // SEO meta — these usually map to Webflow's built-in SEO fields. The
  // Webflow editor surfaces those as "SEO title" / "SEO description"; if the
  // collection has dedicated CMS fields for them, configure their slugs in
  // settings.
  sendIf(settings.webflow_title_tag_field, blog.meta_title);
  sendIf(settings.webflow_meta_description_field, blog.meta_desc);
  sendIf(settings.webflow_h1_field, blog.h1 ?? blog.title);
  sendIf(settings.webflow_tldr_field, blog.tldr);
  sendIf(settings.webflow_author_field, blog.author);
  sendIf(settings.webflow_primary_keyword_field, blog.primary_keyword);

  // Canonical (absolute URL based on site_url + slug)
  const canonical = settings.site_url
    ? `${settings.site_url.replace(/\/$/, "")}/blog/${blog.slug}`
    : null;
  sendIf(settings.webflow_canonical_field, canonical);

  // OG image — uses the hero, absolutized
  if (settings.webflow_og_image_field && blog.banner_url) {
    const absolute = absolutizeBannerUrl(blog.banner_url);
    if (absolute && !absolute.startsWith("data:")) {
      fieldData[settings.webflow_og_image_field.trim()] = {
        url: absolute,
        alt: blog.banner_alt ?? blog.title,
      };
    }
  }

  // JSON-LD as a dedicated text field (some Webflow templates render this in
  // <head> via an Embed element bound to a CMS field). The script tags are
  // included so the field value can be pasted straight into <head>.
  if (settings.webflow_json_ld_field) {
    const objs = jsonLdObjects(blog);
    const blocks = [objs.blogPosting, objs.faqPage, objs.breadcrumb].filter(
      Boolean,
    );
    const scripts = blocks
      .map(
        (b) =>
          `<script type="application/ld+json">${JSON.stringify(b)}</script>`,
      )
      .join("\n");
    sendIf(settings.webflow_json_ld_field, scripts);
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
