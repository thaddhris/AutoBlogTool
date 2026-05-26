import { NextRequest } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { Settings } from "@/lib/types";

type MaskedSettings = Settings & {
  has_groq_key: boolean;
  has_webflow_token: boolean;
  has_gemini_key: boolean;
  has_pexels_key: boolean;
  has_fal_key: boolean;
  has_fluxapi_key: boolean;
  has_openai_key: boolean;
  has_dataforseo_creds: boolean;
  has_exa_key: boolean;
  has_google_indexing_sa: boolean;
};

const SECRET_KEYS: (keyof Settings)[] = [
  "groq_api_key",
  "webflow_token",
  "gemini_api_key",
  "pexels_api_key",
  "fal_api_key",
  "fluxapi_api_key",
  "openai_api_key",
  "dataforseo_password",
  "exa_api_key",
  "google_indexing_service_account_json",
];

function maskValue(v: string): string {
  return v ? "•••••••••" + v.slice(-4) : "";
}

function mask(s: Settings): MaskedSettings {
  return {
    ...s,
    groq_api_key: maskValue(s.groq_api_key),
    webflow_token: maskValue(s.webflow_token),
    gemini_api_key: maskValue(s.gemini_api_key),
    pexels_api_key: maskValue(s.pexels_api_key),
    fal_api_key: maskValue(s.fal_api_key),
    fluxapi_api_key: maskValue(s.fluxapi_api_key),
    openai_api_key: maskValue(s.openai_api_key),
    dataforseo_password: maskValue(s.dataforseo_password),
    exa_api_key: maskValue(s.exa_api_key),
    // The service-account JSON is huge — we just emit a one-line redaction
    // when present so the UI can show "configured" without echoing the key.
    google_indexing_service_account_json: s.google_indexing_service_account_json
      ? "•••••••••• (service account configured)"
      : "",
    has_groq_key: Boolean(s.groq_api_key),
    has_webflow_token: Boolean(s.webflow_token),
    has_gemini_key: Boolean(s.gemini_api_key),
    has_pexels_key: Boolean(s.pexels_api_key),
    has_fal_key: Boolean(s.fal_api_key),
    has_fluxapi_key: Boolean(s.fluxapi_api_key),
    has_openai_key: Boolean(s.openai_api_key),
    has_dataforseo_creds: Boolean(s.dataforseo_login && s.dataforseo_password),
    has_exa_key: Boolean(s.exa_api_key),
    has_google_indexing_sa: Boolean(s.google_indexing_service_account_json),
  };
}

export async function GET() {
  return Response.json({ settings: mask(getSettings()) });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Partial<Settings>;
  const allowed: (keyof Settings)[] = [
    "writer_provider",
    "groq_api_key",
    "groq_model",
    "gemini_text_model",
    "brand_name",
    "brand_tone",
    "cron_secret",
    "batch_size",
    "draft_hold_hours",
    "publish_mode",
    "publisher",
    "words_target",
    "outline_system_prompt",
    "outline_user_template",
    "body_system_prompt",
    "body_user_template",
    "image_provider",
    "gemini_api_key",
    "gemini_image_model",
    "pexels_api_key",
    "fal_api_key",
    "fal_image_model",
    "fluxapi_api_key",
    "fluxapi_image_model",
    "openai_api_key",
    "openai_image_model",
    "banner_title_overlay",
    "dataforseo_login",
    "dataforseo_password",
    "dataforseo_location_code",
    "dataforseo_language_code",
    "dataforseo_min_search_volume",
    "dataforseo_max_keyword_difficulty",
    "serp_analysis_enabled",
    "topic_discovery_enabled",
    "topic_discovery_seeds",
    "topic_discovery_excluded_keywords",
    "topic_discovery_intent_filter",
    "topic_discovery_max_new_requests",
    "topic_discovery_min_relevance",
    "topic_discovery_target_industries",
    "topic_discovery_non_target_examples",
    "exa_api_key",
    "exa_sources_enabled",
    "exa_num_sources",
    "author_bio_name",
    "author_bio_title",
    "author_bio_text",
    "author_bio_image_url",
    "author_bio_url",
    "related_articles_enabled",
    "related_articles_count",
    "auto_aggregate_rating",
    "default_rating_value",
    "default_rating_count",
    "toc_enabled",
    "mid_cta_enabled",
    "mid_cta_headline",
    "mid_cta_body",
    "mid_cta_button_label",
    "mid_cta_url",
    "final_cta_enabled",
    "final_cta_headline",
    "final_cta_body",
    "final_cta_button_label",
    "final_cta_url",
    "software_application_enabled",
    "software_application_keywords",
    "software_application_category",
    "software_application_operating_system",
    "quality_gate_enabled",
    "min_word_count",
    "max_word_count",
    "min_seo_score",
    "google_indexing_enabled",
    "google_indexing_service_account_json",
    "indexnow_enabled",
    "indexnow_key",
    "inline_images_max",
    "public_base_url",
    "site_url",
    "webflow_token",
    "webflow_site_id",
    "webflow_collection_id",
    "webflow_featured_default",
    "webflow_image_field",
    "webflow_thumbnail_field",
    "webflow_post_summary_field",
    "webflow_reading_time_field",
    "webflow_meta_tag_field",
    "webflow_meta_description_field",
    "webflow_author_field",
    "webflow_author_item_id",
    "webflow_categories_field",
    "webflow_default_category_id",
    "webflow_reading_wpm",
    "webflow_field_mappings",
  ];
  const patch: Partial<Settings> = {};
  for (const k of allowed) {
    if (body[k] === undefined) continue;

    // Don't overwrite a saved secret with the masked dot-string.
    if (
      SECRET_KEYS.includes(k) &&
      typeof body[k] === "string" &&
      String(body[k]).startsWith("•")
    ) {
      continue;
    }

    // Strip an accidentally-pasted "Bearer " prefix from the Webflow token —
    // the publisher adds Bearer itself, and a duplicate causes a 401.
    if (k === "webflow_token" && typeof body[k] === "string") {
      const cleaned = String(body[k]).trim().replace(/^Bearer\s+/i, "");
      (patch as Record<string, unknown>)[k] = cleaned;
      continue;
    }

    // Strip whitespace/trailing slash from base URLs.
    if (
      (k === "public_base_url" || k === "site_url") &&
      typeof body[k] === "string"
    ) {
      (patch as Record<string, unknown>)[k] = String(body[k])
        .trim()
        .replace(/\/$/, "");
      continue;
    }

    // Trim field slugs and reference IDs — Webflow rejects whitespace.
    const slugLike = (
      [
        "webflow_image_field",
        "webflow_thumbnail_field",
        "webflow_post_summary_field",
        "webflow_reading_time_field",
        "webflow_meta_tag_field",
        "webflow_meta_description_field",
        "webflow_author_field",
        "webflow_author_item_id",
        "webflow_categories_field",
        "webflow_default_category_id",
        "webflow_collection_id",
        "webflow_site_id",
      ] as const
    ).includes(k as never);
    if (slugLike && typeof body[k] === "string") {
      (patch as Record<string, unknown>)[k] = String(body[k]).trim();
      continue;
    }

    (patch as Record<string, unknown>)[k] = body[k];
  }
  const next = saveSettings(patch);
  return Response.json({ settings: mask(next) });
}
