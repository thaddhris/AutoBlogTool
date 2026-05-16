"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { Blog } from "@/lib/types";

function formatRemaining(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "due now";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function BlogActions({ blog }: { blog: Blog }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [when, setWhen] = useState(() => {
    const seed = blog.scheduled_at
      ? new Date(blog.scheduled_at)
      : new Date(Date.now() + 60 * 60 * 1000);
    return seed.toISOString().slice(0, 16);
  });

  // Live-update the countdown text every 30s so the admin sees it tick down
  // without a page refresh.
  const [, force] = useState(0);
  useEffect(() => {
    if (!blog.scheduled_at) return;
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [blog.scheduled_at]);

  const inWindow = blog.status === "draft" && Boolean(blog.scheduled_at);
  const isPublished = blog.status === "published";

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

  async function applySchedule(at: Date | null) {
    const res = await fetch(`/api/blogs/${blog.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_at: at ? at.toISOString() : null }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    router.refresh();
  }

  async function setSchedule() {
    setBusy("schedule");
    try {
      await applySchedule(new Date(when));
      setShowSchedule(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function extendBy(hours: number) {
    setBusy("extend");
    try {
      const base = blog.scheduled_at ? new Date(blog.scheduled_at) : new Date();
      const next = new Date(base.getTime() + hours * 60 * 60 * 1000);
      await applySchedule(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function pause() {
    if (
      !confirm(
        "Pause the auto-publish timer? The blog will stay in draft until you publish it manually.",
      )
    )
      return;
    setBusy("pause");
    try {
      await applySchedule(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 min-w-0">
      {inWindow && blog.scheduled_at && (
        <div className="text-xs text-zinc-600 bg-violet-50 border border-violet-200 rounded-md px-2 py-1">
          Auto-publishes in{" "}
          <span className="font-medium text-violet-900">
            {formatRemaining(new Date(blog.scheduled_at))}
          </span>
          <div className="text-[11px] text-zinc-500">
            {new Date(blog.scheduled_at).toLocaleString()}
          </div>
        </div>
      )}

      {!isPublished && (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {inWindow && (
            <>
              <Button
                variant="ghost"
                onClick={() => extendBy(24)}
                disabled={busy !== null}
                title="Push the auto-publish time out by 24 hours"
              >
                +24h
              </Button>
              <Button
                variant="ghost"
                onClick={pause}
                disabled={busy !== null}
                title="Stop the auto-publish timer; keep in draft"
              >
                Pause timer
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            onClick={() => setShowSchedule((s) => !s)}
            disabled={busy !== null}
          >
            {inWindow ? "Reschedule" : "Schedule"}
          </Button>
          <Button onClick={publishNow} disabled={busy !== null}>
            {busy === "publish" ? "Publishing…" : "Publish now"}
          </Button>
        </div>
      )}

      {showSchedule && (
        <div className="flex items-center gap-2">
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <Button onClick={setSchedule} disabled={busy !== null}>
            {busy === "schedule" ? "Saving…" : "Set"}
          </Button>
        </div>
      )}
    </div>
  );
}
