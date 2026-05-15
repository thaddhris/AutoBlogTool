"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { BlogRequest } from "@/lib/types";

export default function RequestActions({
  request,
  hasBlog,
}: {
  request: BlogRequest;
  hasBlog: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function generate() {
    setBusy("generate");
    try {
      const res = await fetch(`/api/requests/${request.id}/generate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generate failed");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this request? Resources and any draft will be lost.")) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/requests/${request.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/admin/requests");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={generate} disabled={busy !== null}>
        {busy === "generate"
          ? "Generating…"
          : hasBlog
            ? "Regenerate blog"
            : "Generate blog"}
      </Button>
      <Button
        variant="danger"
        onClick={remove}
        disabled={busy !== null}
      >
        Delete
      </Button>
    </div>
  );
}
