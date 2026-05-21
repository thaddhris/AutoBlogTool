"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { ContentField, Settings, WebflowMapping } from "@/lib/types";
import {
  CONTENT_FIELD_LABELS,
  CONTENT_FIELDS,
} from "@/lib/webflowSchema";

/**
 * Webflow field-mapping panel.
 *
 * Manages mappings for ANY number of collections — not just the global
 * `webflow_collection_id` from Settings. Admins can:
 *   - Switch between saved mappings via a dropdown of collection ids.
 *   - Refresh the active mapping (re-fetches the schema, preserves any
 *     manual enabled/contentField overrides on fields that still exist).
 *   - Add a new collection: paste an id, click Fetch, it gets saved and
 *     becomes the active view. This is the path admins use when a blog
 *     request specifies a per-request collection override and they need a
 *     mapping for that collection too.
 *   - Delete a mapping when a collection is decommissioned.
 *
 * `collectionId` (from props) is just the GLOBAL default from Settings —
 * pre-populated as the initial active collection if a mapping exists for
 * it. It's NOT the only collection this panel can edit.
 */
export default function WebflowMappingPanel({
  collectionId,
  hasToken,
  mappings,
  onMappingChange,
}: {
  collectionId: string;
  hasToken: boolean;
  mappings: Record<string, WebflowMapping>;
  onMappingChange: (next: Settings["webflow_field_mappings"]) => void;
}) {
  const savedIds = Object.keys(mappings);

  // The currently-displayed mapping. Defaults to the global collection id
  // when a mapping for it exists, otherwise the first saved id, otherwise
  // empty (= no mappings yet).
  const [activeId, setActiveId] = useState<string>(() => {
    const g = collectionId.trim();
    if (g && mappings[g]) return g;
    return savedIds[0] ?? "";
  });

  // Keep `activeId` valid as `mappings` or the global default changes.
  useEffect(() => {
    if (activeId && mappings[activeId]) return;
    const g = collectionId.trim();
    if (g && mappings[g]) setActiveId(g);
    else setActiveId(Object.keys(mappings)[0] ?? "");
  }, [activeId, mappings, collectionId]);

  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState("");
  const [busy, setBusy] = useState<null | "fetch" | "refresh">(null);
  const [error, setError] = useState<string | null>(null);

  const current = activeId ? mappings[activeId] : undefined;
  const isDefault = activeId === collectionId.trim();

  async function fetchForId(id: string, mode: "fetch" | "refresh") {
    const cleanId = id.trim();
    if (!cleanId) {
      setError("Paste a Webflow collection ID first.");
      return;
    }
    if (!hasToken) {
      setError("Save your Webflow token above first.");
      return;
    }
    setError(null);
    setBusy(mode);
    try {
      const res = await fetch("/api/webflow/fetch-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: cleanId }),
      });
      const raw = await res.text();
      let json: { error?: string; mapping?: WebflowMapping } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* fall through */
      }
      if (!res.ok) {
        throw new Error(
          json.error || `Webflow API returned HTTP ${res.status}.`,
        );
      }
      if (!json.mapping) {
        throw new Error("Webflow API returned no mapping data.");
      }
      onMappingChange({ ...mappings, [cleanId]: json.mapping });
      setActiveId(cleanId);
      if (mode === "fetch") {
        setShowAdd(false);
        setNewId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function updateEntry(
    slug: string,
    patch: Partial<{ enabled: boolean; contentField: ContentField | null }>,
  ) {
    if (!activeId || !current) return;
    const next: WebflowMapping = {
      ...current,
      fields: {
        ...current.fields,
        [slug]: {
          ...current.fields[slug],
          ...patch,
        },
      },
    };
    onMappingChange({ ...mappings, [activeId]: next });
  }

  function deleteActive() {
    if (!activeId) return;
    if (
      !confirm(
        `Remove the saved mapping for collection "${activeId}"?\n\nThis only deletes our local mapping config — your Webflow collection itself is untouched. You can re-fetch any time.`,
      )
    )
      return;
    const next = { ...mappings };
    delete next[activeId];
    onMappingChange(next);
    setActiveId(Object.keys(next)[0] ?? "");
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Detected Webflow fields
          </div>
          <p className="text-[11px] text-zinc-500 mt-1 max-w-xl">
            Save a field mapping for any number of Webflow collections — one
            for your main blog collection, plus any others you want
            individual posts to target via the per-request collection
            override.
          </p>
        </div>
        <Button
          variant="secondary"
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          disabled={busy !== null}
          className="shrink-0 text-xs"
          title="Add a mapping for a different Webflow collection"
        >
          <Plus size={12} /> Add another collection
        </Button>
      </div>

      {/* ── Add-new-collection form ───────────────────────────────────── */}
      {showAdd && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 mb-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">
            Add another collection
          </div>
          <p className="text-[11px] text-zinc-500 mb-2">
            Paste the Webflow collection ID you want to add a mapping for.
            We&apos;ll fetch its fields and pre-fill smart defaults — same
            flow as the main collection above.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="e.g. 6a08052216d26e9419b7119c"
                autoFocus
              />
            </div>
            <Button
              type="button"
              onClick={() => fetchForId(newId, "fetch")}
              disabled={busy !== null || !newId.trim() || !hasToken}
              className="text-xs shrink-0"
            >
              <RefreshCw size={12} />{" "}
              {busy === "fetch" ? "Fetching…" : "Fetch fields"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setNewId("");
                setError(null);
              }}
              className="p-1 text-zinc-500 hover:text-zinc-800"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-800 text-xs p-2.5 mb-3 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {savedIds.length === 0 && !error && (
        <div className="text-[11px] text-zinc-500 italic py-2">
          No saved field mappings yet. Click <strong>Add another
          collection</strong> above (or paste a collection ID into the
          credentials block at the top of this tab and click Fetch from
          there) — once you do, the legacy field-name inputs below stop
          being used.
        </div>
      )}

      {/* ── Active-mapping switcher ────────────────────────────────────── */}
      {savedIds.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 mb-3 pt-2 border-t border-zinc-100">
          <div className="min-w-[260px]">
            <div className="text-[11px] text-zinc-500 mb-1">
              Showing mapping for
            </div>
            <Select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
            >
              {savedIds.map((id) => {
                const m = mappings[id];
                const tag = id === collectionId.trim() ? " (default)" : "";
                return (
                  <option key={id} value={id}>
                    {m.collection_display_name || id}
                    {tag}
                  </option>
                );
              })}
            </Select>
          </div>
          {current && (
            <>
              <Button
                variant="ghost"
                type="button"
                onClick={() => fetchForId(activeId, "refresh")}
                disabled={busy !== null}
                className="text-xs"
                title="Re-fetch this collection's schema from Webflow"
              >
                <RefreshCw size={12} />{" "}
                {busy === "refresh" ? "Refreshing…" : "Refresh"}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={deleteActive}
                disabled={busy !== null}
                className="text-xs text-red-700 hover:bg-red-50"
                title="Remove our saved mapping for this collection (Webflow untouched)"
              >
                <Trash2 size={12} /> Remove mapping
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── The actual mapping table ───────────────────────────────────── */}
      {current && (
        <>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-3 flex-wrap">
            <CheckCircle2 size={12} className="text-green-600" />
            <span>
              <strong>{Object.keys(current.fields).length}</strong> fields in{" "}
              <strong>{current.collection_display_name}</strong>.
            </span>
            <span className="font-mono text-zinc-400 break-all">
              · id: {activeId}
            </span>
            <span className="text-zinc-400">
              · Last fetched{" "}
              {new Date(current.fetched_at).toLocaleString()}.
            </span>
            {isDefault && (
              <span className="text-violet-700">
                · Used for posts with no per-request override
              </span>
            )}
          </div>

          <div className="rounded-md border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium w-12">Fill</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Webflow field
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Filled by
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.values(current.fields).map((f) => (
                  <tr
                    key={f.slug}
                    className="border-t border-zinc-100 align-top"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={f.enabled}
                        disabled={f.required}
                        onChange={(e) =>
                          updateEntry(f.slug, { enabled: e.target.checked })
                        }
                        className="rounded border-zinc-300 mt-1"
                        title={
                          f.required
                            ? "Webflow requires this field — cannot be disabled"
                            : ""
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-800">
                        {f.displayName}
                        {f.required && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-red-600 font-medium">
                            required
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {f.slug} · {f.type}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={f.contentField ?? ""}
                        onChange={(e) =>
                          updateEntry(f.slug, {
                            contentField:
                              e.target.value === ""
                                ? null
                                : (e.target.value as ContentField),
                          })
                        }
                        disabled={!f.enabled}
                      >
                        <option value="">— Leave blank —</option>
                        {CONTENT_FIELDS.map((cf) => (
                          <option key={cf} value={cf}>
                            {CONTENT_FIELD_LABELS[cf]}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-zinc-500 mt-3">
            Don&apos;t forget to click <strong>Save settings</strong> below.
            Changes here only take effect after saving.
          </p>
        </>
      )}
    </Card>
  );
}
