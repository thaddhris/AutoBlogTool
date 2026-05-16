"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Select } from "@/components/ui";
import ClientTime from "@/components/ClientTime";
import { LogEntry } from "@/lib/logs";

const REFRESH_MS = 5000;

function toneFor(kind: string): {
  bg: string;
  dot: string;
  label: string;
} {
  if (kind.endsWith(".fail") || kind.endsWith(".error")) {
    return { bg: "bg-red-50", dot: "bg-red-500", label: "error" };
  }
  if (kind.endsWith(".start")) {
    return { bg: "bg-blue-50", dot: "bg-blue-400", label: "start" };
  }
  if (kind.endsWith(".ok") || kind.endsWith(".done")) {
    return { bg: "bg-green-50", dot: "bg-green-500", label: "ok" };
  }
  if (kind.endsWith(".create")) {
    return { bg: "bg-violet-50", dot: "bg-violet-400", label: "create" };
  }
  return { bg: "bg-zinc-50", dot: "bg-zinc-400", label: "info" };
}

function formatPayload(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function LogsView({
  initialLogs,
  initialKinds,
}: {
  initialLogs: LogEntry[];
  initialKinds: string[];
}) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [kinds, setKinds] = useState<string[]>(initialKinds);
  const [kindFilter, setKindFilter] = useState<string>("");
  const [level, setLevel] = useState<"all" | "errors">("all");
  const [search, setSearch] = useState("");
  // Auto-refresh defaults OFF — opt in if you're actively watching the queue.
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // <input type="datetime-local"> values are LOCAL-time strings like
  // "2026-05-16T09:30". We store them as-is and convert to UTC ISO at fetch.
  const [fromLocal, setFromLocal] = useState<string>("");
  const [untilLocal, setUntilLocal] = useState<string>("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  function localToIso(local: string): string | undefined {
    if (!local) return undefined;
    const d = new Date(local);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (kindFilter) params.set("kind", kindFilter);
      if (level !== "all") params.set("level", level);
      const since = localToIso(fromLocal);
      const until = localToIso(untilLocal);
      if (since) params.set("since", since);
      if (until) params.set("until", until);
      params.set("limit", "500");
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setLogs(json.logs);
      setKinds(json.kinds);
    } finally {
      setBusy(false);
    }
  }, [kindFilter, level, fromLocal, untilLocal]);

  // Pad a number to 2 digits, used to build datetime-local strings.
  function pad(n: number): string {
    return n.toString().padStart(2, "0");
  }
  function toLocalInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function setLastMinutes(minutes: number) {
    const now = new Date();
    const from = new Date(now.getTime() - minutes * 60 * 1000);
    setFromLocal(toLocalInput(from));
    setUntilLocal("");
  }
  function clearTimeRange() {
    setFromLocal("");
    setUntilLocal("");
  }

  // Re-fetch when filters change.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh loop.
  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(refresh, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, refresh]);

  // Client-side substring filter on top of server-side filters.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.message.toLowerCase().includes(q) ||
        l.kind.toLowerCase().includes(q) ||
        (l.request_id ?? "").toLowerCase().includes(q) ||
        (l.blog_id ?? "").toLowerCase().includes(q),
    );
  }, [logs, search]);

  async function clearAll() {
    if (
      !confirm(
        "Delete ALL log entries? This can't be undone (the events themselves keep happening — just the history is wiped).",
      )
    )
      return;
    const res = await fetch(`/api/logs`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs text-zinc-500 mb-1">Search</div>
            <Input
              placeholder="message, kind, request id, blog id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[180px]">
            <div className="text-xs text-zinc-500 mb-1">Event kind</div>
            <Select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="">All kinds</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[140px]">
            <div className="text-xs text-zinc-500 mb-1">Level</div>
            <Select
              value={level}
              onChange={(e) =>
                setLevel(e.target.value as "all" | "errors")
              }
            >
              <option value="all">All</option>
              <option value="errors">Errors only</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 pb-1.5">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Auto-refresh (5s)
          </label>
          <Button
            variant="secondary"
            onClick={refresh}
            disabled={busy}
            type="button"
          >
            {busy ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="danger" onClick={clearAll} type="button">
            Clear all
          </Button>
        </div>

        {/* Time-range row — datetime-local inputs are in the user's local
            timezone; we convert to UTC ISO before sending to the API. */}
        <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-zinc-100">
          <div className="min-w-[200px]">
            <div className="text-xs text-zinc-500 mb-1">From</div>
            <Input
              type="datetime-local"
              value={fromLocal}
              onChange={(e) => setFromLocal(e.target.value)}
            />
          </div>
          <div className="min-w-[200px]">
            <div className="text-xs text-zinc-500 mb-1">Until</div>
            <Input
              type="datetime-local"
              value={untilLocal}
              onChange={(e) => setUntilLocal(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 pb-1.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLastMinutes(15)}
            >
              15m
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLastMinutes(60)}
            >
              1h
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLastMinutes(60 * 24)}
            >
              24h
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLastMinutes(60 * 24 * 7)}
            >
              7d
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={clearTimeRange}
              title="Clear time filter"
            >
              All time
            </Button>
          </div>
        </div>
      </Card>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No log entries match the current filters.
          </div>
        )}
        {filtered.map((l) => {
          const tone = toneFor(l.kind);
          const payload = expanded.has(l.id) ? formatPayload(l.payload) : null;
          return (
            <div
              key={l.id}
              className={`border-b border-zinc-100 ${tone.bg} hover:bg-opacity-80`}
            >
              <button
                onClick={() => toggle(l.id)}
                className="w-full text-left px-4 py-2 flex items-start gap-3"
              >
                <span
                  className={`shrink-0 inline-block w-2 h-2 rounded-full mt-1.5 ${tone.dot}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <ClientTime
                      at={l.created_at}
                      className="font-mono text-zinc-500"
                    />
                    <span className="font-mono font-medium text-zinc-700">
                      {l.kind}
                    </span>
                    {l.request_id && (
                      <Link
                        href={`/admin/requests/${l.request_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-700 hover:underline font-mono text-[11px]"
                      >
                        req:{l.request_id.slice(0, 8)}
                      </Link>
                    )}
                    {l.blog_id && (
                      <Link
                        href={`/admin/blogs/${l.blog_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-700 hover:underline font-mono text-[11px]"
                      >
                        blog:{l.blog_id.slice(0, 8)}
                      </Link>
                    )}
                  </div>
                  <div className="text-sm text-zinc-800 mt-0.5 break-words">
                    {l.message}
                  </div>
                </div>
              </button>
              {payload && (
                <pre className="text-[11px] font-mono bg-zinc-900 text-zinc-100 mx-4 mb-3 mt-1 p-3 rounded-md overflow-x-auto">
                  {payload}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-zinc-500">
        Showing {filtered.length} of {logs.length} fetched events. Server
        returns up to 200 newest. Click a row to expand its payload (if any).
      </div>
    </div>
  );
}
