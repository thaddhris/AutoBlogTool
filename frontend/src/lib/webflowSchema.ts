import type { ContentField, WebflowFieldMapEntry, WebflowMapping } from "./types";

// ─── Webflow Collections API client ────────────────────────────────────────
//
// Wraps `GET /v2/collections/{id}` and turns the response into our internal
// `WebflowMapping` shape with smart-default contentField guesses based on
// each field's slug/type. The mapping is what the publisher uses to decide
// which blog value goes into which Webflow field — see publishers/webflow.ts.

interface WebflowCollectionField {
  id: string;
  isRequired?: boolean;
  isEditable?: boolean;
  type: string;
  slug: string;
  displayName: string;
  helpText?: string;
  validations?: Record<string, unknown>;
}

interface WebflowCollectionResponse {
  id?: string;
  displayName?: string;
  slug?: string;
  singularName?: string;
  fields?: WebflowCollectionField[];
  message?: string;
  err?: string;
}

/**
 * Guess which of our blog-side values most naturally feeds a given Webflow
 * field, based on its slug + type. Slug rules first (most specific), type
 * rules second (least specific). Returns null when no obvious match — the
 * admin can still pick one manually from the dropdown.
 *
 * The rules are conservative on purpose: if we're not sure, return null
 * rather than guessing wrong and silently overwriting a Webflow field with
 * the wrong content.
 */
export function defaultContentFieldFor(
  slug: string,
  type: string,
): ContentField | null {
  const s = slug.toLowerCase();
  const t = type;

  // ── Strong slug-based matches ─────────────────────────────────────────────
  if (s === "name" || s === "title") return "title";
  if (s === "slug") return "slug";
  if (s === "post-body" || s === "body" || s === "content" || s === "rich-text")
    return "body_html";
  if (
    s === "post-summary" ||
    s === "summary" ||
    s === "excerpt" ||
    s === "description"
  )
    return "excerpt";
  if (s === "meta-tag" || s === "meta-title" || s === "seo-title")
    return "meta_title";
  if (s === "meta-description" || s === "seo-description")
    return "meta_description";
  if (s === "main-image" || s === "hero-image" || s === "thumbnail-image")
    return "hero_image";
  if (s === "alt" || s.includes("image-alt")) return "hero_image_alt";
  if (s === "reading-time") return "reading_time";
  if (s === "author") return "author_ref";
  if (s === "categories" || s === "category") return "categories_ref";
  if (s === "featured") return "featured_flag";
  if (s === "faq" || s === "frequently-asked-questions") return "faq_html";
  if (s === "schema" || s === "json-ld" || s === "structured-data")
    return "schema_json";

  // ── Type-based weak matches (only when slug didn't already win) ──────────
  if (t === "Image" || t === "ImageRef") return "hero_image";
  if (t === "RichText") return "body_html";
  if (t === "Switch" || t === "Bool") return null; // could be featured or
  // anything; leave to admin
  if (t === "ItemRef" || t === "Reference") return null;
  if (t === "MultiReference" || t === "ItemRefSet") return null;

  return null;
}

/**
 * Fetch a Webflow collection's schema and return the mapping shape used by
 * the rest of the app. Throws on auth failure or unknown collection so the
 * caller surfaces a clean error to the admin.
 */
export async function fetchWebflowCollectionMapping(
  token: string,
  collectionId: string,
  /** When provided, existing per-field overrides (enabled / contentField)
   *  are preserved for fields that still exist in the new schema. Fields
   *  newly added to the collection get the smart-default mapping. Fields
   *  removed from the collection are dropped. */
  previous?: WebflowMapping | null,
): Promise<WebflowMapping> {
  const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
  if (!cleanToken) throw new Error("Webflow token is empty");
  if (!collectionId.trim()) throw new Error("Webflow collection ID is empty");

  const res = await fetch(
    `https://api.webflow.com/v2/collections/${encodeURIComponent(collectionId.trim())}`,
    {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/json",
      },
    },
  );
  const raw = await res.text();
  let parsed: WebflowCollectionResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as WebflowCollectionResponse) : {};
  } catch {
    /* leave empty */
  }
  if (!res.ok) {
    const detail =
      parsed.message || parsed.err || raw.slice(0, 300) || res.statusText;
    throw new Error(`Webflow ${res.status}: ${detail}`);
  }
  if (!parsed.fields || !Array.isArray(parsed.fields)) {
    throw new Error(
      "Webflow returned an unexpected response — no `fields` array on the collection.",
    );
  }

  const fields: Record<string, WebflowFieldMapEntry> = {};
  for (const f of parsed.fields) {
    if (!f.slug) continue;
    const prev = previous?.fields[f.slug];
    fields[f.slug] = {
      slug: f.slug,
      displayName: f.displayName || f.slug,
      type: f.type,
      required: Boolean(f.isRequired),
      // Preserve user choices when a field already exists; otherwise enable
      // the field and pick its smart default. Webflow-required fields are
      // always enabled (the UI also blocks unchecking them).
      enabled: prev ? prev.enabled || Boolean(f.isRequired) : true,
      contentField: prev
        ? prev.contentField
        : defaultContentFieldFor(f.slug, f.type),
    };
  }

  return {
    fetched_at: new Date().toISOString(),
    collection_display_name:
      parsed.displayName || parsed.slug || "Unnamed collection",
    fields,
  };
}

/** Friendly labels for the ContentField enum, used by the settings UI. */
export const CONTENT_FIELD_LABELS: Record<ContentField, string> = {
  title: "Post title",
  slug: "URL slug",
  body_html: "Body (HTML rendered from markdown)",
  excerpt: "Excerpt / hook",
  meta_title: "SEO title",
  meta_description: "SEO description",
  hero_image: "Hero image",
  hero_image_alt: "Hero image alt text",
  reading_time: "Reading time (e.g. \"5 Mins\")",
  faq_html: "FAQ section (HTML)",
  schema_json: "JSON-LD schema",
  author_ref: "Author reference (uses default Author Item ID)",
  categories_ref: "Categories reference (uses default Category ID)",
  featured_flag: "Featured flag (boolean)",
};

export const CONTENT_FIELDS: ContentField[] = [
  "title",
  "slug",
  "body_html",
  "excerpt",
  "meta_title",
  "meta_description",
  "hero_image",
  "hero_image_alt",
  "reading_time",
  "faq_html",
  "schema_json",
  "author_ref",
  "categories_ref",
  "featured_flag",
];
