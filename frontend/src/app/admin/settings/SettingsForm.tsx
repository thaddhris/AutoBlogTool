"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { Settings } from "@/lib/types";
import WebflowMappingPanel from "./WebflowMappingPanel";
import {
  BODY_PLACEHOLDERS,
  DEFAULT_BODY_SYSTEM,
  DEFAULT_BODY_USER,
  DEFAULT_OUTLINE_SYSTEM,
  DEFAULT_OUTLINE_USER,
  OUTLINE_PLACEHOLDERS,
  type PlaceholderDoc,
} from "@/lib/prompts";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Settings2,
  Pencil,
  Check,
} from "lucide-react";

type TabId = "essentials" | "advanced";

const TABS: { id: TabId; label: string; icon: typeof Sparkles }[] = [
  { id: "essentials", label: "Essentials", icon: Sparkles },
  { id: "advanced", label: "Advanced", icon: Settings2 },
];

/**
 * Collapsible accordion section used to declutter the Advanced tab.
 * Click the header to open/close. Stays closed by default so the page
 * renders as a short list of titles until the admin opens what they need.
 */
function Collapsible({
  title,
  hint,
  defaultOpen,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 text-left"
      >
        <span className="flex flex-col">
          <span className="text-sm font-medium text-zinc-900">{title}</span>
          {hint && (
            <span className="text-[11px] text-zinc-500">{hint}</span>
          )}
        </span>
        {open ? (
          <ChevronDown size={16} className="text-zinc-500" />
        ) : (
          <ChevronRight size={16} className="text-zinc-500" />
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

export default function SettingsForm({
  initial,
  hasGroqKey,
  hasWebflowToken,
  hasGeminiKey,
  hasPexelsKey,
  hasFalKey,
  hasFluxapiKey,
  hasOpenaiKey,
}: {
  initial: Settings;
  hasGroqKey: boolean;
  hasWebflowToken: boolean;
  hasGeminiKey: boolean;
  hasPexelsKey: boolean;
  hasFalKey: boolean;
  hasFluxapiKey: boolean;
  hasOpenaiKey: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("essentials");

  function update<K extends keyof Settings>(k: K, v: Settings[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<Settings> = { ...form };
      // Don't send masked dot-strings back over the wire — those are display
      // placeholders, not real values.
      for (const k of [
        "groq_api_key",
        "webflow_token",
        "gemini_api_key",
        "pexels_api_key",
        "fal_api_key",
        "fluxapi_api_key",
        "openai_api_key",
        "dataforseo_password",
        "exa_api_key",
      ] as const) {
        const v = payload[k];
        if (typeof v === "string" && v.startsWith("•")) {
          delete payload[k];
        }
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Save failed");
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex gap-6">
      <aside className="w-52 shrink-0">
        <nav className="space-y-0.5 sticky top-6">
          {TABS.map((t) => {
            const active = t.id === activeTab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 space-y-4">
      {activeTab === "essentials" && (
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Writing AI
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          Pick which service writes your blog posts. Groq is the fastest free
          option; Gemini writes better prose but with a smaller free quota.
        </p>

        <div className="mb-4">
          <Label>Provider</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => update("writer_provider", "groq")}
              className={`text-left rounded-md border p-3 transition-colors ${
                form.writer_provider === "groq"
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <div className="text-sm font-medium">Groq</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Llama / DeepSeek / Qwen. Very fast. Free tier with daily
                token cap.
              </div>
            </button>
            <button
              type="button"
              onClick={() => update("writer_provider", "gemini")}
              className={`text-left rounded-md border p-3 transition-colors ${
                form.writer_provider === "gemini"
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <div className="text-sm font-medium">Google Gemini</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                gemini-2.5-flash / pro. Slower than Groq but better prose
                and longer context.
              </div>
            </button>
          </div>
        </div>

        {form.writer_provider === "groq" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label required>Groq API key</Label>
              <Input
                value={form.groq_api_key}
                onChange={(e) => update("groq_api_key", e.target.value)}
                placeholder={
                  hasGroqKey ? "(saved — type a new one to replace)" : "gsk_…"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get a free key at <code>console.groq.com</code>.{" "}
                {hasGroqKey
                  ? "A key is saved — leave it as-is to keep using it."
                  : "Required before any blog can be written."}
              </p>
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.groq_model}
                onChange={(e) => update("groq_model", e.target.value)}
                placeholder="llama-3.3-70b-versatile"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Default <code>llama-3.3-70b-versatile</code> works well. Try{" "}
                <code>llama-3.1-8b-instant</code> for speed, or{" "}
                <code>deepseek-r1-distill-llama-70b</code> for structured
                output.
              </p>
            </div>
          </div>
        )}

        {form.writer_provider === "gemini" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label required>Google AI Studio API key</Label>
              <Input
                value={form.gemini_api_key}
                onChange={(e) => update("gemini_api_key", e.target.value)}
                placeholder={
                  hasGeminiKey
                    ? "(saved — type a new one to replace)"
                    : "AIza…"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get a free key at <code>aistudio.google.com</code>. This same
                key is also used for image generation if you pick Gemini
                there.
              </p>
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.gemini_text_model}
                onChange={(e) =>
                  update("gemini_text_model", e.target.value)
                }
                placeholder="gemini-2.5-flash"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Default <code>gemini-2.5-flash</code> is fast and free. Use{" "}
                <code>gemini-2.5-pro</code> for the best quality (lower free
                quota).
              </p>
            </div>
          </div>
        )}
      </Card>
      )}

      {activeTab === "advanced" && (
      <Collapsible
        title="Posting schedule"
        hint="When new posts get written and when drafts go live"
      >
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Writing & publishing schedule
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          Control how many posts get written at a time and when they go live.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Posts per run</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={form.batch_size}
              onChange={(e) => update("batch_size", Number(e.target.value))}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              How many blog requests get turned into drafts each time the
              scheduler runs.
            </p>
          </div>
          <div>
            <Label>Review window (hours)</Label>
            <Input
              type="number"
              min={0}
              max={720}
              value={form.draft_hold_hours}
              onChange={(e) =>
                update("draft_hold_hours", Number(e.target.value))
              }
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              How long a draft sits as &ldquo;draft&rdquo; before going live
              automatically. You can still edit, extend, or publish-now during
              this time. Only used in &ldquo;auto-publish&rdquo; mode.
            </p>
          </div>
          <div>
            <Label>What happens after writing?</Label>
            <Select
              value={form.publish_mode}
              onChange={(e) =>
                update(
                  "publish_mode",
                  e.target.value as Settings["publish_mode"],
                )
              }
            >
              <option value="auto">
                Auto-publish after the review window
              </option>
              <option value="manual">
                Wait — I&apos;ll publish manually
              </option>
            </Select>
          </div>
        </div>
        <div className="mt-4 rounded-md bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600 space-y-1">
          <div className="font-medium text-zinc-700">
            For your scheduler (n8n / Zapier / cron)
          </div>
          <p className="text-zinc-500 mb-1">
            Point your scheduler at these two URLs. We do the rest.
          </p>
          <div>
            <strong>Write new drafts:</strong>{" "}
            <code>POST /api/cron/process</code> — every 5–15 min
          </div>
          <div>
            <strong>Publish drafts that are ready:</strong>{" "}
            <code>POST /api/cron/publish</code> — every 1–5 min
          </div>
          <div className="pt-1">
            If you set a secret below, your scheduler must send it as the
            header <code>x-cron-secret</code> or query{" "}
            <code>?secret=…</code> when calling those URLs.
          </div>
        </div>
        <div className="mt-3">
          <Label>Scheduler password (optional)</Label>
          <Input
            value={form.cron_secret}
            onChange={(e) => update("cron_secret", e.target.value)}
            placeholder="Any random string — keeps the scheduler URLs private"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Recommended for live sites. Without it, anyone who knows the URL
            could trigger writing or publishing.
          </p>
        </div>
      </Card>
      </Collapsible>
      )}

      {activeTab === "essentials" && (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Hero image (top of each post)
          </div>
          <Select
            value={form.image_provider}
            onChange={(e) =>
              update(
                "image_provider",
                e.target.value as Settings["image_provider"],
              )
            }
            className="max-w-[260px]"
          >
            <option value="placeholder">Placeholder (colored gradient)</option>
            <option value="openai">OpenAI · gpt-image-1 / DALL·E (AI-generated)</option>
            <option value="openai-agentic">
              OpenAI · agentic chain (gpt-4.1 + gpt-image-1, smartest)
            </option>
            <option value="fluxapi">FluxAPI · FLUX Kontext (AI-generated)</option>
            <option value="fal">Fal AI · FLUX (AI-generated, fast + cheap)</option>
            <option value="gemini">Google Gemini (AI-generated, paid)</option>
            <option value="pexels">Pexels (real stock photos, free)</option>
          </Select>
        </div>
        {form.image_provider === "placeholder" && (
          <p className="text-[11px] text-zinc-500">
            A simple colored background image with the title on it. Good for
            testing — but it can&apos;t be sent to Webflow, so pick one of
            the real options before publishing.
          </p>
        )}
        {form.image_provider === "gemini" && (
          <div className="space-y-3">
            <div>
              <Label required>Google AI Studio API key</Label>
              <Input
                value={form.gemini_api_key}
                onChange={(e) => update("gemini_api_key", e.target.value)}
                placeholder={
                  hasGeminiKey ? "(saved — type a new one to replace)" : "AIza…"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get one at <code>aistudio.google.com</code>. You&apos;ll need
                to add billing — Google doesn&apos;t allow free image
                generation.
              </p>
            </div>
            <div>
              <Label>Which Gemini model</Label>
              <Input
                value={form.gemini_image_model}
                onChange={(e) =>
                  update("gemini_image_model", e.target.value)
                }
                placeholder="gemini-3.1-flash-image"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Default works well. Change only if Google releases a newer
                image model.
              </p>
            </div>
          </div>
        )}
        {(form.image_provider === "openai" ||
          form.image_provider === "openai-agentic") && (
          <div className="space-y-3">
            {form.image_provider === "openai-agentic" && (
              <p className="text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-2 py-1.5">
                Agentic mode runs 3 extra OpenAI text calls (gpt-4.1-mini,
                gpt-4.1) per banner to optimize the title, derive a visual
                style, and rewrite the image prompt before generation. Costs
                a few extra cents per blog but produces more on-topic
                photography. Each agent&apos;s output is logged under{" "}
                <code>image.agent.*</code> in the Activity Log.
              </p>
            )}
            <div>
              <Label required>OpenAI API key</Label>
              <Input
                value={form.openai_api_key}
                onChange={(e) => update("openai_api_key", e.target.value)}
                placeholder={
                  hasOpenaiKey
                    ? "(saved — type a new one to replace)"
                    : "sk-…"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get one at <code>platform.openai.com/api-keys</code>.{" "}
                <code>gpt-image-1</code> requires a verified organization —
                check Settings → Organization → Verification on the OpenAI
                dashboard if you hit a 403.
              </p>
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.openai_image_model}
                onChange={(e) =>
                  update("openai_image_model", e.target.value)
                }
                placeholder="gpt-image-1"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                <code>gpt-image-1</code> (default) is the newer, sharper
                model. Use <code>dall-e-3</code> as a cheaper fallback.
              </p>
            </div>
          </div>
        )}
        {form.image_provider === "fluxapi" && (
          <div className="space-y-3">
            <div>
              <Label required>FluxAPI key</Label>
              <Input
                value={form.fluxapi_api_key}
                onChange={(e) =>
                  update("fluxapi_api_key", e.target.value)
                }
                placeholder={
                  hasFluxapiKey
                    ? "(saved — type a new one to replace)"
                    : "Your fluxapi.ai key"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get one at <code>fluxapi.ai</code>. Generation is async — we
                poll for up to ~3 minutes per banner.
              </p>
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.fluxapi_image_model}
                onChange={(e) =>
                  update("fluxapi_image_model", e.target.value)
                }
                placeholder="flux-kontext-pro"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                <code>flux-kontext-pro</code> (default) or{" "}
                <code>flux-kontext-max</code> for higher quality.
              </p>
            </div>
          </div>
        )}
        {form.image_provider === "fal" && (
          <div className="space-y-3">
            <div>
              <Label required>Fal AI API key</Label>
              <Input
                value={form.fal_api_key}
                onChange={(e) => update("fal_api_key", e.target.value)}
                placeholder={
                  hasFalKey
                    ? "(saved — type a new one to replace)"
                    : "fal-…"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get one at <code>fal.ai/dashboard/keys</code>. FLUX schnell
                is ~$0.003 per image; the free tier gives a few hundred
                images.
              </p>
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.fal_image_model}
                onChange={(e) => update("fal_image_model", e.target.value)}
                placeholder="fal-ai/flux/schnell"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                <code>fal-ai/flux/schnell</code> is fast (~2–4s) and very
                cheap. Try <code>fal-ai/flux/dev</code> for sharper output,
                or <code>fal-ai/flux-pro/v1.1</code> for the best quality
                (slower, paid).
              </p>
            </div>
          </div>
        )}
        {form.image_provider === "pexels" && (
          <div className="space-y-3">
            <div>
              <Label required>Pexels API key</Label>
              <Input
                value={form.pexels_api_key}
                onChange={(e) =>
                  update("pexels_api_key", e.target.value)
                }
                placeholder={
                  hasPexelsKey ? "(set — re-enter to change)" : "Your Pexels API key"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Free at <code>pexels.com/api</code>. Real photos by real
                photographers. Photographer credit is added to image
                descriptions automatically.
              </p>
            </div>
          </div>
        )}
        {form.image_provider !== "placeholder" &&
          form.image_provider !== "pexels" && (
            <div className="mt-4">
              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={form.banner_title_overlay !== false}
                  onChange={(e) =>
                    update("banner_title_overlay", e.target.checked)
                  }
                  className="mt-0.5 rounded border-zinc-300"
                />
                <span>
                  Paint the post title onto the banner
                  <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                    Adds a glassmorphism panel with the brand name and post
                    title overlaid on the right side of the image. Turn off
                    for plain photographic backgrounds.
                  </span>
                </span>
              </label>
            </div>
          )}
        {form.image_provider !== "placeholder" && (
          <div className="mt-4">
            <Label>Your site URL</Label>
            <Input
              value={form.public_base_url}
              onChange={(e) => update("public_base_url", e.target.value)}
              placeholder="https://autoblogtool.iocompute.ai"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              The full address where this admin app is hosted. Needed so
              Webflow can fetch the generated images. Leave blank if
              you&apos;re not publishing to Webflow.
            </p>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-zinc-100">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
            Photos inside the post body
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">
            In addition to the hero at the top, the AI can add real stock
            photos inside the post (from Pexels). The hero you chose above is
            unaffected. Set to 0 to keep posts hero-only.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>How many inline photos?</Label>
              <Input
                type="number"
                min={0}
                max={6}
                value={form.inline_images_max}
                onChange={(e) =>
                  update("inline_images_max", Number(e.target.value) || 0)
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                2–3 is a good default. Needs a Pexels API key (pick Pexels
                above and paste a key, then you can switch hero back to
                whatever you prefer).
              </p>
            </div>
            <div className="text-[11px] text-zinc-500 pt-1.5 leading-relaxed">
              {form.inline_images_max > 0 ? (
                form.pexels_api_key || hasPexelsKey ? (
                  <span className="text-green-700">
                    ✓ All set. Hero: <strong>{form.image_provider}</strong>.
                    Up to <strong>{form.inline_images_max}</strong> Pexels
                    photos inside each post body.
                  </span>
                ) : (
                  <span className="text-amber-700">
                    ⚠ Inline photos turned on but no Pexels key. Pick Pexels
                    above, paste a key, then switch back.
                  </span>
                )
              ) : (
                <span>Inline photos off. Hero image only.</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      )}

      {activeTab === "advanced" && (
      <Collapsible
        title="Connect to Webflow"
        hint="Your Webflow API key, which collection posts go to, and where each field is filled in"
      >
      <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Where do published posts go?
          </div>
          <Select
            value={form.publisher}
            onChange={(e) =>
              update("publisher", e.target.value as Settings["publisher"])
            }
            className="max-w-[220px]"
          >
            <option value="markdown">Save as a file (testing)</option>
            <option value="webflow">Publish to Webflow</option>
          </Select>
        </div>
        {form.publisher === "markdown" && (
          <p className="text-[11px] text-zinc-500">
            Each published post is saved as a Markdown file on the server.
            Good for testing the writing without touching your live site.
            Switch to Webflow when you&apos;re ready to publish for real.
          </p>
        )}
        {form.publisher === "webflow" && (
          <div className="space-y-3">
            <div>
              <Label required>Webflow API token</Label>
              <Input
                value={form.webflow_token}
                onChange={(e) => update("webflow_token", e.target.value)}
                placeholder={
                  hasWebflowToken
                    ? "(saved — type a new one to replace)"
                    : "Your Webflow API token"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get one from Webflow → Workspace Settings → Apps & Integrations
                → API access. Paste only the token itself — don&apos;t include
                the word <code>Bearer</code>.
              </p>
            </div>
            <div>
              <Label required>Blog Posts collection ID</Label>
              <Input
                value={form.webflow_collection_id}
                onChange={(e) =>
                  update("webflow_collection_id", e.target.value)
                }
                placeholder="e.g. 68a6d2bc7a6ac4518f825282"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Open your Blog Posts collection in Webflow Designer →
                Settings → copy the Collection ID.
              </p>
            </div>
            <div>
              <Label>Site ID (optional)</Label>
              <Input
                value={form.webflow_site_id}
                onChange={(e) =>
                  update("webflow_site_id", e.target.value)
                }
                placeholder="e.g. 67e1090be256b086e66401df"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Not needed right now. Reserved for future features like
                uploading images directly to your Webflow assets library.
              </p>
            </div>
            <div>
              <Label>Main image field (optional)</Label>
              <Input
                value={form.webflow_image_field}
                onChange={(e) =>
                  update("webflow_image_field", e.target.value)
                }
                placeholder="main-image"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                The field name in your Webflow collection that holds the
                hero image. Leave blank to skip uploading images. Needs the
                site URL set above so Webflow can fetch them.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={form.webflow_featured_default}
                onChange={(e) =>
                  update("webflow_featured_default", e.target.checked)
                }
                className="rounded border-zinc-300"
              />
              Mark every new post as <strong>Featured</strong>
            </label>
            <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3 text-[11px] text-zinc-600 space-y-1">
              <div className="font-medium text-zinc-700">
                What your Webflow collection needs
              </div>
              <div>
                These field names: <code>name</code>, <code>slug</code>,{" "}
                <code>post-body</code> (rich text), <code>post-summary</code>,
                and <code>featured</code> (switch).
              </div>
              <div>
                When a post is ready, we send it to Webflow and publish it
                live in one step. No drafts left in Webflow.
              </div>
            </div>
          </div>
        )}
      </Card>

      <WebflowMappingPanel
        collectionId={form.webflow_collection_id}
        hasToken={hasWebflowToken || Boolean(form.webflow_token)}
        mappings={form.webflow_field_mappings ?? {}}
        onMappingChange={(next) => update("webflow_field_mappings", next)}
      />

      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Match Webflow fields (legacy — used only when no detected fields are saved)
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          Hand-typed slug-name fallbacks for the original Faclon &ldquo;Blog
          Posts&rdquo; collection. As soon as you click <strong>Fetch fields</strong>{" "}
          above, this section is ignored — the publisher uses the detected
          mapping instead.
        </p>

        <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
          Post content
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <FieldSlug
            label="Main image field"
            value={form.webflow_image_field}
            onChange={(v) => update("webflow_image_field", v)}
            placeholder="main-image"
          />
          <FieldSlug
            label="Thumbnail image field"
            value={form.webflow_thumbnail_field}
            onChange={(v) => update("webflow_thumbnail_field", v)}
            placeholder="thumbnail-image"
            hint="We use the same image as the main image."
          />
          <FieldSlug
            label="Post summary field"
            value={form.webflow_post_summary_field}
            onChange={(v) => update("webflow_post_summary_field", v)}
            placeholder="post-summary"
          />
          <FieldSlug
            label="Reading time field"
            value={form.webflow_reading_time_field}
            onChange={(v) => update("webflow_reading_time_field", v)}
            placeholder="reading-time"
            hint="Calculated for you from the word count, e.g. &ldquo;6 Mins&rdquo;."
          />
        </div>

        <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
          SEO (helps Google understand the post)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <FieldSlug
            label="SEO title field"
            value={form.webflow_meta_tag_field}
            onChange={(v) => update("webflow_meta_tag_field", v)}
            placeholder="meta-tag"
          />
          <FieldSlug
            label="SEO description field"
            value={form.webflow_meta_description_field}
            onChange={(v) => update("webflow_meta_description_field", v)}
            placeholder="meta-description"
          />
        </div>

        <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
          Author & category
        </div>
        <p className="text-[11px] text-zinc-500 mb-2">
          Webflow needs the unique ID of an Author item and Category item
          (not their names). Look up the IDs once in Webflow Designer →
          open the item → URL bar contains the ID.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldSlug
            label="Author field name"
            value={form.webflow_author_field}
            onChange={(v) => update("webflow_author_field", v)}
            placeholder="author"
          />
          <FieldSlug
            label="Default author ID"
            value={form.webflow_author_item_id}
            onChange={(v) => update("webflow_author_item_id", v)}
            placeholder="6a08…"
            hint="The ID of the author item every post should be linked to."
          />
          <FieldSlug
            label="Categories field name"
            value={form.webflow_categories_field}
            onChange={(v) => update("webflow_categories_field", v)}
            placeholder="categories"
          />
          <FieldSlug
            label="Default category ID"
            value={form.webflow_default_category_id}
            onChange={(v) => update("webflow_default_category_id", v)}
            placeholder="e.g. ID of the Industrial AI category"
            hint="Applied to every post until per-post categories are added."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div>
            <Label>Reading speed (words/minute)</Label>
            <Input
              type="number"
              min={120}
              max={400}
              value={form.webflow_reading_wpm}
              onChange={(e) =>
                update("webflow_reading_wpm", Number(e.target.value))
              }
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              How fast a typical reader gets through the post. 220 is the
              standard for B2B / technical writing.
            </p>
          </div>
          <div>
            <Label>Your blog&apos;s public URL</Label>
            <Input
              value={form.site_url}
              onChange={(e) => update("site_url", e.target.value)}
              placeholder="https://faclonlabs.com"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Where readers see the blog (the front of your site). Used so
              the AI can link new posts to your existing ones.
            </p>
          </div>
        </div>
      </Card>
      </>
      </Collapsible>
      )}

      {activeTab === "advanced" && (
      <Collapsible
        title="SEO add-ons"
        hint="Keyword research, auto topic ideas, verified sources, search-engine signals, on-page boosters"
      >
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Keyword research key (DataForSEO)
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          Lets the tool pull real keyword data and check what&apos;s
          already ranking on Google before each post is written. Sign up
          at <code>dataforseo.com</code> — the login looks like an email
          and the password is a long random string. Both are stored
          locally and only sent to DataForSEO.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label required>API login</Label>
            <Input
              value={form.dataforseo_login}
              onChange={(e) =>
                update("dataforseo_login", e.target.value)
              }
              placeholder="you@yourcompany.com"
            />
          </div>
          <div>
            <Label required>API password</Label>
            <Input
              value={form.dataforseo_password}
              onChange={(e) =>
                update("dataforseo_password", e.target.value)
              }
              placeholder={
                form.dataforseo_password?.startsWith("•")
                  ? "(saved — type a new one to replace)"
                  : "DataForSEO password"
              }
            />
          </div>
        </div>
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
            Default search filters
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">
            Defaults applied to every keyword-research query. Each search
            can override these per run.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>Country (location_code)</Label>
              <Input
                type="number"
                value={form.dataforseo_location_code}
                onChange={(e) =>
                  update(
                    "dataforseo_location_code",
                    Number(e.target.value) || 2840,
                  )
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                2840 = US · 2356 = India · 2826 = UK
              </p>
            </div>
            <div>
              <Label>Language</Label>
              <Input
                value={form.dataforseo_language_code}
                onChange={(e) =>
                  update("dataforseo_language_code", e.target.value)
                }
                placeholder="en"
              />
            </div>
            <div>
              <Label>Min search volume</Label>
              <Input
                type="number"
                min={0}
                value={form.dataforseo_min_search_volume}
                onChange={(e) =>
                  update(
                    "dataforseo_min_search_volume",
                    Number(e.target.value) || 0,
                  )
                }
              />
            </div>
            <div>
              <Label>Max keyword difficulty</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.dataforseo_max_keyword_difficulty}
                onChange={(e) =>
                  update(
                    "dataforseo_max_keyword_difficulty",
                    Math.max(
                      0,
                      Math.min(100, Number(e.target.value) || 0),
                    ),
                  )
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                0–100. Higher = harder to rank.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-zinc-100">
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.serp_analysis_enabled !== false}
              onChange={(e) =>
                update("serp_analysis_enabled", e.target.checked)
              }
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>
              Check what&apos;s already ranking on Google before writing
              <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                Before writing, the tool looks at the top 10 Google
                results for your main keyword — plus the &ldquo;People
                also ask&rdquo; questions and any featured-snippet box —
                so it can plan a post that beats them. Costs about
                $0.002 per post. The result is saved, so regenerating
                the same post is free. Turn off to skip this and write
                without seeing the competition.
              </span>
            </span>
          </label>
        </div>
        <div className="mt-5 pt-4 border-t border-zinc-100">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
            Autonomous topic discovery
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">
            On a daily-ish cadence, the platform pulls keyword ideas for
            your seed topics, semantically clusters them, and auto-creates
            Blog Requests for the highest-opportunity ones. Runs are
            triggered by the discovery cron or the &ldquo;Discover topics
            now&rdquo; button on the Overview.
          </p>
          <label className="flex items-start gap-2 text-sm text-zinc-700 mb-3">
            <input
              type="checkbox"
              checked={form.topic_discovery_enabled === true}
              onChange={(e) =>
                update("topic_discovery_enabled", e.target.checked)
              }
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>
              Enable autonomous topic discovery
              <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                When off, cron and button-triggered runs exit early with a
                &ldquo;disabled&rdquo; log entry — useful for pausing
                discovery without rewriting your n8n config.
              </span>
            </span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Seed keywords</Label>
              <Textarea
                rows={3}
                value={(form.topic_discovery_seeds || []).join("\n")}
                onChange={(e) =>
                  update(
                    "topic_discovery_seeds",
                    e.target.value
                      .split(/[,\n]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder={
                  "predictive maintenance\nOEE\nindustrial AI\nIIoT"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                One per line. The discovery engine expands every seed into
                related keywords via DataForSEO.
              </p>
            </div>
            <div>
              <Label>Excluded keywords</Label>
              <Textarea
                rows={3}
                value={(form.topic_discovery_excluded_keywords || []).join(
                  "\n",
                )}
                onChange={(e) =>
                  update(
                    "topic_discovery_excluded_keywords",
                    e.target.value
                      .split(/[,\n]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder={
                  "competitor brand\nbroken phrase\noff-topic term"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Substring denylist (case-insensitive). Candidates
                containing any of these strings are dropped.
              </p>
            </div>
            <div>
              <Label>Search-intent filter</Label>
              <Select
                value={form.topic_discovery_intent_filter || "any"}
                onChange={(e) =>
                  update(
                    "topic_discovery_intent_filter",
                    e.target.value as Settings["topic_discovery_intent_filter"],
                  )
                }
              >
                <option value="any">Any intent</option>
                <option value="informational">Informational</option>
                <option value="commercial">Commercial</option>
                <option value="transactional">Transactional</option>
                <option value="navigational">Navigational</option>
              </Select>
              <p className="text-[11px] text-zinc-500 mt-1">
                Most blog topics live in &ldquo;Informational&rdquo;.
              </p>
            </div>
            <div>
              <Label>Max new requests per run</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.topic_discovery_max_new_requests ?? 5}
                onChange={(e) =>
                  update(
                    "topic_discovery_max_new_requests",
                    Math.max(
                      1,
                      Math.min(50, Number(e.target.value) || 5),
                    ),
                  )
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Cap to keep one run from flooding the queue. Picks the
                highest-opportunity clusters first.
              </p>
            </div>
            <div>
              <Label>Minimum brand relevance (0–100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.topic_discovery_min_relevance ?? 75}
                onChange={(e) =>
                  update(
                    "topic_discovery_min_relevance",
                    Math.max(
                      0,
                      Math.min(100, Number(e.target.value) || 0),
                    ),
                  )
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                LLM-judged relevance threshold. 75 = &ldquo;strong
                on-brand&rdquo; (default); 90 = only squarely on-domain
                topics; 60 = loosens to adjacent but uncertain content.
                Drops anything scoring below.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Target industries / verticals</Label>
              <Textarea
                rows={4}
                value={(form.topic_discovery_target_industries || []).join(
                  "\n",
                )}
                onChange={(e) =>
                  update(
                    "topic_discovery_target_industries",
                    e.target.value
                      .split(/\n/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder={
                  "cement plants\nsteel and metals manufacturing\npower generation and utilities\noil and gas\nwater and wastewater treatment\nfood and beverage manufacturing\npharmaceutical manufacturing\ndiscrete manufacturing / factory automation\nprocess industries / refineries"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                One per line. The LLM relevance gate uses this as the
                concrete &ldquo;is this topic about an industry we
                serve?&rdquo; criterion. Topics about industries NOT on
                this list and with no tie to your platform capabilities
                get scored low.
              </p>
            </div>
            <div>
              <Label>Anti-examples (banned topic themes)</Label>
              <Textarea
                rows={4}
                value={(form.topic_discovery_non_target_examples || []).join(
                  "\n",
                )}
                onChange={(e) =>
                  update(
                    "topic_discovery_non_target_examples",
                    e.target.value
                      .split(/\n/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder={
                  "consumer appliances or home gadgets\npersonal/general-purpose AI tools (chatbots, image generators)\ntrades or craft jobs (carpenter, plumber, blacksmith, sewing)\noffice / SaaS productivity tools unrelated to plant operations\nacademic concepts taught in schools\ncompany-name lookups\nconsumer services and retail"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                One per line. Concrete examples of topics the brand does
                NOT want. The LLM is told to score anything matching one
                of these at 0–29, regardless of search volume. Add new
                anti-examples whenever discovery slips an off-topic
                request through.
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-md bg-zinc-50 border border-zinc-200 p-2.5 text-[11px] text-zinc-600">
            <div className="font-medium text-zinc-700 mb-1">
              For your scheduler (n8n / cron)
            </div>
            <div>
              Discovery cron URL:{" "}
              <code>POST /api/cron/topic-discovery?secret=…</code> — daily is
              fine. Each run costs a single DataForSEO call (~$0.01–0.05)
              plus one cheap LLM clustering call.
            </div>
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 mt-4">
          Once saved, open{" "}
          <Link href="/admin/seo/keywords" className="underline">
            Keyword opportunities
          </Link>{" "}
          to research topics ad-hoc, or use the <strong>Discover topics
          now</strong> button on Overview to trigger a discovery run
          manually.
        </p>

        {/* ── Exa AI external-source verification ─────────────────────── */}
        <div className="mt-6 pt-4 border-t border-zinc-100">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
            Exa AI — external source verification
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">
            After the outline pass, the platform calls Exa AI to find
            real, authoritative URLs for the primary keyword and feeds
            them — with query-relevant highlights — into the body prompt.
            The writer cites these inline instead of inventing URLs. Costs
            ~$0.005 per generation.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Exa API key</Label>
              <Input
                value={form.exa_api_key}
                onChange={(e) => update("exa_api_key", e.target.value)}
                placeholder={
                  form.exa_api_key?.startsWith("•")
                    ? "(saved — type a new one to replace)"
                    : "Your Exa AI key"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get one at <code>dashboard.exa.ai</code>.
              </p>
            </div>
            <div>
              <Label>Sources per post</Label>
              <Input
                type="number"
                min={3}
                max={20}
                value={form.exa_num_sources ?? 8}
                onChange={(e) =>
                  update(
                    "exa_num_sources",
                    Math.max(3, Math.min(20, Number(e.target.value) || 8)),
                  )
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                7–8 sources is the sweet spot for long blog posts.
              </p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-zinc-700 mt-3">
            <input
              type="checkbox"
              checked={form.exa_sources_enabled !== false}
              onChange={(e) =>
                update("exa_sources_enabled", e.target.checked)
              }
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>
              Replace LLM-generated sources with Exa-verified URLs
              <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                When on, the outline&apos;s hallucinated{" "}
                <code>sources[]</code> gets swapped for real Exa results
                before the body pass runs. When off, the platform ships
                whatever URLs the writer model invented (often
                fake/dead).
              </span>
            </span>
          </label>
        </div>

        {/* ─── Block low-quality posts ──────────────────────────────── */}
        <div className="mt-6 pt-6 border-t border-zinc-200">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Don&apos;t publish low-quality posts
          </div>
          <p className="text-[12px] text-zinc-600 mb-3">
            When on, the tool refuses to publish a post that doesn&apos;t
            meet your standards (too short, too long, or low SEO score).
            For manual publishing, you&apos;ll see a confirm dialog with
            the reason and can choose to publish anyway. Auto-publishing
            always respects the gate. Set any limit to <code>0</code> to
            turn that single check off.
          </p>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={!!form.quality_gate_enabled}
              onChange={(e) =>
                update("quality_gate_enabled", e.target.checked)
              }
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>Check quality before publishing</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div>
              <Label>Minimum word count</Label>
              <Input
                type="number"
                min={0}
                value={form.min_word_count ?? 800}
                onChange={(e) =>
                  update("min_word_count", Number(e.target.value))
                }
              />
            </div>
            <div>
              <Label>Maximum word count</Label>
              <Input
                type="number"
                min={0}
                value={form.max_word_count ?? 3000}
                onChange={(e) =>
                  update("max_word_count", Number(e.target.value))
                }
              />
            </div>
            <div>
              <Label>Minimum SEO score (0 to 100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.min_seo_score ?? 0}
                onChange={(e) =>
                  update("min_seo_score", Number(e.target.value))
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Only checked when an SEO audit has already been run on
                the post. Set to 0 to turn this off.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Tell search engines about new posts ──────────────────── */}
        <div className="mt-6 pt-6 border-t border-zinc-200">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Tell search engines about new posts
          </div>
          <p className="text-[12px] text-zinc-600 mb-3">
            Right after a post goes live, the tool can notify search
            engines so they crawl it within minutes instead of days. If a
            ping fails it&apos;s just logged — your post is still safely
            published.
          </p>

          <div className="p-3 rounded-md border border-zinc-200 bg-zinc-50">
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!form.google_indexing_enabled}
                onChange={(e) =>
                  update("google_indexing_enabled", e.target.checked)
                }
                className="mt-0.5 rounded border-zinc-300"
              />
              <span>
                Notify Google immediately when a post is published
                <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                  You&apos;ll need a Google Cloud &ldquo;service
                  account&rdquo; key — it&apos;s a JSON file you download
                  once, and the email inside it must be added as a
                  verified owner in your Google Search Console. Paste
                  the whole JSON file below.
                </span>
              </span>
            </label>
            <div className="mt-3">
              <Label>Google service account key (paste the JSON file)</Label>
              <Textarea
                rows={4}
                value={form.google_indexing_service_account_json || ""}
                onChange={(e) =>
                  update(
                    "google_indexing_service_account_json",
                    e.target.value,
                  )
                }
                placeholder={
                  '{ "type": "service_account", "client_email": "…", "private_key": "-----BEGIN PRIVATE KEY-----\\n…" }'
                }
                className="font-mono text-[11px]"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                The key is hidden after you save. Paste a new one to
                replace it.
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-md border border-zinc-200 bg-zinc-50">
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!form.indexnow_enabled}
                onChange={(e) =>
                  update("indexnow_enabled", e.target.checked)
                }
                className="mt-0.5 rounded border-zinc-300"
              />
              <span>
                Notify Bing, Yandex, Naver, and others (via IndexNow)
                <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                  One-time setup: click <em>Generate</em> below to make
                  a key, then upload a small file named{" "}
                  <code>&lt;your-key&gt;.txt</code> to your website&apos;s
                  root, containing just the key string inside. This
                  proves to search engines that you own the site.
                </span>
              </span>
            </label>
            <div className="mt-3 flex gap-2">
              <Input
                value={form.indexnow_key || ""}
                onChange={(e) => update("indexnow_key", e.target.value)}
                placeholder="32-char hex key"
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/seo/indexnow-key", {
                      method: "POST",
                    });
                    const json = await res.json();
                    if (json.key) update("indexnow_key", String(json.key));
                  } catch {
                    /* ignore — user can paste their own */
                  }
                }}
              >
                Generate
              </Button>
            </div>
            {form.indexnow_key && (
              <p className="text-[11px] text-zinc-500 mt-2">
                Now upload a file named{" "}
                <code>{form.indexnow_key}.txt</code> to your
                website&apos;s root — i.e.{" "}
                <code>
                  {form.site_url || "https://yoursite.com"}/
                  {form.indexnow_key}.txt
                </code>
                . The file should contain only the key string. Search
                engines re-download it to verify you own the site.
              </p>
            )}
          </div>
        </div>

        {/* ─── Table of contents + call-to-action blocks ────────────── */}
        <div className="mt-6 pt-6 border-t border-zinc-200">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Table of contents &amp; call-to-action blocks
          </div>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.toc_enabled !== false}
              onChange={(e) => update("toc_enabled", e.target.checked)}
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>
              Add an automatic table of contents at the top of every post
              <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                Each section heading gets a link so readers can jump
                straight to it. Skipped on short posts with fewer than 3
                sections.
              </span>
            </span>
          </label>

          <div className="mt-5 p-3 rounded-md border border-zinc-200 bg-zinc-50">
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!form.mid_cta_enabled}
                onChange={(e) =>
                  update("mid_cta_enabled", e.target.checked)
                }
                className="mt-0.5 rounded border-zinc-300"
              />
              <span>
                Show a call-to-action box halfway through the post
                <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                  Placed between two sections (not inside one) so it
                  doesn&apos;t break up the reader&apos;s flow.
                </span>
              </span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <Label>Headline</Label>
                <Input
                  value={form.mid_cta_headline || ""}
                  onChange={(e) =>
                    update("mid_cta_headline", e.target.value)
                  }
                />
              </div>
              <div>
                <Label>Button text</Label>
                <Input
                  value={form.mid_cta_button_label || ""}
                  onChange={(e) =>
                    update("mid_cta_button_label", e.target.value)
                  }
                  placeholder="Book a free demo"
                />
              </div>
            </div>
            <div className="mt-3">
              <Label>Body text</Label>
              <Textarea
                rows={2}
                value={form.mid_cta_body || ""}
                onChange={(e) => update("mid_cta_body", e.target.value)}
              />
            </div>
            <div className="mt-3">
              <Label>Where the button goes (e.g. Calendly link)</Label>
              <Input
                value={form.mid_cta_url || ""}
                onChange={(e) => update("mid_cta_url", e.target.value)}
                placeholder="https://calendly.com/faclonlabs/demo"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Leave empty to skip the box even when the toggle is on.
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-md border border-zinc-200 bg-zinc-50">
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!form.final_cta_enabled}
                onChange={(e) =>
                  update("final_cta_enabled", e.target.checked)
                }
                className="mt-0.5 rounded border-zinc-300"
              />
              <span>
                Show a call-to-action banner at the very end
                <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                  Shown after the body but before the related-posts and
                  FAQ blocks — catches readers who scrolled to the bottom.
                </span>
              </span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <Label>Headline</Label>
                <Input
                  value={form.final_cta_headline || ""}
                  onChange={(e) =>
                    update("final_cta_headline", e.target.value)
                  }
                />
              </div>
              <div>
                <Label>Button text</Label>
                <Input
                  value={form.final_cta_button_label || ""}
                  onChange={(e) =>
                    update("final_cta_button_label", e.target.value)
                  }
                  placeholder="Talk to our team"
                />
              </div>
            </div>
            <div className="mt-3">
              <Label>Body text</Label>
              <Textarea
                rows={2}
                value={form.final_cta_body || ""}
                onChange={(e) => update("final_cta_body", e.target.value)}
              />
            </div>
            <div className="mt-3">
              <Label>Where the button goes</Label>
              <Input
                value={form.final_cta_url || ""}
                onChange={(e) => update("final_cta_url", e.target.value)}
                placeholder="https://faclonlabs.com/contact"
              />
            </div>
          </div>
        </div>

        {/* ─── Author info (shown at end of every post) ─────────────── */}
        <div className="mt-6 pt-6 border-t border-zinc-200">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Author info (shown at end of every post)
          </div>
          <p className="text-[12px] text-zinc-600 mb-3">
            A short bio block appears at the bottom of every post and
            tells Google who wrote it. Search engines prefer content with
            a named, credible author — it&apos;s one of the strongest
            ranking signals for &ldquo;who can I trust here.&rdquo; Leave
            <em> name </em> or <em> bio </em> blank to skip the block.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Author name</Label>
              <Input
                value={form.author_bio_name || ""}
                onChange={(e) => update("author_bio_name", e.target.value)}
                placeholder="e.g. Aditya Pingle"
              />
            </div>
            <div>
              <Label>Author title / role</Label>
              <Input
                value={form.author_bio_title || ""}
                onChange={(e) => update("author_bio_title", e.target.value)}
                placeholder="e.g. Director of Industrial AI, Faclon Labs"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <Label>Photo URL (optional)</Label>
              <Input
                value={form.author_bio_image_url || ""}
                onChange={(e) =>
                  update("author_bio_image_url", e.target.value)
                }
                placeholder="https://faclonlabs.com/authors/aditya.jpg"
              />
            </div>
            <div>
              <Label>Profile URL (optional)</Label>
              <Input
                value={form.author_bio_url || ""}
                onChange={(e) => update("author_bio_url", e.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
            </div>
          </div>
          <div className="mt-3">
            <Label>Bio text</Label>
            <Textarea
              rows={4}
              value={form.author_bio_text || ""}
              onChange={(e) => update("author_bio_text", e.target.value)}
              placeholder="2–3 sentences with credentials, years of experience, and topical authority. e.g. 'Aditya leads Industrial AI at Faclon Labs, where he's spent 8+ years deploying predictive-maintenance and OEE systems across cement, steel, and power plants.'"
            />
          </div>
        </div>

        {/* ─── Related articles + AggregateRating ───────────────────── */}
        <div className="mt-6 pt-6 border-t border-zinc-200">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Related posts &amp; star ratings
          </div>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.related_articles_enabled !== false}
              onChange={(e) =>
                update("related_articles_enabled", e.target.checked)
              }
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>
              Show a &ldquo;Related posts&rdquo; list at the end of every post
              <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                Picks a handful of your other posts that cover similar
                topics and lists them at the bottom. Keeps readers on
                your site longer, which Google reads as a quality signal.
              </span>
            </span>
          </label>
          <div className="mt-3">
            <Label>How many related posts?</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={form.related_articles_count || 4}
              onChange={(e) =>
                update("related_articles_count", Number(e.target.value))
              }
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              3–4 is the sweet spot. More than 6 starts to feel like
              spam.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm text-zinc-700 mt-5">
            <input
              type="checkbox"
              checked={!!form.auto_aggregate_rating}
              onChange={(e) =>
                update("auto_aggregate_rating", e.target.checked)
              }
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>
              Show star ratings on review &amp; comparison posts
              <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">
                When on, posts whose title looks like a review or
                comparison (e.g. &ldquo;X vs Y,&rdquo; &ldquo;Best
                …,&rdquo; &ldquo;Review of …,&rdquo; &ldquo;Top 10
                …&rdquo;) get a star-rating widget that can show up next
                to the post in Google search. Other posts are left alone.
                <strong>
                  {" "}
                  Only turn this on if the ratings are real
                </strong>{" "}
                — Google penalises fake ratings.
              </span>
            </span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <Label>Average rating (1–5 stars)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                step={0.1}
                value={form.default_rating_value ?? 4.7}
                onChange={(e) =>
                  update("default_rating_value", Number(e.target.value))
                }
              />
            </div>
            <div>
              <Label>Number of reviews</Label>
              <Input
                type="number"
                min={1}
                value={form.default_rating_count ?? 24}
                onChange={(e) =>
                  update("default_rating_count", Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>

        {/* ─── Product / feature page markup ─────────────────────────── */}
        <div className="mt-6 pt-6 border-t border-zinc-200">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Product / feature page markup
          </div>
          <p className="text-[12px] text-zinc-600 mb-3">
            For posts about your product or features, adds extra markup
            so the post can show up in Google&apos;s product results
            (with rating stars, app category, etc.). Only added when the
            post&apos;s title or main keyword matches one of the words
            below — regular blog posts aren&apos;t affected.
          </p>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={!!form.software_application_enabled}
              onChange={(e) =>
                update("software_application_enabled", e.target.checked)
              }
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>
              Add product markup to detected product / feature posts
            </span>
          </label>
          <div className="mt-3">
            <Label>Words that mark a post as a product page</Label>
            <Input
              value={(form.software_application_keywords || []).join(", ")}
              onChange={(e) =>
                update(
                  "software_application_keywords",
                  e.target.value
                    .split(/[,;\n]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="e.g. OEE platform, predictive maintenance software, IIoT dashboard"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Separate with commas. Capitalisation doesn&apos;t matter.
              Leave empty to turn detection off — nothing is added even
              when the toggle is on.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <Label>What kind of product is it?</Label>
              <Input
                value={
                  form.software_application_category ||
                  "BusinessApplication"
                }
                onChange={(e) =>
                  update(
                    "software_application_category",
                    e.target.value,
                  )
                }
                placeholder="BusinessApplication"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Pick from Google&apos;s standard list.
                <code> BusinessApplication </code> for B2B SaaS,
                <code> DeveloperApplication </code> for dev tools,
                <code> DesignApplication </code> for design software.
              </p>
            </div>
            <div>
              <Label>Where does it run?</Label>
              <Input
                value={
                  form.software_application_operating_system || "Web"
                }
                onChange={(e) =>
                  update(
                    "software_application_operating_system",
                    e.target.value,
                  )
                }
                placeholder="Web"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Use &ldquo;Web&rdquo; for browser-based products.
                Comma-separate for cross-platform apps (e.g.{" "}
                <code>Web, iOS, Android</code>).
              </p>
            </div>
          </div>
        </div>
      </Card>
      </Collapsible>
      )}

      {activeTab === "advanced" && (
      <Collapsible
        title="Update old posts"
        hint="Re-run the SEO checks and fill in missing details on posts that are already published"
      >
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Refresh older posts
        </div>
        <BackfillCard cronSecret={form.cron_secret} />
      </Card>
      </Collapsible>
      )}

      {activeTab === "essentials" && (
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          How the AI should write
        </div>
        <div className="space-y-3">
          <div>
            <Label>Brand name</Label>
            <Input
              value={form.brand_name}
              onChange={(e) => update("brand_name", e.target.value)}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              How the AI refers to you in the writing.
            </p>
          </div>
          <div>
            <Label>Writing style</Label>
            <Textarea
              rows={4}
              value={form.brand_tone}
              onChange={(e) => update("brand_tone", e.target.value)}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Describe how posts should sound. Example: &ldquo;Professional
              but conversational, technical but accessible. Focus on real
              outcomes, avoid buzzwords.&rdquo;
            </p>
          </div>
          <div>
            <Label>How long should each post be?</Label>
            <Input
              type="number"
              min={400}
              max={3000}
              value={form.words_target}
              onChange={(e) => update("words_target", Number(e.target.value))}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Target word count. 1200 is a typical sweet spot for B2B blog
              posts (about 5 min read).
            </p>
          </div>
        </div>
      </Card>
      )}

      {activeTab === "advanced" && (
      <Collapsible
        title="Edit AI instructions (advanced)"
        hint="Change the exact words the AI sees. Only touch if you know what you're doing — bad edits will break the writing."
      >
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Advanced: edit the AI&apos;s instructions
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          Most people never need this. These are the exact instructions sent
          to the AI when writing each post. Edit them only if you know what
          you&apos;re doing — wrong edits will break the writing. Use{" "}
          <code>{"{{placeholder}}"}</code> where you want the system to fill
          in things like the topic or your tags. Click <em>Reset to
          default</em> on any field if you mess it up.
        </p>

        <div className="space-y-6">
          <PromptBlock
            title="Outline step — AI role"
            description="The AI's job description for the planning step. Tells it what kind of writer it is."
            value={form.outline_system_prompt}
            onChange={(v) => update("outline_system_prompt", v)}
            onReset={() => update("outline_system_prompt", DEFAULT_OUTLINE_SYSTEM)}
            rows={6}
          />

          <PromptBlock
            title="Outline step — the request itself"
            description="What we send to the AI for planning. Keep {{json_schema}} — that tells the AI exactly which fields to fill in."
            value={form.outline_user_template}
            onChange={(v) => update("outline_user_template", v)}
            onReset={() => update("outline_user_template", DEFAULT_OUTLINE_USER)}
            rows={14}
            placeholders={OUTLINE_PLACEHOLDERS}
          />

          <PromptBlock
            title="Writing step — AI role"
            description='The AI"s job description for the actual writing step. Keep "output only markdown" so the result is usable.'
            value={form.body_system_prompt}
            onChange={(v) => update("body_system_prompt", v)}
            onReset={() => update("body_system_prompt", DEFAULT_BODY_SYSTEM)}
            rows={10}
          />

          <PromptBlock
            title="Writing step — the request itself"
            description="What we send to the AI when writing the body. Can use the planning step's output via the placeholders below."
            value={form.body_user_template}
            onChange={(v) => update("body_user_template", v)}
            onReset={() => update("body_user_template", DEFAULT_BODY_USER)}
            rows={18}
            placeholders={BODY_PLACEHOLDERS}
          />
        </div>
      </Card>
      </Collapsible>
      )}

      <div className="sticky bottom-0 -mx-1 mt-4 px-4 py-3 bg-zinc-50/95 backdrop-blur border-t border-zinc-200 flex items-center justify-end gap-3 z-10">
        {savedAt && (
          <div className="text-xs text-green-700">Saved at {savedAt}</div>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
      </div>
    </form>
  );
}

function PromptBlock({
  title,
  description,
  value,
  onChange,
  onReset,
  rows,
  placeholders,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  rows: number;
  placeholders?: PlaceholderDoc[];
}) {
  // Local edit-mode toggle so users don't accidentally type into a large
  // prompt textarea. Save still happens via the global Save button —
  // "Done editing" here only switches back to the read-only preview.
  const [editing, setEditing] = useState(false);
  const displayValue = value || "(empty — pipeline uses the platform default)";

  return (
    <div className="border border-zinc-200 rounded-md p-3">
      <div className="flex items-center justify-between mb-1 gap-2">
        <Label>{title}</Label>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={onReset}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 underline"
              >
                Reset to default
              </button>
              <Button
                type="button"
                variant="primary"
                onClick={() => setEditing(false)}
              >
                <Check size={14} /> Done editing
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} /> Edit
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <Textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs leading-relaxed"
          placeholder="Empty = use platform default."
          autoFocus
        />
      ) : (
        <pre
          className={`font-mono text-xs leading-relaxed whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50/50 p-3 max-h-64 overflow-y-auto ${
            value ? "text-zinc-800" : "text-zinc-400 italic"
          }`}
        >
          {displayValue}
        </pre>
      )}
      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-zinc-500">{description}</p>
        <span className="text-[11px] text-zinc-400 font-mono">
          {value.length} chars
        </span>
      </div>
      {editing && (
        <p className="text-[11px] text-amber-700 mt-1">
          Click <strong>Done editing</strong> to lock the field, then{" "}
          <strong>Save settings</strong> at the bottom to persist.
        </p>
      )}
      {placeholders && placeholders.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-zinc-600 hover:text-zinc-900">
            Available placeholders ({placeholders.length})
          </summary>
          <div className="mt-2 rounded-md bg-zinc-50 border border-zinc-200 p-2">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="font-medium pb-1 pr-2 w-[160px]">
                    Placeholder
                  </th>
                  <th className="font-medium pb-1">What it expands to</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {placeholders.map((p) => (
                  <tr key={p.name} className="border-t border-zinc-100">
                    <td className="py-1 pr-2 font-mono text-zinc-800">{`{{${p.name}}}`}</td>
                    <td className="py-1 text-zinc-600">
                      <div>{p.description}</div>
                      <div className="text-zinc-400 mt-0.5 font-mono">
                        e.g. {p.example}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function FieldSlug({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && (
        <p className="text-[11px] text-zinc-500 mt-1">{hint}</p>
      )}
    </div>
  );
}

function BackfillCard({ cronSecret }: { cronSecret: string }) {
  const [busy, setBusy] = useState<null | "metrics" | "full">(null);
  const [result, setResult] = useState<string | null>(null);

  async function run(mode: "metrics" | "full") {
    if (
      mode === "full" &&
      !confirm(
        "Refresh all existing posts?\n\nThe AI will fill in any missing SEO info (title, description, keywords) for posts that don't have it. You'll be charged by Groq for each post it updates.",
      )
    )
      return;
    setBusy(mode);
    setResult(null);
    try {
      const url =
        mode === "metrics"
          ? "/api/backfill?metricsOnly=1"
          : "/api/backfill";
      const headers: Record<string, string> = {};
      if (cronSecret) headers["x-cron-secret"] = cronSecret;
      const res = await fetch(url, { method: "POST", headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Backfill failed");
      setResult(
        `Checked ${json.scanned} posts · AI updated ${json.llm_backfilled} · readability + SEO scores refreshed for ${json.quality_rescored} · errors ${json.errors?.length ?? 0}`,
      );
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">
        Brings older posts up to the current quality and SEO setup. Safe to
        run multiple times — posts that already have everything are skipped.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="secondary"
          onClick={() => run("metrics")}
          disabled={busy !== null}
        >
          {busy === "metrics"
            ? "Refreshing scores…"
            : "Refresh quality scores (free)"}
        </Button>
        <Button
          type="button"
          onClick={() => run("full")}
          disabled={busy !== null}
        >
          {busy === "full"
            ? "Updating with AI…"
            : "Fill in missing SEO info (uses AI)"}
        </Button>
      </div>
      {result && <div className="text-xs text-zinc-700">{result}</div>}
    </div>
  );
}
