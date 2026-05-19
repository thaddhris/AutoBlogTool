"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { BlogRequest } from "@/lib/types";
import { Pencil, X, Save } from "lucide-react";

/**
 * Inline-editable Brief card. The PATCH endpoint at
 * `/api/requests/[id]` already accepts keywords/tags/instructions/priority/
 * label/topic — this just wraps a form around the same fields.
 *
 * Status is intentionally NOT editable here. The pipeline mutates it from
 * pending → processing → draft, and the Regenerate / Delete actions are the
 * sanctioned way to move it back. Letting admins set it freely would let
 * them park a request in "processing" forever, hiding it from both queues.
 */
export default function BriefEditor({ request }: { request: BlogRequest }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state — comma/newline-separated text for keywords + tags so admins
  // can edit them as a single textbox, matching the create-request UX.
  const [label, setLabel] = useState(request.label);
  const [topic, setTopic] = useState(request.topic);
  const [keywords, setKeywords] = useState(request.keywords.join(", "));
  const [tags, setTags] = useState(request.tags.join(", "));
  const [instructions, setInstructions] = useState(request.instructions);
  const [priority, setPriority] = useState(String(request.priority));

  function cancel() {
    setLabel(request.label);
    setTopic(request.topic);
    setKeywords(request.keywords.join(", "));
    setTags(request.tags.join(", "));
    setInstructions(request.instructions);
    setPriority(String(request.priority));
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          topic,
          keywords,
          tags,
          instructions,
          priority: Number(priority) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setEditing(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Brief
          </div>
          <Button
            variant="ghost"
            onClick={() => setEditing(true)}
            type="button"
            className="text-xs"
          >
            <Pencil size={12} /> Edit
          </Button>
        </div>
        <dl className="text-sm space-y-2">
          <div>
            <dt className="text-xs text-zinc-500">Keywords</dt>
            <dd className="text-zinc-800">
              {request.keywords.length ? request.keywords.join(", ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Resource-pool tags</dt>
            <dd className="text-zinc-800">
              {request.tags.length ? (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {request.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Instructions</dt>
            <dd className="text-zinc-800 whitespace-pre-wrap">
              {request.instructions || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Priority</dt>
            <dd className="text-zinc-800">{request.priority}</dd>
          </div>
        </dl>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Editing brief
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            onClick={cancel}
            type="button"
            disabled={saving}
            className="text-xs"
          >
            <X size={12} /> Cancel
          </Button>
          <Button
            onClick={save}
            type="button"
            disabled={saving}
            className="text-xs"
          >
            <Save size={12} /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label>Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Short internal name"
          />
        </div>
        <div>
          <Label>Topic</Label>
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="What the post is about"
          />
        </div>
        <div>
          <Label>Keywords</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Comma-separated, e.g. predictive maintenance, OEE"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Separate with commas. The first one is treated as the primary
            keyword.
          </p>
        </div>
        <div>
          <Label>Resource-pool tags</Label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated, e.g. faclonoverview, cement-plant"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Pool resources tagged with any of these are attached at
            generation time.
          </p>
        </div>
        <div>
          <Label>Instructions</Label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            placeholder="Anything extra the writer should know — tone, examples to cite, sections to include, etc."
          />
        </div>
        <div className="w-40">
          <Label>Priority</Label>
          <Input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Higher numbers run first.
          </p>
        </div>
      </div>
    </Card>
  );
}
