"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";

export default function RunNowButton() {
  const [busy, setBusy] = useState<null | "queue" | "publish">(null);
  const router = useRouter();

  async function ping(path: string, label: "queue" | "publish") {
    setBusy(label);
    try {
      const secret = window.prompt(
        "Cron secret (leave blank if not set):",
        "",
      );
      const url = secret ? `${path}?secret=${encodeURIComponent(secret)}` : path;
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");
      const lines = Object.entries(json)
        .filter(([k]) => k !== "errors")
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
        onClick={() => ping("/api/cron/publish", "publish")}
        disabled={busy !== null}
      >
        {busy === "publish" ? "Publishing…" : "Drain due drafts"}
      </Button>
      <Button
        onClick={() => ping("/api/cron/process", "queue")}
        disabled={busy !== null}
      >
        {busy === "queue" ? "Running…" : "Run queue now"}
      </Button>
    </div>
  );
}
