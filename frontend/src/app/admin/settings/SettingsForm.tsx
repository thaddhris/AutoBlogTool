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
  { id: "queue", label: "Queue & cron", icon: Activity },
  { id: "brand", label: "Brand voice", icon: PenTool },
  { id: "prompts", label: "Prompts", icon: FileText },
  { id: "webflow", label: "Webflow", icon: Send },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
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
          AI provider
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label required>Groq API key</Label>
            <Input
              value={form.groq_api_key}
              onChange={(e) => update("groq_api_key", e.target.value)}
              placeholder={hasGroqKey ? "(set — re-enter to change)" : "gsk_…"}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              {hasGroqKey
                ? "A key is saved. Leave masked to keep it; type a new one to replace."
                : "Required before generating blogs."}
            </p>
          </div>
          <div>
            <Label>Groq model</Label>
            <Input
              value={form.groq_model}
              onChange={(e) => update("groq_model", e.target.value)}
              placeholder="llama-3.3-70b-versatile"
            />
          </div>
        </div>
      </Card>
      )}

      {activeTab === "queue" && (
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Queue & publishing
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Batch size (per queue tick)</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={form.batch_size}
              onChange={(e) => update("batch_size", Number(e.target.value))}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              How many drafts to generate per <code>/api/cron/process</code> call.
            </p>
          </div>
          <div>
            <Label>Draft hold (hours)</Label>
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
              In <code>auto</code> mode, new drafts auto-publish after this
              window. Admin can edit, extend, or publish-now during the hold.
            </p>
          </div>
          <div>
            <Label>Publish mode</Label>
            <Select
              value={form.publish_mode}
              onChange={(e) =>
                update(
                  "publish_mode",
                  e.target.value as Settings["publish_mode"],
                )
              }
            >
              <option value="auto">auto (hold then publish)</option>
              <option value="manual">manual (admin must publish)</option>
            </Select>
          </div>
        </div>
        <div className="mt-4 rounded-md bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600 space-y-1">
          <div className="font-medium text-zinc-700">
            n8n trigger setup
          </div>
          <div>
            <strong>Generate queue:</strong>{" "}
            <code>POST /api/cron/process</code> — every 5–15 min
          </div>
          <div>
            <strong>Auto-publish drafts:</strong>{" "}
            <code>POST /api/cron/publish</code> — every 1–5 min
          </div>
          <div className="pt-1">
            If a cron secret is set below, send it as header{" "}
            <code>x-cron-secret</code> or query <code>?secret=…</code>.
          </div>
        </div>
        <div className="mt-3">
          <Label>Cron secret</Label>
          <Input
            value={form.cron_secret}
            onChange={(e) => update("cron_secret", e.target.value)}
            placeholder="Optional shared token for n8n auth"
          />
        </div>
      </Card>
      )}

      {activeTab === "ai" && (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Image generation
          </div>
          <Select
            value={form.image_provider}
            onChange={(e) =>
              update(
                "image_provider",
                e.target.value as Settings["image_provider"],
              )
            }
            className="max-w-[220px]"
          >
            <option value="placeholder">placeholder (SVG)</option>
            <option value="gemini">Gemini (AI generation, paid)</option>
            <option value="pexels">Pexels (stock photos, free)</option>
          </Select>
        </div>
        {form.image_provider === "placeholder" && (
          <p className="text-[11px] text-zinc-500">
            Each blog gets a deterministic gradient SVG banner. Useful for dev
            but never sent to Webflow (data URLs aren&apos;t accepted).
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
                  hasGeminiKey ? "(set — re-enter to change)" : "AIza…"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Get one at{" "}
                <code>aistudio.google.com</code> — billing must be enabled for
                image models. Leave masked to keep the saved key.
              </p>
            </div>
            <div>
              <Label>Image model</Label>
              <Input
                value={form.gemini_image_model}
                onChange={(e) =>
                  update("gemini_image_model", e.target.value)
                }
                placeholder="gemini-3.1-flash-image"
              />
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
                Free at <code>pexels.com/api</code>. 200 req/hr, 20k/month.
                Returns curated landscape stock photos for the post topic —
                no AI generation, no billing. Photographer credit goes in alt
                text automatically.
              </p>
            </div>
          </div>
        )}
        {form.image_provider !== "placeholder" && (
          <div className="mt-4">
            <Label>Public base URL</Label>
            <Input
              value={form.public_base_url}
              onChange={(e) => update("public_base_url", e.target.value)}
              placeholder="https://autoblogtool.iocompute.ai"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Banners are saved under <code>public/banners/</code> and served
              at <code>/banners/&lt;id&gt;.&lt;ext&gt;</code>. Webflow needs
              an absolute URL — this prefix is prepended at publish time.
              Leave blank to skip image upload to Webflow.
            </p>
          </div>
        )}
      </Card>

      )}

      {activeTab === "webflow" && (
      <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Publisher
          </div>
          <Select
            value={form.publisher}
            onChange={(e) =>
              update("publisher", e.target.value as Settings["publisher"])
            }
            className="max-w-[200px]"
          >
            <option value="markdown">markdown (local file)</option>
            <option value="webflow">webflow CMS</option>
          </Select>
        </div>
        {form.publisher === "markdown" && (
          <p className="text-[11px] text-zinc-500">
            Published blogs are written to{" "}
            <code>frontend/.published/&lt;slug&gt;.md</code> on the server.
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
                    ? "(set — re-enter to change)"
                    : "Bearer token (site- or workspace-scoped)"
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Paste the raw token only — do <strong>not</strong> include the
                word <code>Bearer</code>. Stored in the local SQLite settings
                table; leave the masked value to keep the saved one.
              </p>
            </div>
            <div>
              <Label required>Collection ID</Label>
              <Input
                value={form.webflow_collection_id}
                onChange={(e) =>
                  update("webflow_collection_id", e.target.value)
                }
                placeholder="e.g. 68a6d2bc7a6ac4518f825282"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                The Blog Posts collection. Posts go to{" "}
                <code>/v2/collections/&lt;id&gt;/items/live</code>.
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
                Not used by the current publisher — reserved for image asset
                uploads and site-level operations.
              </p>
            </div>
            <div>
              <Label>Image field slug (optional)</Label>
              <Input
                value={form.webflow_image_field}
                onChange={(e) =>
                  update("webflow_image_field", e.target.value)
                }
                placeholder="main-image"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                If set, the generated banner is uploaded to this CMS field
                as <code>{`{ url, alt }`}</code>. Leave blank to skip.
                Requires <code>public_base_url</code> set (above) so the
                image URL is absolute.
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
              Mark new blogs as <code>featured</code> by default
            </label>
            <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3 text-[11px] text-zinc-600 space-y-1">
              <div className="font-medium text-zinc-700">
                Expected collection fields
              </div>
              <div>
                <code>name</code>, <code>slug</code>, <code>post-body</code>{" "}
                (rich text/HTML), <code>post-summary</code>,{" "}
                <code>featured</code> (bool)
              </div>
              <div>
                Posts are pushed to <code>/v2/collections/&lt;id&gt;/items/live</code>{" "}
                which creates AND publishes in one call.
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Webflow field mapping
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          Pre-filled with the slugs from the Faclon Labs &ldquo;Blog
          Posts&rdquo; collection. Each slug is the CMS field key on your
          collection — adjust if you renamed any. Leave any blank to skip.
        </p>

        <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
          Content
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <FieldSlug
            label="Main image"
            value={form.webflow_image_field}
            onChange={(v) => update("webflow_image_field", v)}
            placeholder="main-image"
          />
          <FieldSlug
            label="Thumbnail image"
            value={form.webflow_thumbnail_field}
            onChange={(v) => update("webflow_thumbnail_field", v)}
            placeholder="thumbnail-image"
            hint="Sent the same image as Main Image."
          />
          <FieldSlug
            label="Post summary"
            value={form.webflow_post_summary_field}
            onChange={(v) => update("webflow_post_summary_field", v)}
            placeholder="post-summary"
          />
          <FieldSlug
            label="Reading time"
            value={form.webflow_reading_time_field}
            onChange={(v) => update("webflow_reading_time_field", v)}
            placeholder="reading-time"
            hint="Auto-computed from word_count, e.g. &ldquo;6 Mins&rdquo;."
          />
        </div>

        <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
          SEO meta
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <FieldSlug
            label="Meta tag (SEO title)"
            value={form.webflow_meta_tag_field}
            onChange={(v) => update("webflow_meta_tag_field", v)}
            placeholder="meta-tag"
          />
          <FieldSlug
            label="Meta description"
            value={form.webflow_meta_description_field}
            onChange={(v) => update("webflow_meta_description_field", v)}
            placeholder="meta-description"
          />
        </div>

        <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
          Reference fields (Webflow expects item IDs, not names)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldSlug
            label="Author field slug"
            value={form.webflow_author_field}
            onChange={(v) => update("webflow_author_field", v)}
            placeholder="author"
          />
          <FieldSlug
            label="Author item ID"
            value={form.webflow_author_item_id}
            onChange={(v) => update("webflow_author_item_id", v)}
            placeholder="6a08…"
            hint="Find this in the Webflow Authors collection (each author's item ID)."
          />
          <FieldSlug
            label="Categories field slug"
            value={form.webflow_categories_field}
            onChange={(v) => update("webflow_categories_field", v)}
            placeholder="categories"
          />
          <FieldSlug
            label="Default category item ID"
            value={form.webflow_default_category_id}
            onChange={(v) => update("webflow_default_category_id", v)}
            placeholder="e.g. Industrial AI item id"
            hint="Used for every new post until per-post categories are supported."
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
              220 wpm is the typical default for technical reading.
            </p>
          </div>
          <div>
            <Label>Public site URL</Label>
            <Input
              value={form.site_url}
              onChange={(e) => update("site_url", e.target.value)}
              placeholder="https://faclonlabs.com"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Where <code>/blog/&lt;slug&gt;</code> lives. Used to build
              absolute URLs in resolved internal links.
            </p>
          </div>
        </div>
      </Card>
      </>
      )}

      {activeTab === "maintenance" && (
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Backfill existing posts
        </div>
        <BackfillCard cronSecret={form.cron_secret} />
      </Card>
      )}

      {activeTab === "brand" && (
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Brand voice
        </div>
        <div className="space-y-3">
          <div>
            <Label>Brand name</Label>
            <Input
              value={form.brand_name}
              onChange={(e) => update("brand_name", e.target.value)}
            />
          </div>
          <div>
            <Label>Voice / tone guidance</Label>
            <Textarea
              rows={4}
              value={form.brand_tone}
              onChange={(e) => update("brand_tone", e.target.value)}
            />
          </div>
          <div>
            <Label>Target word count</Label>
            <Input
              type="number"
              min={400}
              max={3000}
              value={form.words_target}
              onChange={(e) => update("words_target", Number(e.target.value))}
            />
          </div>
        </div>
      </Card>
      )}

      {activeTab === "prompts" && (
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Generation prompts
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          Full control over both the system messages and the user-message
          templates sent to Groq. Use{" "}
          <code>{"{{placeholder}}"}</code> syntax for dynamic values — see
          the &ldquo;Available placeholders&rdquo; sections below each
          template. Unknown placeholders are left literal. Empty = use the
          platform default.
        </p>

        <div className="space-y-6">
          <PromptBlock
            title="Outline call — system message"
            description="Drives metadata + section outline. Output is JSON-validated; tell the model to respond with strict JSON."
            value={form.outline_system_prompt}
            onChange={(v) => update("outline_system_prompt", v)}
            onReset={() => update("outline_system_prompt", DEFAULT_OUTLINE_SYSTEM)}
            rows={6}
          />

          <PromptBlock
            title="Outline call — user message template"
            description='Sent right after the system message. Use {{json_schema}} to inject the locked schema description.'
            value={form.outline_user_template}
            onChange={(v) => update("outline_user_template", v)}
            onReset={() => update("outline_user_template", DEFAULT_OUTLINE_USER)}
            rows={14}
            placeholders={OUTLINE_PLACEHOLDERS}
          />

          <PromptBlock
            title="Body call — system message"
            description='Long-form writer role. Keep "output ONLY markdown" or you get unparseable output.'
            value={form.body_system_prompt}
            onChange={(v) => update("body_system_prompt", v)}
            onReset={() => update("body_system_prompt", DEFAULT_BODY_SYSTEM)}
            rows={10}
          />

          <PromptBlock
            title="Body call — user message template"
            description="Sent right after the system message. Has access to all outline-derived placeholders (h1, tldr, outline, etc.)."
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
        "Run full backfill?\n\nThis hits the LLM once per row that's missing SEO metadata (title_tag, h1, primary_keyword, etc.). Cheap rows are skipped. You'll see Groq usage on your bill.",
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
        `Scanned ${json.scanned} · LLM filled ${json.llm_backfilled} · metrics rescored ${json.quality_rescored} · errors ${json.errors?.length ?? 0}`,
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
        Use this once to bring legacy blogs up to the current SEO contract.
        Idempotent — safe to re-run; rows that already have everything are
        skipped.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="secondary"
          onClick={() => run("metrics")}
          disabled={busy !== null}
        >
          {busy === "metrics"
            ? "Rescoring…"
            : "Recompute metrics + JSON-LD (free)"}
        </Button>
        <Button
          type="button"
          onClick={() => run("full")}
          disabled={busy !== null}
        >
          {busy === "full"
            ? "Backfilling…"
            : "Full backfill (LLM, costs tokens)"}
        </Button>
      </div>
      {result && <div className="text-xs text-zinc-700">{result}</div>}
    </div>
  );
}
