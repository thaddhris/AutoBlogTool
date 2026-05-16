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

export default function SettingsForm({
  initial,
  hasGroqKey,
  hasWebflowToken,
}: {
  initial: Settings;
  hasGroqKey: boolean;
  hasWebflowToken: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

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
      for (const k of ["groq_api_key", "webflow_token"] as const) {
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
    <form onSubmit={save} className="space-y-4">
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
                placeholder="e.g. 6a08052216d26e9419b7119c"
              />
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

      <div className="flex items-center justify-end gap-3">
        {savedAt && (
          <div className="text-xs text-green-700">Saved at {savedAt}</div>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
