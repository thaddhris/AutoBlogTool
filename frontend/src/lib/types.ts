export type ResourceType = "pdf" | "docx" | "url" | "note" | "doc";

export type ResourceStatus = "pending" | "processing" | "ready" | "error";

export interface Resource {
  id: string;
  request_id: string;
  name: string;
  type: ResourceType;
  source: string;
  content: string;
  status: ResourceStatus;
  error: string | null;
  created_at: string;
}

// Stages of a blog request as it flows through the queue.
//  - pending:   waiting in queue, not yet picked
//  - processing: AI is actively generating
//  - draft:      generated, awaiting review (publish_mode=review) or scheduling
//  - scheduled:  has scheduled_at in the future
//  - published:  successfully published
//  - failed:     generation or publish errored out
export type RequestStatus =
  | "pending"
  | "processing"
  | "draft"
  | "scheduled"
  | "published"
  | "failed";

export interface BlogRequest {
  id: string;
  label: string;
  topic: string;
  keywords: string[];
  instructions: string;
  priority: number;
  status: RequestStatus;
  blog_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type BlogStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type FocusIntent = "informational" | "commercial" | "transactional";

export interface QualityWarning {
  kind:
    | "readability"
    | "keyword_density"
    | "uniqueness"
    | "title_tag_length"
    | "meta_description_length"
    | "missing_field";
  message: string;
  value?: number | string | null;
}

export interface Blog {
  id: string;
  request_id: string;
  title: string;
  slug: string;
  excerpt: string;
  content_md: string;
  // ── Legacy columns (canonical for: title tag, meta description, hero image) ──
  meta_title: string; // SEO spec calls this "title_tag"
  meta_desc: string; // SEO spec calls this "meta_description"
  keywords: string[];
  tags: string[];
  faq: { q: string; a: string }[];
  schema_json: string;
  banner_url: string | null; // SEO spec calls this "hero_image_url"
  banner_alt: string | null; // SEO spec calls this "hero_image_alt"
  // ── Phase-A SEO additions (all nullable on existing rows) ──
  h1: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  focus_intent: FocusIntent | null;
  tldr: string | null;
  readability_score: number | null;
  keyword_density: number | null;
  uniqueness_score: number | null;
  quality_warnings: QualityWarning[];
  claims_to_verify: string[];
  author: string | null;
  reviewed_by: string | null;
  sources: string[];
  internal_links_resolved: number;
  word_count: number | null;
  // ── Lifecycle ──
  status: BlogStatus;
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
}

// "auto"   = after generation, set scheduled_at = now + draft_hold_hours and let
//            it auto-publish when the timer expires.
// "manual" = after generation, leave the draft as-is. Admin must publish or
//            schedule it explicitly. No auto-publish timer.
export type PublishMode = "auto" | "manual";

export type Publisher = "markdown" | "webflow";

export type ImageProvider = "placeholder" | "gemini";

export interface Settings {
  groq_api_key: string;
  groq_model: string;
  brand_name: string;
  brand_tone: string;
  cron_secret: string;
  batch_size: number;
  draft_hold_hours: number;
  publish_mode: PublishMode;
  publisher: Publisher;
  words_target: number;
  // Image generation
  image_provider: ImageProvider;
  gemini_api_key: string;
  gemini_image_model: string;
  // Absolute base URL (e.g. https://autoblogtool.iocompute.ai). Used to turn
  // locally-saved banners into URLs that Webflow can fetch.
  public_base_url: string;
  // Public site root where /blog/<slug> lives (e.g. https://faclonlabs.com).
  // Used by the internal-link resolver to produce absolute URLs and by the
  // JSON-LD builder if/when JSON-LD is shipped.
  site_url: string;
  // Webflow-specific (only used when publisher === "webflow")
  //
  // The *_field strings are the SLUGS Webflow uses for each CMS field on
  // the configured collection. Defaults match the Faclon "Blog Posts"
  // collection shown in the v1 setup. Leave any blank to skip that field —
  // the publisher will silently drop the value.
  webflow_token: string;
  webflow_site_id: string;
  webflow_collection_id: string;
  webflow_featured_default: boolean;
  webflow_image_field: string; // main hero image slug, default "main-image"
  webflow_thumbnail_field: string; // grid thumbnail slug, default "thumbnail-image"
  webflow_post_summary_field: string; // grid excerpt slug, default "post-summary"
  webflow_reading_time_field: string; // text slug, default "reading-time"
  webflow_meta_tag_field: string; // SEO title slug, default "meta-tag"
  webflow_meta_description_field: string; // SEO description slug, default "meta-description"
  // Reference fields — Webflow expects the referenced collection's ITEM ID
  // (not a string). If a default is configured we attach it to every post.
  webflow_author_field: string; // slug, default "author"
  webflow_author_item_id: string; // the author item to reference
  webflow_categories_field: string; // slug, default "categories"
  webflow_default_category_id: string; // category item id to use by default
  // Words per minute used to compute reading_time from word_count.
  webflow_reading_wpm: number;
}

export const DEFAULT_SETTINGS: Settings = {
  groq_api_key: "",
  groq_model: "llama-3.3-70b-versatile",
  brand_name: "Faclon Labs",
  brand_tone:
    "Authoritative, technical-but-accessible, focused on industrial AI / IoT outcomes for plant operations leaders. Avoid hype; emphasize concrete value and ROI.",
  cron_secret: "",
  batch_size: 5,
  draft_hold_hours: 24,
  publish_mode: "auto",
  publisher: "markdown",
  words_target: 1200,
  site_url: "",
  webflow_image_field: "main-image",
  webflow_thumbnail_field: "thumbnail-image",
  webflow_post_summary_field: "post-summary",
  webflow_reading_time_field: "reading-time",
  webflow_meta_tag_field: "meta-tag",
  webflow_meta_description_field: "meta-description",
  webflow_author_field: "author",
  webflow_author_item_id: "",
  webflow_categories_field: "categories",
  webflow_default_category_id: "",
  webflow_reading_wpm: 220,
  image_provider: "placeholder",
  gemini_api_key: "",
  gemini_image_model: "gemini-3.1-flash-image",
  public_base_url: "",
  webflow_token: "",
  webflow_site_id: "",
  webflow_collection_id: "",
  webflow_featured_default: false,
};
