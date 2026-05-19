"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarRange, X } from "lucide-react";

// <input type="datetime-local"> emits local-timezone strings like
// "2026-05-19T14:30". We convert to UTC ISO before stashing in the URL so the
// server-side filter parses it deterministically regardless of where the admin
// is sitting.
function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowMinus(minutes: number): string {
  const t = new Date(Date.now() - minutes * 60 * 1000);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

// Pretty-prints "Jun 12, 2:05 PM" — short enough for the collapsed pill.
function shortLabel(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Compact date-range URL filter. Collapsed by default into a single-row pill:
 * one chip group + a tiny "Custom range" disclosure. The custom inputs only
 * appear when expanded, so this takes ~40px of vertical space until you ask
 * for more.
 *
 *   basePath:  the route this page lives on, e.g. "/admin/requests"
 *   helpText:  one short sentence explaining which timestamp the filter
 *              targets — shown as a tooltip on the icon.
 */
export default function DateRangeFilter({
  basePath,
  initialFrom,
  initialTo,
  helpText,
}: {
  basePath: string;
  initialFrom: string | null;
  initialTo: string | null;
  helpText?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [fromLocal, setFromLocal] = useState(isoToLocal(initialFrom));
  const [untilLocal, setUntilLocal] = useState(isoToLocal(initialTo));
  // Auto-expand the inputs when we land with a custom range already applied,
  // so admins can see/edit it without an extra click.
  const [expanded, setExpanded] = useState(Boolean(initialFrom || initialTo));

  function push(from: string, until: string) {
    // Preserve unrelated query params (search, sort, status filter, etc).
    const params = new URLSearchParams(sp.toString());
    const fromIso = localToIso(from);
    const untilIso = localToIso(until);
    if (fromIso) params.set("from", fromIso);
    else params.delete("from");
    if (untilIso) params.set("to", untilIso);
    else params.delete("to");
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function setLastMinutes(minutes: number) {
    const fromStr = nowMinus(minutes);
    setFromLocal(fromStr);
    setUntilLocal("");
    push(fromStr, "");
  }

  function clearRange() {
    setFromLocal("");
    setUntilLocal("");
    setExpanded(false);
    push("", "");
  }

  const active = Boolean(fromLocal || untilLocal);

  // Identify "round" presets so the matching chip can render as active.
  const presetMinutes = (() => {
    if (untilLocal || !fromLocal) return null;
    const diffMs = Date.now() - new Date(fromLocal).getTime();
    const m = Math.round(diffMs / 60000);
    // 5-minute tolerance for clock skew.
    for (const candidate of [60, 60 * 24, 60 * 24 * 7, 60 * 24 * 30]) {
      if (Math.abs(m - candidate) < 5) return candidate;
    }
    return null;
  })();

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <CalendarRange
        size={14}
        className="text-zinc-400"
        aria-hidden="true"
      />
      <ChipGroup>
        <Chip
          active={presetMinutes === 60}
          onClick={() => setLastMinutes(60)}
        >
          1h
        </Chip>
        <Chip
          active={presetMinutes === 60 * 24}
          onClick={() => setLastMinutes(60 * 24)}
        >
          24h
        </Chip>
        <Chip
          active={presetMinutes === 60 * 24 * 7}
          onClick={() => setLastMinutes(60 * 24 * 7)}
        >
          7d
        </Chip>
        <Chip
          active={presetMinutes === 60 * 24 * 30}
          onClick={() => setLastMinutes(60 * 24 * 30)}
        >
          30d
        </Chip>
        <Chip active={!active} onClick={clearRange}>
          All
        </Chip>
      </ChipGroup>
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className={`px-2 py-1 rounded-md border transition-colors ${
          expanded || (active && presetMinutes === null)
            ? "border-zinc-900 text-zinc-900 bg-zinc-50"
            : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
        }`}
        title={helpText}
      >
        {active && presetMinutes === null
          ? `${shortLabel(fromLocal) || "…"} – ${shortLabel(untilLocal) || "now"}`
          : "Custom range"}
      </button>
      {active && (
        <button
          type="button"
          onClick={clearRange}
          className="inline-flex items-center gap-1 px-1.5 py-1 text-zinc-500 hover:text-zinc-800"
          title="Clear filter"
        >
          <X size={12} />
        </button>
      )}
      {expanded && (
        <div className="w-full flex flex-wrap items-end gap-2 mt-1 p-2 rounded-md border border-zinc-200 bg-zinc-50">
          <div>
            <div className="text-[11px] text-zinc-500 mb-0.5">From</div>
            <input
              type="datetime-local"
              value={fromLocal}
              onChange={(e) => setFromLocal(e.target.value)}
              onBlur={() => push(fromLocal, untilLocal)}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
            />
          </div>
          <div>
            <div className="text-[11px] text-zinc-500 mb-0.5">Until</div>
            <input
              type="datetime-local"
              value={untilLocal}
              onChange={(e) => setUntilLocal(e.target.value)}
              onBlur={() => push(fromLocal, untilLocal)}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
            />
          </div>
          {helpText && (
            <p className="text-[11px] text-zinc-500 ml-auto self-center max-w-md">
              {helpText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ChipGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex rounded-md border border-zinc-200 overflow-hidden bg-white">
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 border-r border-zinc-200 last:border-r-0 transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {children}
    </button>
  );
}

// Server-safe `parseBound` / `withinRange` helpers live in
// `@/lib/dateFilter` — they can't be exported from this client module.
