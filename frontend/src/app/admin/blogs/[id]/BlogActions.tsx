"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { Blog } from "@/lib/types";

export default function BlogActions({ blog }: { blog: Blog }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });

  async function publishNow() {
    if (!confirm("Publish this blog now?")) return;
    setBusy("publish");
    try {
      const res = await fetch(`/api/blogs/${blog.id}/publish`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Publish failed");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function schedule() {
    setBusy("schedule");
    try {
      const res = await fetch(`/api/blogs/${blog.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: new Date(when).toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Schedule failed");
      setShowSchedule(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {blog.status !== "published" && (
          <>
            <Button
              variant="secondary"
              onClick={() => setShowSchedule((s) => !s)}
              disabled={busy !== null}
            >
              Schedule
            </Button>
            <Button onClick={publishNow} disabled={busy !== null}>
              {busy === "publish" ? "Publishing…" : "Publish now"}
            </Button>
          </>
        )}
      </div>
      {showSchedule && (
        <div className="flex items-center gap-2">
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <Button onClick={schedule} disabled={busy !== null}>
            {busy === "schedule" ? "Saving…" : "Set"}
          </Button>
        </div>
      )}
    </div>
  );
}
