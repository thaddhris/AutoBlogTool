"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Sparkles,
  History,
  Trash2,
  RefreshCw,
  X,
} from "lucide-react";
import type { KeywordIdea } from "@/lib/dataforseo";
import type { KeywordSessionSummary } from "@/lib/keywordSessions";

interface LocationOpt {
  code: number;
  name: string;
}
interface LanguageOpt {
  code: string;
  name: string;
}

interface CurrentSession {
  id: string;
  seeds: string[];
  location_code: number;
  language_code: string;
  min_volume: number;
  max_kd: number;
  ideas: KeywordIdea[];
  cost_usd: number;
  notes: string;
  created_at: string;
  /** Whether this session's results came from a fresh API call (true) or
   *  were loaded from storage (false). Tracked so the cost figure can be
   *  labelled honestly. */
  fresh: boolean;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Keyword opportunities client view.
 *
 * Owns:
 *  • the search form + filters
 *  • the currently-displayed result set (either a fresh search OR a
 *    reloaded past session — same UI, just a different source)
 *  • the saved-sessions strip below the form: click to reload, refresh
 *    button to re-run the same search (creating a new session), delete
 *    button to remove a session
 *  • per-row "Create Blog Request" action with an "already created"
 *    indicator for keywords that match an existing request or blog
 *  • inline notes editing on the active session
 */
export default function KeywordsView({
  credsReady,
  defaultLocationCode,
  defaultLanguageCode,
  defaultMinVolume,
  defaultMaxKd,
  locationOptions,
  languageOptions,
  initialSessions,
  knownKeywords,
}: {
  credsReady: boolean;
  defaultLocationCode: number;
  defaultLanguageCode: string;
  defaultMinVolume: number;
  defaultMaxKd: number;
  locationOptions: LocationOpt[];
  languageOptions: LanguageOpt[];
  initialSessions: KeywordSessionSummary[];
  knownKeywords: string[];
}) {
  // ── Search form state ──────────────────────────────────────────────────
  const [seeds, setSeeds] = useState("");
  const [locationCode, setLocationCode] = useState(defaultLocationCode);
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);
  const [minVolume, setMinVolume] = useState(String(defaultMinVolume));
  const [maxKd, setMaxKd] = useState(String(defaultMaxKd));
  const [limit, setLimit] = useState("50");

  // ── Workflow state ─────────────────────────────────────────────────────
  const [busy, setBusy] = useState<null | "search" | "delete" | "notes">(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<CurrentSession | null>(null);
  const [sessions, setSessions] =
    useState<KeywordSessionSummary[]>(initialSessions);
  const [notesDraft, setNotesDraft] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  // Keywords the admin converted to requests since the page loaded — adds
  // to the server-rendered `knownKeywords` set so the badge updates
  // immediately without a refresh.
  const [createdThisSession, setCreatedThisSession] = useState<Set<string>>(
    new Set(),
  );

  // ── Memoised "is this keyword already a request?" lookup ───────────────
  const knownSet = useMemo(() => {
    const s = new Set(knownKeywords.map(normalize));
    for (const k of createdThisSession) s.add(normalize(k));
    return s;
  }, [knownKeywords, createdThisSession]);

  // ── Search submit ──────────────────────────────────────────────────────
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
    setBusy("search");
    setActive(null);
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
        session_id?: string;
        error?: string;
        ideas?: KeywordIdea[];
        cost?: number;
      } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* leave empty */
      }
      if (!res.ok) {
        throw new Error(
          json.error || `DataForSEO request failed (HTTP ${res.status}).`,
        );
      }
      const ideas = json.ideas ?? [];
      setActive({
        id: json.session_id ?? "",
        seeds: seedList,
        location_code: locationCode,
        language_code: languageCode,
        min_volume: Math.max(0, Number(minVolume) || 0),
        max_kd: Math.max(0, Math.min(100, Number(maxKd) || 100)),
        ideas,
        cost_usd: json.cost ?? 0,
        notes: "",
        created_at: new Date().toISOString(),
        fresh: true,
      });
      setNotesDraft("");
      setEditingNotes(false);
      // Refresh the sessions strip from the server so the brand-new one
      // appears at the top.
      await refreshSessionsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function refreshSessionsList() {
    try {
      const res = await fetch("/api/seo/sessions?limit=30", {
        cache: "no-store",
      });
      const json = await res.json();
      if (Array.isArray(json.sessions)) setSessions(json.sessions);
    } catch {
      /* silent — UI keeps its current list */
    }
  }

  // ── Load a saved session into the active panel (no API spend) ──────────
  async function loadSession(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/seo/sessions/${id}`, {
        cache: "no-store",
      });
      const raw = await res.text();
      let json: {
        session?: {
          id: string;
          seeds: string[];
          location_code: number;
          language_code: string;
          min_volume: number;
          max_kd: number;
          limit_requested: number;
          ideas: KeywordIdea[];
          cost_usd: number;
          notes: string;
          created_at: string;
        };
        error?: string;
      } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* leave empty */
      }
      if (!res.ok || !json.session) {
        throw new Error(json.error || "Could not load session.");
      }
      const s = json.session;
      setActive({
        id: s.id,
        seeds: s.seeds,
        location_code: s.location_code,
        language_code: s.language_code,
        min_volume: s.min_volume,
        max_kd: s.max_kd,
        ideas: s.ideas,
        cost_usd: s.cost_usd,
        notes: s.notes,
        created_at: s.created_at,
        fresh: false,
      });
      // Mirror the filter form so a follow-up search uses the same params.
      setSeeds(s.seeds.join("\n"));
      setLocationCode(s.location_code);
      setLanguageCode(s.language_code);
      setMinVolume(String(s.min_volume));
      setMaxKd(String(s.max_kd));
      setLimit(String(s.limit_requested));
      setNotesDraft(s.notes ?? "");
      setEditingNotes(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Delete a saved session ─────────────────────────────────────────────
  async function deleteSession(id: string) {
    if (
      !confirm(
        "Delete this saved keyword research session? The Blog Requests you already created from it stay; only the saved keyword list goes.",
      )
    )
      return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/seo/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (active?.id === id) setActive(null);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  // ── Save notes ─────────────────────────────────────────────────────────
  async function saveNotes() {
    if (!active) return;
    setBusy("notes");
    try {
      const res = await fetch(`/api/seo/sessions/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActive({ ...active, notes: notesDraft });
      // Reflect on the sessions strip too
      setSessions((prev) =>
        prev.map((s) => (s.id === active.id ? { ...s, notes: notesDraft } : s)),
      );
      setEditingNotes(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  // ── Create a Blog Request from a keyword row ───────────────────────────
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
      if (!res.ok) {
        throw new Error(json?.error || "Failed to create blog request.");
      }
      setCreatedThisSession((prev) => {
        const next = new Set(prev);
        next.add(idea.keyword);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingFor(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
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
              disabled={busy !== null}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Comma- or newline-separated. We&apos;ll fetch related ideas for
              every seed in one call. Every search auto-saves so you can
              come back without re-billing DataForSEO.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label>Country</Label>
              <Select
                value={String(locationCode)}
                onChange={(e) => setLocationCode(Number(e.target.value))}
                disabled={busy !== null}
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
                disabled={busy !== null}
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
                disabled={busy !== null}
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
                disabled={busy !== null}
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
                disabled={busy !== null}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={busy !== null || !credsReady}>
              <Search size={14} />{" "}
              {busy === "search" ? "Searching…" : "Find keywords"}
            </Button>
            {active && (
              <span className="text-[11px] text-zinc-500">
                <CheckCircle2
                  size={12}
                  className="inline mr-1 text-green-600"
                />
                {active.ideas.length} ideas ·{" "}
                {active.fresh
                  ? `cost $${active.cost_usd.toFixed(4)}`
                  : `loaded from saved session ($${active.cost_usd.toFixed(4)} originally)`}
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

      {/* ── saved sessions strip ────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <History size={14} className="text-zinc-500" />
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Saved sessions
            </div>
            <span className="text-[11px] text-zinc-400">
              · {sessions.length} stored · click to reload without re-billing
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => loadSession(s.id)}
                className={`text-left rounded-md border px-3 py-2 transition-colors group relative ${
                  active?.id === s.id
                    ? "border-zinc-900 bg-zinc-50"
                    : "border-zinc-200 hover:border-zinc-400 bg-white"
                }`}
              >
                <div className="text-sm font-medium text-zinc-800 truncate pr-7">
                  {s.seeds.slice(0, 3).join(", ")}
                  {s.seeds.length > 3 ? `, +${s.seeds.length - 3}` : ""}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {s.ideas_count} ideas · ${s.cost_usd.toFixed(4)} ·{" "}
                  {new Date(s.created_at).toLocaleString()}
                </div>
                {s.notes && (
                  <div className="text-[11px] text-zinc-600 italic mt-1 line-clamp-2">
                    {s.notes}
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  disabled={busy === "delete"}
                  className="absolute top-1.5 right-1.5 p-1 text-zinc-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                  title="Delete this saved session"
                  aria-label="Delete session"
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── results table for the active session ───────────────────────── */}
      {active && active.ideas.length > 0 && (
        <Card>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                {active.fresh
                  ? "Fresh results"
                  : `Saved session · ${new Date(active.created_at).toLocaleString()}`}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Seeds: <strong>{active.seeds.join(", ")}</strong> · country{" "}
                {active.location_code} / {active.language_code} ·{" "}
                {active.ideas.length} ideas
              </div>
            </div>
            {!active.fresh && (
              <Button
                variant="ghost"
                type="button"
                onClick={search}
                disabled={busy !== null}
                className="text-xs shrink-0"
                title="Re-run this search with the same params (creates a new saved session)"
              >
                <RefreshCw size={12} /> Re-run
              </Button>
            )}
          </div>

          {/* notes for the active session */}
          {active.id && (
            <div className="mb-3 rounded-md border border-zinc-200 bg-zinc-50/60 p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">
                Notes
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="What did you learn from this search? Which keywords look promising?"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={saveNotes}
                      disabled={busy === "notes"}
                      className="text-xs"
                    >
                      {busy === "notes" ? "Saving…" : "Save notes"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setNotesDraft(active.notes);
                        setEditingNotes(false);
                      }}
                      className="text-[11px] text-zinc-500 hover:text-zinc-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-zinc-700 whitespace-pre-wrap flex-1">
                    {active.notes || (
                      <span className="text-zinc-400 italic">
                        (no notes yet — click Edit to add one)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNotesDraft(active.notes);
                      setEditingNotes(true);
                    }}
                    className="text-[11px] text-violet-700 hover:text-violet-900 underline shrink-0"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Keyword</th>
                  <th className="px-4 py-3 font-medium text-right">Volume</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Difficulty
                  </th>
                  <th className="px-4 py-3 font-medium text-right">CPC</th>
                  <th className="px-4 py-3 font-medium">Intent</th>
                  <th className="px-4 py-3 font-medium w-44 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.ideas.map((k) => {
                  const alreadyKnown = knownSet.has(normalize(k.keyword));
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
                      <td className="px-4 py-3 text-right">
                        {alreadyKnown ? (
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                            <CheckCircle2 size={12} className="text-green-600" />
                            Already created
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
        </Card>
      )}

      {active && active.ideas.length === 0 && !busy && !error && (
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              DataForSEO returned no keywords matching your filters. Try
              lowering the minimum volume or raising the max difficulty.
            </p>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="text-zinc-500 hover:text-zinc-800"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
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
