import { NextRequest } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { Settings } from "@/lib/types";

type MaskedSettings = Settings & {
  has_groq_key: boolean;
  has_webflow_token: boolean;
};

// Sensitive fields are returned masked so the UI doesn't render secrets back.
function mask(s: Settings): MaskedSettings {
  return {
    ...s,
    groq_api_key: s.groq_api_key ? "•••••••••" + s.groq_api_key.slice(-4) : "",
    webflow_token: s.webflow_token
      ? "•••••••••" + s.webflow_token.slice(-4)
      : "",
    has_groq_key: Boolean(s.groq_api_key),
    has_webflow_token: Boolean(s.webflow_token),
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
    "webflow_token",
    "webflow_collection_id",
    "webflow_featured_default",
  ];
  const patch: Partial<Settings> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      // Don't overwrite a saved secret with the masked dot-string.
      if (
        (k === "groq_api_key" || k === "webflow_token") &&
        typeof body[k] === "string" &&
        String(body[k]).startsWith("•")
      ) {
        continue;
      }
      // Be forgiving if the admin pasted "Bearer <token>" — the publisher
      // adds the Bearer prefix itself, so a duplicate causes a 401.
      if (k === "webflow_token" && typeof body[k] === "string") {
        const cleaned = String(body[k])
          .trim()
          .replace(/^Bearer\s+/i, "");
        (patch as Record<string, unknown>)[k] = cleaned;
        continue;
      }
      (patch as Record<string, unknown>)[k] = body[k];
    }
  }
  const next = saveSettings(patch);
  return Response.json({ settings: mask(next) });
}
