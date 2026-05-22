"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import {
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import type { SerpInsights } from "@/lib/dataforseo";

/**
 * Read-only SERP analysis card for the request detail page. Shows what
 * DataForSEO returned for the request's primary keyword: top 10 organic,
 * featured snippet, AI Overview, People Also Ask, related searches.
 *
 * Has two action buttons:
 *  • "Analyze SERP" — only shown when no cached analysis exists. Fetches
 *    fresh and caches on the request.
 *  • "Refresh" — re-fetches when one is already cached (force=true). Both
 *    actions cost ~$0.002 on DataForSEO.
 */
export default function SerpAnalysisPanel({
  requestId,
  initialSerp,
  defaultKeyword,
  credsReady,
}: {
  requestId: string;
  initialSerp: SerpInsights | null;
  defaultKeyword: string | null;
  credsReady: boolean;
}) {
  const router = useRouter();
  const [serp, setSerp] = useState<SerpInsights | null>(initialSerp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(force: boolean) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/requests/${requestId}/serp-analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        },
      );
      const raw = await res.text();
      let json: { error?: string; serp?: SerpInsights } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* keep empty */
      }
      if (!res.ok) {
        throw new Error(
          json.error || `Request failed (HTTP ${res.status})`,
        );
      }
      if (json.serp) setSerp(json.serp);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // ── No analysis yet ────────────────────────────────────────────────────
  if (!serp) {
    return (
      <Card>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              SERP analysis
            </div>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-xl">
              Pull the live Google SERP for{" "}
              <strong>{defaultKeyword || "(no keyword set)"}</strong> and use
              the top 10 results + People Also Ask + featured snippet + AI
              Overview to shape this post&apos;s outline. Costs ~$0.002 per
              fetch on DataForSEO and is cached on the request.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => analyze(false)}
            disabled={busy || !credsReady || !defaultKeyword}
            className="shrink-0"
            title={
              !credsReady
                ? "Add DataForSEO credentials in Settings → SEO Intelligence"
                : !defaultKeyword
                  ? "Add a keyword to the request brief first"
                  : "Fetch the live SERP for this request"
            }
          >
            <Sparkles size={14} />{" "}
            {busy ? "Analyzing…" : "Analyze SERP"}
          </Button>
        </div>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 text-red-900 text-xs p-2 flex items-start gap-2 mt-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}
      </Card>
    );
  }

  // ── Analysis is cached — render the data ───────────────────────────────
  return (
    <Card>
      {/* Top-of-card AEO signal badges — the most actionable info from the
          SERP scan goes here so admins see at a glance what AI-search
          opportunities exist for this topic. */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {serp.ai_overview?.text && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-medium px-2 py-0.5">
            ✨ Google AI Overview present — Quick Answer block will target
            it
          </span>
        )}
        {serp.featured_snippet && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-900 text-[11px] font-medium px-2 py-0.5">
            ⭐ Featured snippet up for grabs
          </span>
        )}
        {serp.people_also_ask.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-900 text-[11px] font-medium px-2 py-0.5">
            ❓ {serp.people_also_ask.length} People Also Ask question
            {serp.people_also_ask.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500 flex items-center gap-1.5">
            <TrendingUp size={12} /> SERP analysis for{" "}
            <span className="font-mono text-zinc-700 normal-case">
              &ldquo;{serp.query}&rdquo;
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Fetched {new Date(serp.fetched_at).toLocaleString()} · location{" "}
            {serp.location_code} / {serp.language_code} · cost $
            {serp.cost.toFixed(4)}
          </div>
        </div>
        <Button
          variant="ghost"
          type="button"
          onClick={() => analyze(true)}
          disabled={busy}
          className="shrink-0 text-xs"
          title="Re-fetch the SERP (costs another DataForSEO call)"
        >
          <RefreshCw size={12} /> {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-900 text-xs p-2 flex items-start gap-2 mb-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {serp.featured_snippet && (
        <Section title="Featured snippet (rank 0)" tone="violet">
          <div className="text-sm font-medium text-zinc-800">
            {serp.featured_snippet.title || "(no title)"}
          </div>
          {serp.featured_snippet.url && (
            <div className="text-[11px] text-zinc-500 break-all mt-0.5">
              {serp.featured_snippet.url}
            </div>
          )}
          {serp.featured_snippet.description && (
            <p className="text-xs text-zinc-700 mt-1.5">
              {serp.featured_snippet.description}
            </p>
          )}
        </Section>
      )}

      {serp.ai_overview?.text && (
        <Section title="Google AI Overview" tone="amber">
          <p className="text-xs text-zinc-700 line-clamp-6">
            {serp.ai_overview.text}
          </p>
          {serp.ai_overview.references.length > 0 && (
            <div className="text-[11px] text-zinc-500 mt-2">
              Cited:{" "}
              {serp.ai_overview.references.slice(0, 4).map((r, i) => (
                <span key={i}>
                  {i > 0 ? " · " : ""}
                  {r.title || r.url}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {serp.organic.length > 0 && (
        <Section title={`Top ${serp.organic.length} organic competitors`}>
          <ol className="space-y-1.5 text-sm">
            {serp.organic.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono text-xs text-zinc-400 w-6 shrink-0 mt-0.5">
                  {r.rank_absolute ?? "?"}
                </span>
                <div className="min-w-0">
                  <div className="text-zinc-800 font-medium truncate">
                    {r.title || "(no title)"}
                  </div>
                  <div className="text-[11px] text-zinc-500 break-all">
                    {r.url}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {serp.people_also_ask.length > 0 && (
        <Section title="People Also Ask">
          <ul className="space-y-1 text-sm text-zinc-700 list-disc pl-5">
            {serp.people_also_ask.slice(0, 10).map((q, i) => (
              <li key={i}>{q.question}</li>
            ))}
          </ul>
        </Section>
      )}

      {serp.related_searches.length > 0 && (
        <Section title="Related searches">
          <div className="flex flex-wrap gap-1">
            {serp.related_searches.slice(0, 14).map((r, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700"
              >
                {r}
              </span>
            ))}
          </div>
        </Section>
      )}
    </Card>
  );
}

function Section({
  title,
  tone = "neutral",
  children,
}: {
  title: string;
  tone?: "neutral" | "violet" | "amber";
  children: React.ReactNode;
}) {
  const tones: Record<typeof tone, string> = {
    neutral: "border-zinc-100",
    violet: "border-violet-200 bg-violet-50/40",
    amber: "border-amber-200 bg-amber-50/40",
  } as const;
  return (
    <div className={`rounded-md border ${tones[tone]} p-3 mb-3`}>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}
