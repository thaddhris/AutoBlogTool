"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { RefreshCw, Upload, Link as LinkIcon, X } from "lucide-react";

/**
 * Inline banner controls — sit under the hero image on the blog editor.
 *
 *   • Regenerate: re-runs the configured image provider (gpt-image-1 / Fal /
 *     etc.) on the existing title + meta description, applies the glass
 *     overlay, swaps the URL on the blog row.
 *   • Upload: file picker → multipart upload → server saves to
 *     `.data/banners/`, applies the overlay, swaps the URL.
 *   • Paste URL: shows a small input; submits a PATCH to `/api/blogs/<id>`
 *     setting `banner_url` to the pasted absolute URL. No download —
 *     Webflow / the editor fetch the URL directly.
 *
 * The component owns its own busy / error state and calls `router.refresh()`
 * after every successful change so the BlogEditor re-renders with the new
 * banner.
 */
export default function BannerActions({
  blogId,
  status,
}: {
  blogId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "regen" | "upload" | "url">(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locked = status === "published" || status === "publishing";

  async function call(
    url: string,
    init: RequestInit,
    onBusy: typeof busy,
  ): Promise<void> {
    setBusy(onBusy);
    try {
      const res = await fetch(url, init);
      const raw = await res.text();
      let json: { error?: string } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* keep empty */
      }
      if (!res.ok) {
        throw new Error(
          json.error || `Request failed (HTTP ${res.status} ${res.statusText}).`,
        );
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function onRegen() {
    if (locked) return;
    if (
      !confirm(
        "Regenerate the banner? This costs roughly $0.19 on OpenAI gpt-image-1 (or whatever your configured image provider costs).",
      )
    )
      return;
    void call(
      `/api/blogs/${blogId}/regen-banner`,
      { method: "POST" },
      "regen",
    );
  }

  function onPickFile() {
    if (locked) return;
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    await call(
      `/api/blogs/${blogId}/upload-banner`,
      { method: "POST", body: fd },
      "upload",
    );
    // Reset the input so picking the same file again re-fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    const url = customUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      alert("Paste an absolute http:// or https:// URL.");
      return;
    }
    await call(
      `/api/blogs/${blogId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banner_url: url }),
      },
      "url",
    );
    setShowUrlInput(false);
    setCustomUrl("");
  }

  return (
    <div className="mb-4 -mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={onRegen}
          disabled={busy !== null || locked}
          title={
            locked
              ? "Unpublish first to change the banner"
              : "Re-run the AI image provider"
          }
          className="text-xs"
        >
          <RefreshCw size={12} />{" "}
          {busy === "regen" ? "Regenerating…" : "Regenerate banner"}
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={onPickFile}
          disabled={busy !== null || locked}
          title={locked ? "Unpublish first" : "Upload your own image"}
          className="text-xs"
        >
          <Upload size={12} /> {busy === "upload" ? "Uploading…" : "Upload"}
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => setShowUrlInput((v) => !v)}
          disabled={busy !== null || locked}
          title={locked ? "Unpublish first" : "Use an image URL"}
          className="text-xs"
        >
          <LinkIcon size={12} /> Use URL
        </Button>
        {locked && (
          <span className="text-[11px] text-zinc-500">
            Unpublish to change the banner.
          </span>
        )}
      </div>

      {showUrlInput && (
        <form
          onSubmit={onUrlSubmit}
          className="mt-2 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2"
        >
          <input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
            autoFocus
          />
          <Button
            type="submit"
            disabled={busy !== null || !customUrl.trim()}
            className="text-xs"
          >
            {busy === "url" ? "Saving…" : "Use this URL"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setShowUrlInput(false);
              setCustomUrl("");
            }}
            className="text-zinc-500 hover:text-zinc-800 p-1"
            title="Cancel"
          >
            <X size={14} />
          </button>
        </form>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  );
}
