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

  // A request whose blog already went live is "locked" — regenerating would
  // silently replace the live record and orphan the published Webflow post,
  // and deleting would drop the local row while the CMS keeps a copy. Force
  // the admin to unpublish from the blog detail page first.
  const isPublished = request.status === "published";
  const isProcessing = request.status === "processing";

  async function generate() {
    if (isPublished) return;
    if (
      hasBlog &&
      !confirm(
        "Regenerate will create a new draft and replace the existing one. The old draft body, edits, and FAQ will be lost. Continue?",
      )
    ) {
      return;
    }
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
    if (isPublished) return; // Defense-in-depth — the button isn't rendered.
    if (!confirm("Delete this request? Resources and any draft will be lost.")) {
      return;
    }
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
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {!isPublished && (
          <>
            <Button
              onClick={generate}
              disabled={busy !== null || isProcessing}
              title={
                hasBlog
                  ? "Replace the current draft with a freshly generated one"
                  : "Generate a draft from this request"
              }
            >
              {busy === "generate"
                ? "Generating…"
                : isProcessing
                  ? "Generating…"
                  : hasBlog
                    ? "Regenerate blog"
                    : "Generate blog"}
            </Button>
            <Button
              variant="danger"
              onClick={remove}
              disabled={busy !== null}
              title="Delete this request and its draft"
            >
              Delete
            </Button>
          </>
        )}
      </div>
      {isPublished && (
        <div className="text-[11px] text-zinc-500 max-w-[280px] text-right">
          Published. Open the blog and click <strong>Unpublish</strong> to
          revert to draft for editing or regeneration.
        </div>
      )}
    </div>
  );
}
