import { marked } from "marked";
import { getSettings } from "../settings";
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
 * Publishes a blog to a Webflow CMS collection in one shot using the
 * "items/live" endpoint, which both creates the item and publishes it live.
 *
 * Required settings:
 *   - webflow_token            (Bearer token; site- or workspace-scoped)
 *   - webflow_collection_id    (the target CMS collection)
 *
 * Field mapping assumes the collection has these slugs:
 *   name, slug, post-body, post-summary, featured
 * If your collection uses different slugs, edit the `fieldData` block below.
 */
export async function publish(blog: Blog): Promise<PublishResult> {
  const settings = getSettings();
  const token = settings.webflow_token;
  const collectionId = settings.webflow_collection_id;
  if (!token) throw new Error("Webflow token is not configured");
  if (!collectionId) throw new Error("Webflow collection ID is not configured");

  // Webflow's rich-text field expects HTML, not markdown.
  const html = marked.parse(blog.content_md || "", { async: false }) as string;

  const body = {
    fieldData: {
      name: blog.title,
      slug: blog.slug,
      "post-body": html,
      "post-summary": blog.excerpt,
      featured: settings.webflow_featured_default ?? false,
    },
  };

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

  // Read the body once — even on errors Webflow returns structured JSON.
  const raw = await res.text();
  let parsed: WebflowItemResponse | { message?: string; err?: string } = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    // leave parsed as {} so we fall through to the generic error
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
