"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Textarea } from "@/components/ui";

export default function RequestsToolbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/requests/import", {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Import failed");
    } else {
      alert(
        `Import done.\nCreated: ${json.created}\nSkipped: ${json.skipped}\nErrors: ${json.errors?.length ?? 0}`,
      );
      router.refresh();
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <a
        className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800"
        href="/api/requests/template"
      >
        Download template
      </a>
      <a
        className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800"
        href="/api/requests/export"
      >
        Export
      </a>
      <Button variant="secondary" onClick={() => fileRef.current?.click()}>
        Import Excel
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onImport}
      />
      <Button onClick={() => setOpen(true)}>+ New request</Button>
      {open && <NewRequestModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const body = {
      label: form.get("label"),
      topic: form.get("topic"),
      keywords: form.get("keywords"),
      tags: form.get("tags"),
      instructions: form.get("instructions"),
      priority: Number(form.get("priority") || 0),
    };
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Failed");
      setBusy(false);
      return;
    }
    onClose();
    router.refresh();
    router.push(`/admin/requests/${json.request.id}`);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">New Blog Request</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label required>Label / title</Label>
            <Input name="label" required placeholder="Internal title" />
          </div>
          <div>
            <Label required>Topic / context</Label>
            <Textarea
              name="topic"
              required
              rows={3}
              placeholder="What this blog should be about"
            />
          </div>
          <div>
            <Label>Keywords (comma separated)</Label>
            <Input
              name="keywords"
              placeholder="predictive maintenance, IIoT, cement"
            />
          </div>
          <div>
            <Label>Library tags (comma-separated)</Label>
            <Input
              name="tags"
              placeholder="ai, iot, predictive-maintenance"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Pick tags from your Resource Library — any matching resources
              get used as background reading when the AI writes this post.
            </p>
          </div>
          <div>
            <Label>Instructions / notes</Label>
            <Textarea name="instructions" rows={2} />
          </div>
          <div>
            <Label>Priority</Label>
            <Input name="priority" type="number" defaultValue={0} />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
