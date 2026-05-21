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

  // ── Background-mode generate ───────────────────────────────────────────
  // The generate route returns 202 immediately and runs the pipeline in the
  // background (so nginx's 60s proxy_read_timeout doesn't 504 us). After
  // kick-off we poll /api/requests/<id> every 3s until the request status
  // leaves 'processing' — at which point we know the pipeline finished and
  // can either show the error or refresh into the new draft.
  async function pollUntilDone(): Promise<{
    status: string;
    last_error: string | null;
  } | null> {
    const MAX_POLLS = 100; // 100 × 3s = 5 minutes — far longer than any
    // realistic generation. If we exceed this the
    // pipeline is probably stuck.
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const r = await fetch(`/api/requests/${request.id}`, {
          cache: "no-store",
        });
        if (!r.ok) continue; // transient — keep trying
        const j = await r.json();
        const status = j?.request?.status as string | undefined;
        if (status && status !== "processing") {
          return {
            status,
            last_error: j.request.last_error ?? null,
          };
        }
      } catch {
        // network blip — keep polling
      }
    }
    return null;
  }

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
      // Robust to non-JSON bodies — when the upstream Next process is being
      // restarted, the proxy can return an HTML 502/504 page. Parsing that
      // as JSON would throw "Unexpected token '<'", which is unhelpful.
      let serverMessage: string | null = null;
      const raw = await res.text();
      try {
        const json = raw ? JSON.parse(raw) : null;
        serverMessage =
          json && typeof json === "object"
            ? (json.error ?? null)
            : null;
      } catch {
        // Body wasn't JSON. Trim any HTML noise out of the snippet.
        serverMessage = raw.replace(/<[^>]+>/g, "").trim().slice(0, 240) || null;
      }
      if (!res.ok) {
        throw new Error(
          serverMessage ||
            `Generate failed (HTTP ${res.status} ${res.statusText}). The dev server may be restarting — wait a few seconds and try again.`,
        );
      }

      // Show the "processing" badge on the page while the pipeline runs.
      router.refresh();

      // Wait for the pipeline to finish in the background, then react.
      const finalState = await pollUntilDone();
      if (!finalState) {
        alert(
          "Generation is taking longer than 5 minutes. The pipeline is probably still running on the server — refresh the page in a minute to see if the draft appeared.",
        );
      } else if (finalState.status === "failed") {
        alert(
          finalState.last_error ||
            "Generation failed for an unknown reason. Check the Activity Log.",
        );
      }
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
