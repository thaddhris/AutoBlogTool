"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";

export default function RunNowButton() {
  const [busy, setBusy] = useState<
    null | "queue" | "publish" | "discover"
  >(null);
  const router = useRouter();

  // Calls the admin-only /api/admin/run-now endpoint, which runs the same
  // pipeline as the external cron endpoints but without requiring the cron
  // secret — admins triggering this from the dashboard are already trusted.
  // External schedulers (n8n etc.) keep using /api/cron/{process,publish,topic-discovery}
  // with the secret query/header.
  async function ping(kind: "process" | "publish" | "discover") {
    const label: "queue" | "publish" | "discover" =
      kind === "process" ? "queue" : kind === "publish" ? "publish" : "discover";
    setBusy(label);
    try {
      const res = await fetch("/api/admin/run-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      // Robust to non-JSON bodies (proxy returns HTML on 5xx).
      const raw = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        /* leave empty */
      }
      if (!res.ok) {
        throw new Error(
          (json.error as string) ||
            `HTTP ${res.status} ${res.statusText}` ||
            "Failed",
        );
      }
      // The endpoint runs in background-mode and returns 202 immediately,
      // so the response body is just `{ kind, started: true }`. We show a
      // friendly "kicked off" toast and refresh the page so the user sees
      // the request flip into "processing" / new drafts as they complete.
      const heading =
        label === "queue"
          ? "Queue tick"
          : label === "publish"
            ? "Publish tick"
            : "Topic discovery";
      const detail =
        label === "queue"
          ? "Writing pending requests. Refresh in a couple of minutes — drafts will appear here as they finish."
          : label === "publish"
            ? "Draining drafts whose review window expired. Live posts will appear in the Live column shortly."
            : "Pulling keyword ideas from DataForSEO and clustering them. New requests will appear in the queue in 5–20 seconds.";
      alert(`${heading} started in the background.\n\n${detail}`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        onClick={() => ping("discover")}
        disabled={busy !== null}
        title="Run autonomous topic discovery — pulls trending keyword ideas for your seed topics and auto-creates Blog Requests for the highest-opportunity ones"
      >
        {busy === "discover" ? "Discovering…" : "Discover topics now"}
      </Button>
      <Button
        variant="secondary"
        onClick={() => ping("publish")}
        disabled={busy !== null}
      >
        {busy === "publish" ? "Publishing…" : "Drain due drafts"}
      </Button>
      <Button onClick={() => ping("process")} disabled={busy !== null}>
        {busy === "queue" ? "Running…" : "Run queue now"}
      </Button>
    </div>
  );
}
