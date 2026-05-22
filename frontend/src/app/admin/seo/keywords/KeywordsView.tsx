"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Sparkles,
} from "lucide-react";
import type { KeywordIdea } from "@/lib/dataforseo";

interface LocationOpt {
  code: number;
  name: string;
}
interface LanguageOpt {
  code: string;
  name: string;
}

/**
 * Keyword-opportunities client view. Owns:
 *  • the search form (seeds + filters)
 *  • the results table
 *  • per-row "Create Blog Request" action
 *
 * No persistence beyond the conversion to a Blog Request — every query
 * round-trips fresh to DataForSEO so the volumes/KDs are current.
 */
export default function KeywordsView({
  credsReady,
  defaultLocationCode,
  defaultLanguageCode,
  defaultMinVolume,
  defaultMaxKd,
  locationOptions,
  languageOptions,
}: {
  credsReady: boolean;
  defaultLocationCode: number;
  defaultLanguageCode: string;
  defaultMinVolume: number;
  defaultMaxKd: number;
  locationOptions: LocationOpt[];
  languageOptions: LanguageOpt[];
}) {
  const [seeds, setSeeds] = useState("");
  const [locationCode, setLocationCode] = useState(defaultLocationCode);
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);
  const [minVolume, setMinVolume] = useState(String(defaultMinVolume));
  const [maxKd, setMaxKd] = useState(String(defaultMaxKd));
  const [limit, setLimit] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<KeywordIdea[]>([]);
  const [meta, setMeta] = useState<{
    cost: number;
    count: number;
    filtered_out: number;
  } | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  // Track which keywords already became requests this session — purely a UX
  // cue; the server-side request creation is idempotent.
  const [created, setCreated] = useState<Set<string>>(new Set());

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!credsReady) {
      setError(
        "DataForSEO credentials are not configured. Open Settings → SEO Intelligence and save your login + password first.",
      );
      return;
    }
    const seedList = seeds
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!seedList.length) {
      setError("Enter at least one seed keyword.");
      return;
    }
    setError(null);
    setBusy(true);
    setResults([]);
    setMeta(null);
    try {
      const res = await fetch("/api/seo/keyword-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seeds: seedList,
          location_code: locationCode,
          language_code: languageCode,
          limit: Math.min(Math.max(1, Number(limit) || 50), 1000),
          min_volume: Math.max(0, Number(minVolume) || 0),
          max_kd: Math.max(0, Math.min(100, Number(maxKd) || 100)),
        }),
      });
      const raw = await res.text();
      let json: {
        error?: string;
        ideas?: KeywordIdea[];
        cost?: number;
        count?: number;
        filtered_out?: number;
      } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* keep empty */
      }
      if (!res.ok) {
        throw new Error(
          json.error || `DataForSEO request failed (HTTP ${res.status}).`,
        );
      }
      setResults(json.ideas ?? []);
      setMeta({
        cost: json.cost ?? 0,
        count: json.count ?? 0,
        filtered_out: json.filtered_out ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createBlogRequest(idea: KeywordIdea) {
    setCreatingFor(idea.keyword);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: idea.keyword,
          topic: idea.keyword,
          keywords: idea.keyword,
          instructions: buildAutoInstructions(idea),
          priority: 0,
        }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error || "Failed to create blog request.");
      setCreated((prev) => new Set(prev).add(idea.keyword));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingFor(null);
    }
  }

  return (
    <div className="space-y-4">
      {!credsReady && (
        <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong>DataForSEO credentials missing.</strong> Go to{" "}
            <Link href="/admin/settings" className="underline">
              Settings → SEO Intelligence
            </Link>{" "}
            and save your login + password to enable keyword research.
          </div>
        </div>
      )}

      {/* ── search form ────────────────────────────────────────────────── */}
      <Card>
        <form onSubmit={search} className="space-y-3">
          <div>
            <Label required>Seed keywords</Label>
            <Input
              value={seeds}
              onChange={(e) => setSeeds(e.target.value)}
              placeholder="e.g. predictive maintenance, OEE, industrial AI"
              disabled={busy}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Comma- or newline-separated. We&apos;ll fetch related ideas for
              every seed in one call.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label>Country</Label>
              <Select
                value={String(locationCode)}
                onChange={(e) => setLocationCode(Number(e.target.value))}
                disabled={busy}
              >
                {locationOptions.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                disabled={busy}
              >
                {languageOptions.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Min volume / month</Label>
              <Input
                type="number"
                min={0}
                value={minVolume}
                onChange={(e) => setMinVolume(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <Label>Max difficulty (0–100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={maxKd}
                onChange={(e) => setMaxKd(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <Label>Result limit</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={busy || !credsReady}>
              <Search size={14} /> {busy ? "Searching…" : "Find keywords"}
            </Button>
            {meta && (
              <span className="text-[11px] text-zinc-500">
                <CheckCircle2
                  size={12}
                  className="inline mr-1 text-green-600"
                />
                {meta.count} ideas
                {meta.filtered_out > 0
                  ? ` (${meta.filtered_out} filtered out)`
                  : ""}{" "}
                · DataForSEO cost ${meta.cost.toFixed(4)}
              </span>
            )}
          </div>
        </form>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-900 text-sm p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {/* ── results table ──────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Keyword</th>
                <th className="px-4 py-3 font-medium text-right">Volume</th>
                <th className="px-4 py-3 font-medium text-right">Difficulty</th>
                <th className="px-4 py-3 font-medium text-right">CPC</th>
                <th className="px-4 py-3 font-medium">Intent</th>
                <th className="px-4 py-3 font-medium">Competition</th>
                <th className="px-4 py-3 font-medium w-44 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((k) => {
                const isCreated = created.has(k.keyword);
                return (
                  <tr
                    key={k.keyword}
                    className="border-b border-zinc-100 hover:bg-zinc-50/50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-800">
                      {k.keyword}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {k.search_volume?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <KdBadge value={k.keyword_difficulty} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-700">
                      {k.cpc !== null ? `$${k.cpc.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {k.search_intent ?? (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 text-xs">
                      {k.competition_level ?? "—"}
                      {k.competition !== null && (
                        <span className="text-zinc-400 ml-1">
                          ({(k.competition * 100).toFixed(0)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isCreated ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle2 size={12} /> Request created
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => createBlogRequest(k)}
                          disabled={creatingFor !== null}
                          className="text-xs"
                          title="Create a Blog Request for this keyword"
                        >
                          {creatingFor === k.keyword ? (
                            <>
                              <Sparkles size={12} /> Creating…
                            </>
                          ) : (
                            <>
                              <Plus size={12} /> Create Blog Request
                            </>
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {results.length === 0 && meta && !busy && !error && (
        <Card>
          <p className="text-sm text-zinc-500 text-center py-6">
            DataForSEO returned no keywords matching your filters. Try
            lowering the minimum volume or raising the max difficulty.
          </p>
        </Card>
      )}
    </div>
  );
}

function buildAutoInstructions(idea: KeywordIdea): string {
  const lines: string[] = [
    `Auto-created from a keyword opportunity. Target keyword: "${idea.keyword}".`,
  ];
  if (idea.search_volume !== null)
    lines.push(
      `Monthly search volume: ${idea.search_volume.toLocaleString()}.`,
    );
  if (idea.keyword_difficulty !== null)
    lines.push(
      `Keyword difficulty: ${idea.keyword_difficulty}/100 — write content that genuinely outperforms what's currently ranking.`,
    );
  if (idea.search_intent)
    lines.push(`Search intent: ${idea.search_intent}.`);
  lines.push(
    "Focus on answering the searcher's actual question concretely. Avoid fluff and brand-speak — readers reached this from a search query, not a homepage tour.",
  );
  return lines.join("\n");
}

function KdBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-zinc-400">—</span>;
  let tone = "bg-green-100 text-green-800";
  if (value > 70) tone = "bg-red-100 text-red-800";
  else if (value > 40) tone = "bg-amber-100 text-amber-800";
  return (
    <span
      className={`inline-block font-mono text-[11px] font-semibold rounded px-1.5 py-0.5 ${tone}`}
    >
      {Math.round(value)}
    </span>
  );
}
