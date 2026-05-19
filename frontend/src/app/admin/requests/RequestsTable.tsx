"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Input, Select } from "@/components/ui";
import { RequestStatusBadge } from "@/components/StatusBadge";
import ClientTime from "@/components/ClientTime";
import { BlogRequest, RequestStatus } from "@/lib/types";
import { X } from "lucide-react";

const STATUSES: RequestStatus[] = [
  "pending",
  "processing",
  "draft",
  "scheduled",
  "published",
  "failed",
];

export default function RequestsTable({ initial }: { initial: BlogRequest[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>(
    "all",
  );
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Distinct tag pills from the loaded data — no extra API call needed.
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of initial) {
      for (const t of r.tags) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b))
      .map(([tag, count]) => ({ tag, count }));
  }, [initial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (activeTag && !r.tags.includes(activeTag)) return false;
      if (!q) return true;
      const haystack = [
        r.label,
        r.topic,
        r.keywords.join(" "),
        r.tags.join(" "),
        r.instructions,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [initial, search, statusFilter, activeTag]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="flex-1 min-w-[240px]">
            <div className="text-xs text-zinc-500 mb-1">Search</div>
            <Input
              placeholder="label, topic, keyword, tag, instructions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[160px]">
            <div className="text-xs text-zinc-500 mb-1">Status</div>
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | RequestStatus)
              }
            >
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          {(search || statusFilter !== "all" || activeTag) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setActiveTag(null);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-900 underline pb-1.5"
            >
              Clear filters
            </button>
          )}
        </div>

        {tagCounts.length > 0 && (
          <div>
            <div className="text-xs text-zinc-500 mb-1.5">Filter by tag</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  activeTag === null
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white border-zinc-300 text-zinc-700 hover:border-zinc-500"
                }`}
              >
                all
              </button>
              {tagCounts.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() =>
                    setActiveTag(activeTag === t.tag ? null : t.tag)
                  }
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    activeTag === t.tag
                      ? "bg-violet-700 text-white border-violet-700"
                      : "bg-white border-zinc-300 text-zinc-700 hover:border-violet-500"
                  }`}
                >
                  {t.tag} <span className="opacity-60">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-zinc-100 text-xs text-zinc-500 flex items-center justify-between">
          <span>
            Showing {filtered.length} of {initial.length} request
            {initial.length === 1 ? "" : "s"}
          </span>
          {(search || statusFilter !== "all" || activeTag) && (
            <span className="flex items-center gap-2">
              {search && (
                <span className="inline-flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded">
                  search: <code>{search}</code>
                  <button onClick={() => setSearch("")} aria-label="clear search">
                    <X size={10} />
                  </button>
                </span>
              )}
              {statusFilter !== "all" && (
                <span className="inline-flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded">
                  status: <code>{statusFilter}</code>
                  <button
                    onClick={() => setStatusFilter("all")}
                    aria-label="clear status"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {activeTag && (
                <span className="inline-flex items-center gap-1 bg-violet-100 text-violet-800 px-2 py-0.5 rounded">
                  tag: <code>{activeTag}</code>
                  <button
                    onClick={() => setActiveTag(null)}
                    aria-label="clear tag"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
            </span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium">Keywords</th>
              <th className="px-4 py-3 font-medium">Library tags</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-zinc-400"
                >
                  {initial.length === 0
                    ? "No requests yet."
                    : "No requests match the current filters."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="border-b border-zinc-100 hover:bg-zinc-50/50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/requests/${r.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {r.label}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-600 max-w-md">
                  <div className="line-clamp-1">{r.topic}</div>
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {r.keywords.slice(0, 3).join(", ")}
                  {r.keywords.length > 3 && ` +${r.keywords.length - 3}`}
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.tags.length === 0 ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTag(t);
                          }}
                          className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 hover:bg-violet-200"
                          title={`Filter by ${t}`}
                        >
                          {t}
                        </button>
                      ))}
                      {r.tags.length > 3 && (
                        <span className="text-zinc-500">
                          +{r.tags.length - 3}
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-700">{r.priority}</td>
                <td className="px-4 py-3">
                  <RequestStatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  <ClientTime at={r.created_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
