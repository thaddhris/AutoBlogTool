"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { PoolResource } from "@/lib/types";
import {
  FileText,
  Globe,
  StickyNote,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
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
  const [editingResource, setEditingResource] = useState<PoolResource | null>(
    null,
  );
  const [tagQuery, setTagQuery] = useState("");
  const [allTagsOpen, setAllTagsOpen] = useState(false);

  // Tag filter UI: cap visible pills + provide a search box. Keeps the page
  // tidy when a workspace accumulates dozens of tags.
  const TAGS_PREVIEW = 12;
  const visibleTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    const filteredByQuery = q
      ? initialTags.filter((t) => t.tag.includes(q))
      : initialTags;
    // Always include the active tag in the rendered set so a filtered pill
    // stays visible even if the search box hides it.
    if (active && !filteredByQuery.some((t) => t.tag === active)) {
      const activeEntry = initialTags.find((t) => t.tag === active);
      if (activeEntry) return [activeEntry, ...filteredByQuery];
    }
    return filteredByQuery;
  }, [initialTags, tagQuery, active]);
  const renderedTags = allTagsOpen
    ? visibleTags
    : visibleTags.slice(0, TAGS_PREVIEW);
  const hiddenCount = Math.max(0, visibleTags.length - renderedTags.length);

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

  async function reindex(id: string, name: string) {
    if (
      !confirm(
        `Refresh "${name}"?\n\nThis re-reads the saved text and cleans up any old formatting issues (like page markers from older PDF uploads). The file, name, and tags all stay the same.`,
      )
    )
      return;
    const res = await fetch(`/api/pool/resources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reindex: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j.error || "Reindex failed");
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
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Filter by tag
          </div>
          {initialTags.length > 0 && (
            <Input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Search tags…"
              className="max-w-[220px] text-xs"
            />
          )}
        </div>
        {initialTags.length === 0 ? (
          <div className="text-xs text-zinc-400 italic">
            No tags yet. Add a resource and give it a tag to see it here.
          </div>
        ) : (
          <>
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
              {renderedTags.map((t) => (
                <button
                  type="button"
                  key={t.tag}
                  onClick={() =>
                    setActive(t.tag === active ? null : t.tag)
                  }
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    active === t.tag
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-white border-zinc-300 text-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {t.tag}{" "}
                  <span className="opacity-60">{t.count}</span>
                </button>
              ))}
              {visibleTags.length === 0 && tagQuery && (
                <span className="text-xs text-zinc-400 italic px-2 py-1">
                  No tag matches &ldquo;{tagQuery}&rdquo;
                </span>
              )}
            </div>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setAllTagsOpen(true)}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 underline mt-2"
              >
                Show {hiddenCount} more tag{hiddenCount === 1 ? "" : "s"}
              </button>
            )}
            {allTagsOpen && visibleTags.length > TAGS_PREVIEW && (
              <button
                type="button"
                onClick={() => setAllTagsOpen(false)}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 underline mt-2"
              >
                Collapse
              </button>
            )}
          </>
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
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => reindex(r.id, r.name)}
                          className="p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900"
                          aria-label="Refresh"
                          title="Refresh — cleans up the saved text (useful after older uploads)"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          onClick={() => setEditingResource(r)}
                          className="p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => remove(r.id)}
                          className="p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-red-600"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {editingResource && (
        <EditModal
          resource={editingResource}
          onClose={() => setEditingResource(null)}
        />
      )}
    </div>
  );
}

function EditModal({
  resource,
  onClose,
}: {
  resource: PoolResource;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(resource.name);
  const [tags, setTags] = useState(resource.tags.join(", "));
  const [text, setText] = useState(resource.content);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        tags: tags
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
      // Only send `text` for note-type resources — the API rejects it for
      // pdf/docx/url with a clear error.
      if (resource.type === "note") payload.text = text;
      const res = await fetch(`/api/pool/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const canEditText = resource.type === "note";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Edit pool resource</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {resource.type} · {resource.source}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-900"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <Label>Tags (comma-separated)</Label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ai, iot, predictive-maintenance"
          />
        </div>

        <div>
          <Label>Content</Label>
          {canEditText ? (
            <Textarea
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-xs"
            />
          ) : (
            <>
              <Textarea
                rows={10}
                value={resource.content}
                readOnly
                className="font-mono text-xs bg-zinc-50"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Only note content is editable. For {resource.type} resources,
                delete and re-upload to replace the content.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} type="button">
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
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

type SourceKind = "file" | "url" | "note";

function UploadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // `kind` is selected explicitly via the three-card picker. Until they pick
  // one, no input is shown — removes the confusion of "do I fill them all?"
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [tags, setTags] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [urlVal, setUrlVal] = useState("");
  const [noteName, setNoteName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPendingFile(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  // When the user switches kind, clear inputs from the other kinds. Prevents
  // half-filled inputs from non-selected sources getting lost mentally.
  function selectKind(k: SourceKind) {
    if (k === kind) return;
    setKind(k);
    if (k !== "file") setPendingFile(null);
    if (k !== "url") setUrlVal("");
    if (k !== "note") {
      setNoteName("");
      setNoteText("");
    }
  }

  const canSubmit =
    !busy &&
    ((kind === "file" && !!pendingFile) ||
      (kind === "url" && urlVal.trim().length > 0) ||
      (kind === "note" && noteText.trim().length > 0));

  async function submit() {
    if (!kind || !canSubmit) return;
    setBusy(true);
    try {
      if (kind === "file") {
        const form = new FormData();
        form.append("file", pendingFile!);
        form.append("tags", tags);
        const res = await fetch("/api/pool/resources", {
          method: "POST",
          body: form,
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Upload failed");
      } else if (kind === "url") {
        const res = await fetch("/api/pool/resources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "url",
            source: urlVal.trim(),
            tags,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Fetch failed");
      } else {
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
      }
      router.refresh();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = !kind
    ? "Pick a resource type above"
    : kind === "file"
      ? pendingFile
        ? `Upload "${pendingFile.name}"`
        : "Pick a file"
      : kind === "url"
        ? "Fetch URL"
        : "Save note";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add pool resource</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              One resource per submission. To add several, save this one then
              click <strong>Add resource</strong> again.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-900"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step 1 — pick exactly one type */}
        <div>
          <Label>What are you adding?</Label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <KindCard
              icon={<FileText size={18} />}
              title="File"
              desc="PDF or DOCX"
              active={kind === "file"}
              onClick={() => selectKind("file")}
            />
            <KindCard
              icon={<Globe size={18} />}
              title="URL"
              desc="Web page"
              active={kind === "url"}
              onClick={() => selectKind("url")}
            />
            <KindCard
              icon={<StickyNote size={18} />}
              title="Note"
              desc="Pasted text"
              active={kind === "note"}
              onClick={() => selectKind("note")}
            />
          </div>
        </div>

        {/* Step 2 — type-specific input (one only, ever) */}
        {kind === "file" && (
          <div>
            <Label>File</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc"
              className="hidden"
              onChange={onFileChosen}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                {pendingFile ? "Change file" : "Choose file"}
              </Button>
              {pendingFile ? (
                <div className="flex items-center gap-1 text-xs text-zinc-700 min-w-0">
                  <span className="truncate max-w-[220px]">
                    {pendingFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    className="p-0.5 text-zinc-400 hover:text-red-600"
                    aria-label="Clear file"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-zinc-400">No file chosen</span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Supported: PDF, DOCX. We read the text out of the file and save
              it so the AI can search through it later.
            </p>
          </div>
        )}
        {kind === "url" && (
          <div>
            <Label>URL</Label>
            <Input
              value={urlVal}
              onChange={(e) => setUrlVal(e.target.value)}
              placeholder="https://…"
              autoFocus
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              We open the page, grab the readable text, and save it. Works for
              most blog posts, docs, and product pages.
            </p>
          </div>
        )}
        {kind === "note" && (
          <div className="space-y-2">
            <div>
              <Label>Title (optional)</Label>
              <Input
                value={noteName}
                onChange={(e) => setNoteName(e.target.value)}
                placeholder="Internal product spec"
                autoFocus
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                rows={6}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Paste research notes, product details, internal docs…"
              />
            </div>
          </div>
        )}

        {/* Step 3 — shared categorization, only visible once a type is picked */}
        {kind && (
          <div className="pt-2 border-t border-zinc-100">
            <Label>Tags (optional, comma-separated)</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ai, iot, predictive-maintenance"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              When a blog request uses any of these tags, this resource is
              automatically used as background reading.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function KindCard({
  icon,
  title,
  desc,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-md border-2 transition-colors ${
        active
          ? "border-zinc-900 bg-zinc-50"
          : "border-zinc-200 hover:border-zinc-400 bg-white"
      }`}
    >
      <div
        className={`mb-1 ${active ? "text-zinc-900" : "text-zinc-500"}`}
      >
        {icon}
      </div>
      <div
        className={`text-sm font-medium ${
          active ? "text-zinc-900" : "text-zinc-800"
        }`}
      >
        {title}
      </div>
      <div className="text-[11px] text-zinc-500">{desc}</div>
    </button>
  );
}
