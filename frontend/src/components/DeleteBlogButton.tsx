"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

/**
 * Inline trash-icon button that calls DELETE /api/blogs/<id>. Refuses to
 * even ask the API when the blog is published — the server would 409
 * anyway, but skipping the network round-trip makes the UI feel snappy.
 * The published path here only matters when the parent renders this button
 * on a list that mixes published rows in; on drafts/scheduled/failed lists
 * it's effectively dead code.
 */
export default function DeleteBlogButton({
  blogId,
  title,
  status,
  size = "md",
}: {
  blogId: string;
  title: string;
  status: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const blocked = status === "published" || status === "publishing";

  async function onClick(e: React.MouseEvent) {
    // Stop the click from bubbling to a parent <Link> that would navigate
    // into the blog editor.
    e.preventDefault();
    e.stopPropagation();
    if (blocked) {
      alert(
        "Open the blog and click Unpublish first — published posts can't be deleted directly.",
      );
      return;
    }
    if (
      !confirm(`Delete "${title}"?\n\nThis can't be undone.`)
    )
      return;

    setBusy(true);
    try {
      const res = await fetch(`/api/blogs/${blogId}`, { method: "DELETE" });
      const raw = await res.text();
      let json: { error?: string } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* keep empty */
      }
      if (!res.ok)
        throw new Error(json.error || `Delete failed (HTTP ${res.status}).`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const px = size === "sm" ? "px-1.5 py-1" : "px-2 py-1.5";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || blocked}
      title={blocked ? "Unpublish first" : "Delete this draft"}
      aria-label="Delete blog"
      className={`inline-flex items-center justify-center rounded-md ${px} text-red-700 hover:bg-red-50 hover:text-red-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
    >
      <Trash2 size={size === "sm" ? 12 : 14} />
    </button>
  );
}
