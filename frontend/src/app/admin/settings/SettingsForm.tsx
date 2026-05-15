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
}: {
  initial: Settings;
  hasGroqKey: boolean;
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
      // Don't send the masked dot-string back as the API key.
      if (
        typeof payload.groq_api_key === "string" &&
        payload.groq_api_key.startsWith("•")
      ) {
        delete payload.groq_api_key;
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
            <Label>Batch size (per cron tick)</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={form.batch_size}
              onChange={(e) => update("batch_size", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Stagger interval (hours)</Label>
            <Input
              type="number"
              min={0}
              max={168}
              value={form.publish_interval_hours}
              onChange={(e) =>
                update("publish_interval_hours", Number(e.target.value))
              }
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Only used in <code>scheduled</code> mode. 0 = publish all at once.
            </p>
          </div>
          <div>
            <Label>Publish mode</Label>
            <Select
              value={form.publish_mode}
              onChange={(e) =>
                update("publish_mode", e.target.value as Settings["publish_mode"])
              }
            >
              <option value="auto">auto (publish immediately)</option>
              <option value="scheduled">scheduled (queue at intervals)</option>
              <option value="draft">draft (manual review)</option>
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label>Cron secret</Label>
          <Input
            value={form.cron_secret}
            onChange={(e) => update("cron_secret", e.target.value)}
            placeholder="If set, /api/cron/process requires this token"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Pass as <code>?secret=…</code> or header <code>x-cron-secret</code>.
          </p>
        </div>
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
