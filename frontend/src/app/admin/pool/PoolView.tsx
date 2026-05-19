"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { PoolResource } from "@/lib/types";
import { FileText, Globe, StickyNote, Plus, Trash2, X } from "lucide-react";
import ClientTime from "@/components/ClientTime";

const iconFor = (type: string) =>
  type === "url" ? Globe : type === "note" ? StickyNote : FileText;

interface TagCount {
  tag: string;
  count: number;
}

export default function PoolView({
  initialResources,
  initialTags,
}: {
  initialResources: PoolResource[];
  initialTags: TagCount[];
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!active) return initialResources;
    return initialResources.filter((r) => r.tags.includes(active));
  }, [active, initialResources]);

  async function remove(id: string) {
    if (!confirm("Delete this pool resource? This cannot be undone.")) return;
    const res = await fetch(`/api/pool/resources/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">
          {initialResources.length} resource
          {initialResources.length === 1 ? "" : "s"} ·{" "}
          {initialTags.length} distinct tag
          {initialTags.length === 1 ? "" : "s"}
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Plus size={14} /> Add resource
        </Button>
      </div>

      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
          Filter by tag
        </div>
        {initialTags.length === 0 ? (
          <div className="text-xs text-zinc-400 italic">
            No tags yet. Add a resource with at least one tag to populate this
            list.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActive(null)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                active === null
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white border-zinc-300 text-zinc-700 hover:border-zinc-500"
              }`}
            >
              all ({initialResources.length})
            </button>
            {initialTags.map((t) => (
              <button
                type="button"
                key={t.tag}
                onClick={() => setActive(t.tag === active ? null : t.tag)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  active === t.tag
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white border-zinc-300 text-zinc-700 hover:border-zinc-500"
                }`}
              >
                {t.tag} <span className="opacity-60">{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            {active
              ? `No resources tagged "${active}". Click "all" above to clear the filter.`
              : "Pool is empty. Click Add resource to upload your first one."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium w-[40%]">Resource</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const Icon = iconFor(r.type);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-100 hover:bg-zinc-50/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon
                          size={14}
                          className="text-zinc-500 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.name}</div>
                          <div className="text-xs text-zinc-500 truncate">
                            {r.source}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TagCell
                        resource={r}
                        editing={editingTagsFor === r.id}
                        onEditStart={() => setEditingTagsFor(r.id)}
                        onEditEnd={() => setEditingTagsFor(null)}
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      <ClientTime at={r.created_at} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          r.status === "ready"
                            ? "green"
                            : r.status === "error"
                              ? "red"
                              : "blue"
                        }
                      >
                        {r.status}
                      </Badge>
                      {r.error && (
                        <div
                          className="text-[11px] text-red-700 mt-1 max-w-[260px] truncate"
                          title={r.error}
                        >
                          {r.error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remove(r.id)}
                        className="p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
}

function TagCell({
  resource,
  editing,
  onEditStart,
  onEditEnd,
}: {
  resource: PoolResource;
  editing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const router = useRouter();
  const [val, setVal] = useState(resource.tags.join(", "));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/pool/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: val }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Save failed");
      }
      onEditEnd();
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="ai, iot, predictive-maintenance"
          className="text-xs"
        />
        <Button onClick={save} disabled={busy} type="button">
          {busy ? "…" : "Save"}
        </Button>
        <button
          type="button"
          onClick={onEditEnd}
          className="p-1 text-zinc-500 hover:text-zinc-900"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1 cursor-pointer"
      onClick={onEditStart}
      title="Click to edit tags"
    >
      {resource.tags.length === 0 ? (
        <span className="text-xs text-zinc-400 italic">untagged</span>
      ) : (
        resource.tags.map((t) => (
          <span
            key={t}
            className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700"
          >
            {t}
          </span>
        ))
      )}
    </div>
  );
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"file" | "url" | "note">("file");
  const [tags, setTags] = useState("");
  const [urlVal, setUrlVal] = useState("");
  const [noteName, setNoteName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("tags", tags);
      const res = await fetch("/api/pool/resources", {
        method: "POST",
        body: form,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed");
      router.refresh();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submitUrl() {
    if (!urlVal.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pool/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url", source: urlVal.trim(), tags }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Fetch failed");
      router.refresh();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pool/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          text: noteText,
          name: noteName.trim() || "Note",
          tags,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      router.refresh();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl space-y-3">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Add pool resource</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-900"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex border-b border-zinc-200">
          {(["file", "url", "note"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 ${
                tab === t
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t === "file" ? "Upload PDF/DOCX" : t === "url" ? "Add URL" : "Add note"}
            </button>
          ))}
        </div>

        <div>
          <Label>Tags (comma-separated)</Label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ai, iot, predictive-maintenance"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Blog requests that select any matching tag will retrieve this
            resource at generation time.
          </p>
        </div>

        {tab === "file" && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              Supported: PDF, DOCX. Text is extracted, chunked, and FTS-indexed.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc"
              className="hidden"
              onChange={uploadFile}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? "Uploading…" : "Choose file"}
            </Button>
          </div>
        )}
        {tab === "url" && (
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={urlVal}
              onChange={(e) => setUrlVal(e.target.value)}
              placeholder="https://…"
            />
            <Button type="button" onClick={submitUrl} disabled={busy}>
              {busy ? "Fetching…" : "Add"}
            </Button>
          </div>
        )}
        {tab === "note" && (
          <div className="space-y-2">
            <Label>Title (optional)</Label>
            <Input
              value={noteName}
              onChange={(e) => setNoteName(e.target.value)}
              placeholder="Internal product spec"
            />
            <Label>Body</Label>
            <Textarea
              rows={6}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Paste research notes, product details, internal docs…"
            />
            <Button type="button" onClick={submitNote} disabled={busy}>
              {busy ? "Saving…" : "Save note"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
