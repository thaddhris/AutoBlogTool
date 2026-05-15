"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";

export default function RunNowButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function run() {
    setBusy(true);
    try {
      const secret = window.prompt(
        "Cron secret (leave blank if not set):",
        "",
      );
      const url = secret
        ? `/api/cron/process?secret=${encodeURIComponent(secret)}`
        : `/api/cron/process`;
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Cron failed");
      alert(
        `Tick complete:\n  picked: ${json.picked}\n  generated: ${json.generated}\n  scheduled: ${json.scheduled}\n  published: ${json.published}\n  errors: ${json.errors?.length ?? 0}`,
      );
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button onClick={run} disabled={busy}>
      {busy ? "Running…" : "Run queue now"}
    </Button>
  );
}
