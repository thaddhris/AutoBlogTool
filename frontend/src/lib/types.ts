import {
  DEFAULT_BODY_SYSTEM,
  DEFAULT_BODY_USER,
  DEFAULT_OUTLINE_SYSTEM,
  DEFAULT_OUTLINE_USER,
} from "./prompts";

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
  /** Resource-pool tags selected for this request; pool resources whose
   *  tags overlap with this set are auto-attached at generation time. */
  tags: string[];
  priority: number;
  status: RequestStatus;
  blog_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ─── resource pool ──────────────────────────────────────────────────────────

export interface PoolResource {
  id: string;
  name: string;
  type: ResourceType;
  source: string;
  content: string;
  tags: string[];
  status: ResourceStatus;
  error: string | null;
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

// ─── LLM-powered SEO audit ──────────────────────────────────────────────────
//
// Two parallel audits run on every blog:
//   - Traditional SEO: how a Google-style crawler/ranker sees the post.
//   - LLM/AI SEO: how an LLM-driven search or RAG system sees the post.

export type SeoAspectKey =
  | "keyword_optimization"
  | "metadata"
  | "heading_structure"
  | "readability"
  | "internal_linking"
  | "schema_markup"
  | "alt_text"
  | "content_structure";

export type LlmSeoAspectKey =
  | "semantic_clarity"
  | "ai_readability"
  | "retrieval_friendliness"
  | "chunk_quality"
  | "answerability"
  | "citation_potential"
  | "contextual_completeness"
  | "embedding_optimization"
  | "topic_coverage";

export interface SeoAspect {
  score: number; // 0–100
  notes: string[]; // bullet-point findings
}

export interface SeoRecommendation {
  priority: "high" | "medium" | "low";
  aspect: SeoAspectKey;
  action: string;
  /** If the action can be auto-applied via the seo-apply endpoint, this is
   *  the blog field name (`title_tag`, `meta_description`, `excerpt`,
   *  `tldr`, or `faq`). */
  field?: "title_tag" | "meta_description" | "excerpt" | "tldr" | "faq";
}

export interface SeoRewrites {
  title_tag?: string;
  meta_description?: string;
  excerpt?: string;
  tldr?: string;
  faq?: { q: string; a: string }[];
}

export interface SeoAudit {
  overall_score: number; // 0–100
  aspects: Record<SeoAspectKey, SeoAspect>;
  recommendations: SeoRecommendation[];
  rewrites: SeoRewrites;
  /** ISO timestamp of when the audit was produced. */
  generated_at: string;
  /** Snapshot of the blog state when audit ran (so admins know it's stale
   *  if they've edited since). */
  blog_updated_at_at_audit: string;
}

export interface LlmSeoRecommendation {
  priority: "high" | "medium" | "low";
  aspect: LlmSeoAspectKey;
  action: string;
}

export interface LlmSeoAudit {
  overall_score: number; // 0–100
  aspects: Record<LlmSeoAspectKey, SeoAspect>;
  recommendations: LlmSeoRecommendation[];
  generated_at: string;
  blog_updated_at_at_audit: string;
}

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
  /** Cached traditional SEO audit. Null until the admin runs one. */
  seo_audit: SeoAudit | null;
  /** Cached LLM / AI-crawlability SEO audit. Null until the admin runs one. */
  llm_seo_audit: LlmSeoAudit | null;
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

export type ImageProvider =
  | "placeholder"
  | "gemini"
  | "pexels"
  | "fal"
  | "fluxapi"
  | "openai"
  | "openai-agentic";

export type WriterProvider = "groq" | "gemini";

export interface Settings {
  /** Which LLM provider writes the blog posts. Image generation has its
   *  own `image_provider` setting and is independent of this one. */
  writer_provider: WriterProvider;
  groq_api_key: string;
  groq_model: string;
  /** Gemini model used for writing (when `writer_provider === "gemini"`).
   *  Distinct from `gemini_image_model` which is used only for hero images. */
  gemini_text_model: string;
  brand_name: string;
  brand_tone: string;
  cron_secret: string;
  batch_size: number;
  draft_hold_hours: number;
  publish_mode: PublishMode;
  publisher: Publisher;
  words_target: number;
  // Customizable prompts. Empty = use the platform default.
  outline_system_prompt: string;
  outline_user_template: string;
  body_system_prompt: string;
  body_user_template: string;
  // Image generation
  image_provider: ImageProvider;
  gemini_api_key: string;
  gemini_image_model: string;
  pexels_api_key: string;
  /** Fal AI key (https://fal.ai/dashboard/keys). Used for FLUX image
   *  generation when `image_provider === "fal"`. */
  fal_api_key: string;
  /** Fal endpoint slug, e.g. "fal-ai/flux/schnell" (fast + cheap),
   *  "fal-ai/flux/dev" (better quality), or "fal-ai/flux-pro/v1.1". */
  fal_image_model: string;
  /** fluxapi.ai key — used when `image_provider === "fluxapi"`. */
  fluxapi_api_key: string;
  /** fluxapi.ai model. Valid: "flux-kontext-pro" (default), "flux-kontext-max". */
  fluxapi_image_model: string;
  /** OpenAI API key — used for image generation when `image_provider === "openai"`. */
  openai_api_key: string;
  /** OpenAI image model. "gpt-image-1" (newer, sharper, default) or "dall-e-3". */
  openai_image_model: string;
  /** When true, the platform composites the post title (and brand name) onto
   *  every AI-generated banner using a glassmorphism panel. Doesn't affect
   *  placeholder or pexels banners. */
  banner_title_overlay: boolean;
  /** Max inline Pexels images to insert into the post body. 0 = off. The
   *  LLM is asked to drop [[image: query]] placeholders during body
   *  generation; the platform resolves them via Pexels (requires
   *  pexels_api_key). Hero banner is unaffected — it uses image_provider. */
  inline_images_max: number;
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
  writer_provider: "groq",
  groq_api_key: "",
  groq_model: "llama-3.3-70b-versatile",
  gemini_text_model: "gemini-2.5-flash",
  brand_name: "Faclon Labs",
  brand_tone:
    "Authoritative, technical-but-accessible, focused on industrial AI / IoT outcomes for plant operations leaders. Avoid hype; emphasize concrete value and ROI.",
  cron_secret: "",
  batch_size: 5,
  draft_hold_hours: 24,
  publish_mode: "auto",
  publisher: "markdown",
  words_target: 1200,
  outline_system_prompt: DEFAULT_OUTLINE_SYSTEM,
  outline_user_template: DEFAULT_OUTLINE_USER,
  body_system_prompt: DEFAULT_BODY_SYSTEM,
  body_user_template: DEFAULT_BODY_USER,
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
  pexels_api_key: "",
  fal_api_key: "",
  fal_image_model: "fal-ai/flux/schnell",
  fluxapi_api_key: "",
  fluxapi_image_model: "flux-kontext-pro",
  openai_api_key: "",
  openai_image_model: "gpt-image-1",
  banner_title_overlay: true,
  inline_images_max: 0,
  public_base_url: "",
  webflow_token: "",
  webflow_site_id: "",
  webflow_collection_id: "",
  webflow_featured_default: false,
};
