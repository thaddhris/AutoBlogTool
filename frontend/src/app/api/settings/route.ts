import { NextRequest } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { Settings } from "@/lib/types";

type MaskedSettings = Settings & {
  has_groq_key: boolean;
  has_webflow_token: boolean;
  has_gemini_key: boolean;
};

const SECRET_KEYS: (keyof Settings)[] = [
  "groq_api_key",
  "webflow_token",
  "gemini_api_key",
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
    has_groq_key: Boolean(s.groq_api_key),
    has_webflow_token: Boolean(s.webflow_token),
    has_gemini_key: Boolean(s.gemini_api_key),
  };
}

export async function GET() {
  return Response.json({ settings: mask(getSettings()) });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Partial<Settings>;
  const allowed: (keyof Settings)[] = [
    "groq_api_key",
    "groq_model",
    "brand_name",
    "brand_tone",
    "cron_secret",
    "batch_size",
    "draft_hold_hours",
    "publish_mode",
    "publisher",
    "words_target",
    "image_provider",
    "gemini_api_key",
    "gemini_image_model",
    "public_base_url",
    "webflow_token",
    "webflow_collection_id",
    "webflow_featured_default",
    "webflow_image_field",
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

    // Strip whitespace/trailing slash from base URL.
    if (k === "public_base_url" && typeof body[k] === "string") {
      (patch as Record<string, unknown>)[k] = String(body[k])
        .trim()
        .replace(/\/$/, "");
      continue;
    }

    // Trim field slug — Webflow rejects whitespace in field keys.
    if (k === "webflow_image_field" && typeof body[k] === "string") {
      (patch as Record<string, unknown>)[k] = String(body[k]).trim();
      continue;
    }

    (patch as Record<string, unknown>)[k] = body[k];
  }
  const next = saveSettings(patch);
  return Response.json({ settings: mask(next) });
}
