import { NextRequest } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { Settings } from "@/lib/types";

// Sensitive fields are returned masked so the UI doesn't render secrets back.
function mask(s: Settings): Settings & { has_groq_key: boolean } {
  return {
    ...s,
    groq_api_key: s.groq_api_key ? "•••••••••" + s.groq_api_key.slice(-4) : "",
    has_groq_key: Boolean(s.groq_api_key),
  };
}

export async function GET() {
  return Response.json({ settings: mask(getSettings()) });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Partial<Settings>;
  // Only allow known keys
  const allowed: (keyof Settings)[] = [
    "groq_api_key",
    "groq_model",
    "brand_name",
    "brand_tone",
    "cron_secret",
    "batch_size",
    "publish_interval_hours",
    "publish_mode",
    "default_publisher",
    "words_target",
    "image_provider",
  ];
  const patch: Partial<Settings> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      // Don't overwrite a saved key with the masked dot-string.
      if (k === "groq_api_key" && String(body[k]).startsWith("•")) continue;
      (patch as Record<string, unknown>)[k] = body[k];
    }
  }
  const next = saveSettings(patch);
  return Response.json({ settings: mask(next) });
}
