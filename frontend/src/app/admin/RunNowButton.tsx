"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";

export default function RunNowButton() {
  const [busy, setBusy] = useState<null | "queue" | "publish">(null);
  const router = useRouter();

  // Calls the admin-only /api/admin/run-now endpoint, which runs the same
  // pipeline as the external cron endpoints but without requiring the cron
  // secret — admins triggering this from the dashboard are already trusted.
  // External schedulers (n8n etc.) keep using /api/cron/{process,publish}
  // with the secret query/header.
  async function ping(kind: "process" | "publish") {
    const label: "queue" | "publish" = kind === "process" ? "queue" : "publish";
    setBusy(label);
    try {
      const res = await fetch("/api/admin/run-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      // Robust to non-JSON bodies (e.g. proxy returns HTML on dev restart).
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
      const lines = Object.entries(json)
        .filter(([k]) => k !== "errors" && k !== "kind")
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      const errCount = Array.isArray(json.errors) ? json.errors.length : 0;
      alert(
        `${label === "queue" ? "Queue tick" : "Publish tick"} complete:\n${lines}\n  errors: ${errCount}`,
      );
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
