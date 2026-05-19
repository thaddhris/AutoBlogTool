"use client";

import { useState } from "react";
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
  Activity,
  PenTool,
  FileText,
  Send,
  Wrench,
  Pencil,
  Check,
} from "lucide-react";

type TabId = "ai" | "queue" | "brand" | "prompts" | "webflow" | "maintenance";

const TABS: { id: TabId; label: string; icon: typeof Sparkles }[] = [
  { id: "ai", label: "AI & images", icon: Sparkles },
  { id: "queue", label: "Schedule", icon: Activity },
  { id: "brand", label: "Writing style", icon: PenTool },
  { id: "prompts", label: "Advanced prompts", icon: FileText },
  { id: "webflow", label: "Webflow", icon: Send },
  { id: "maintenance", label: "Refresh older posts", icon: Wrench },
];

export default function SettingsForm({
  initial,
  hasGroqKey,
  hasWebflowToken,
  hasGeminiKey,
  hasPexelsKey,
}: {
  initial: Settings;
  hasGroqKey: boolean;
  hasWebflowToken: boolean;
  hasGeminiKey: boolean;
  hasPexelsKey: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("ai");

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
      {activeTab === "ai" && (
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

      {activeTab === "queue" && (
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
      )}

      {activeTab === "ai" && (
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

      {activeTab === "webflow" && (
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

      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Match Webflow fields
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          Tell us the name of each field in your Webflow collection so we
          know where to send each piece of the post. The defaults match the
          standard Faclon &ldquo;Blog Posts&rdquo; collection — change any
          that you&apos;ve renamed. Leave blank to skip a field.
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
      )}

      {activeTab === "maintenance" && (
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Refresh older posts
        </div>
        <BackfillCard cronSecret={form.cron_secret} />
      </Card>
      )}

      {activeTab === "brand" && (
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

      {activeTab === "prompts" && (
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
