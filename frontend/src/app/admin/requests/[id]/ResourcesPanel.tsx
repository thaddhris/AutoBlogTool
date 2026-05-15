"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import { Badge } from "@/components/ui";
import { Resource } from "@/lib/types";
import { FileText, Globe, StickyNote, Trash2 } from "lucide-react";

const iconFor = (type: string) =>
  type === "url" ? Globe : type === "note" ? StickyNote : FileText;

export default function ResourcesPanel({
  requestId,
  initialResources,
}: {
  requestId: string;
  initialResources: Resource[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"file" | "url" | "note">("file");
  const [urlVal, setUrlVal] = useState("");
  const [noteVal, setNoteVal] = useState("");
  const [noteName, setNoteName] = useState("");

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/requests/${requestId}/resources`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setBusy(false);
    }
  }

  async function submitUrl() {
    if (!urlVal.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url", source: urlVal.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fetch failed");
      setUrlVal("");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitNote() {
    if (!noteVal.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          text: noteVal,
          name: noteName.trim() || "Note",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setNoteVal("");
      setNoteName("");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(resourceId: string) {
    if (!confirm("Delete this resource?")) return;
    const res = await fetch(
      `/api/requests/${requestId}/resources/${resourceId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Resources</h2>
      <Card>
        <div className="flex border-b border-zinc-200 mb-3 -mx-4 -mt-4 px-4 pt-2">
          {(["file", "url", "note"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t === "file"
                ? "Upload PDF/DOCX"
                : t === "url"
                  ? "Add URL"
                  : "Add Note"}
            </button>
          ))}
        </div>
        {tab === "file" && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              Supported: PDF, DOCX. Text is extracted, chunked, and indexed for
              retrieval at generation time.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc"
              className="hidden"
              onChange={uploadFile}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              variant="secondary"
            >
              {busy ? "Uploading…" : "Choose file"}
            </Button>
          </div>
        )}
        {tab === "url" && (
          <div className="space-y-2">
            <Label>URL</Label>
            <div className="flex gap-2">
              <Input
                value={urlVal}
                onChange={(e) => setUrlVal(e.target.value)}
                placeholder="https://…"
              />
              <Button onClick={submitUrl} disabled={busy}>
                {busy ? "Fetching…" : "Add"}
              </Button>
            </div>
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
              value={noteVal}
              onChange={(e) => setNoteVal(e.target.value)}
              rows={5}
              placeholder="Paste research notes, product details, internal docs…"
            />
            <Button onClick={submitNote} disabled={busy}>
              {busy ? "Saving…" : "Save note"}
            </Button>
          </div>
        )}
      </Card>

      <div className="space-y-2">
        {initialResources.length === 0 && (
          <div className="text-xs text-zinc-400 italic py-4 text-center">
            No resources attached yet
          </div>
        )}
        {initialResources.map((r) => {
          const Icon = iconFor(r.type);
          return (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon size={16} className="text-zinc-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {r.source}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                <button
                  onClick={() => remove(r.id)}
                  className="p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-red-600"
                  aria-label="Delete resource"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
