"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { Blog } from "@/lib/types";
import { Pencil, X, Plus, Trash2, AlertTriangle } from "lucide-react";
import SeoAuditPanel from "./SeoAuditPanel";
import BannerActions from "./BannerActions";
import BodyEditor from "@/components/BodyEditor";

type EditableFields = {
  title: string;
  slug: string;
  excerpt: string;
  content_md: string;
  meta_title: string;
  meta_desc: string;
  keywords: string;
  tags: string;
  faq: { q: string; a: string }[];
  primary_keyword: string;
  secondary_keywords: string;
  sources: string;
};

function toForm(blog: Blog): EditableFields {
  return {
    title: blog.title,
    slug: blog.slug,
    excerpt: blog.excerpt,
    content_md: blog.content_md,
    meta_title: blog.meta_title,
    meta_desc: blog.meta_desc,
    keywords: blog.keywords.join(", "),
    tags: blog.tags.join(", "),
    faq: blog.faq.map((f) => ({ ...f })),
    primary_keyword: blog.primary_keyword ?? "",
    secondary_keywords: blog.secondary_keywords.join(", "),
    sources: blog.sources.join("\n"),
  };
}

function lenBadge(value: string, [min, max]: [number, number]) {
  const n = value.length;
  const tone =
    n === 0 ? "neutral" : n < min || n > max ? "amber" : "green";
  return (
    <Badge tone={tone}>
      {n}/{max}
    </Badge>
  );
}

export default function BlogEditor({
  blog,
  siteUrl,
  decoratedPreviewHtml,
}: {
  blog: Blog;
  siteUrl: string;
  /** Server-rendered HTML with TOC + CTAs + related + author bio applied,
   *  matching what the Webflow publisher emits. Shown in the Preview tab
   *  so authors see what readers will see. */
  decoratedPreviewHtml: string;
}) {
  const router = useRouter();
  const editable = blog.status === "draft" || blog.status === "scheduled";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableFields>(() => toForm(blog));
  const [saving, setSaving] = useState(false);

  function update<K extends keyof EditableFields>(
    key: K,
    val: EditableFields[K],
  ) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function startEdit() {
    setForm(toForm(blog));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        slug: form.slug,
        excerpt: form.excerpt,
        content_md: form.content_md,
        meta_title: form.meta_title,
        meta_desc: form.meta_desc,
        keywords: form.keywords.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        tags: form.tags.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        faq: form.faq.filter((f) => f.q.trim() && f.a.trim()),
        primary_keyword: form.primary_keyword || null,
        secondary_keywords: form.secondary_keywords
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        sources: form.sources
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const res = await fetch(`/api/blogs/${blog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setEditing(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Content
          </div>
          {editable &&
            (editing ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                  <X size={14} /> Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={startEdit}>
                <Pencil size={14} /> Edit draft
              </Button>
            ))}
        </div>

        {!editing && blog.banner_url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={blog.banner_url}
              alt={blog.banner_alt ?? blog.title}
              className="w-full rounded-md mb-2 border border-zinc-200"
            />
            <BannerActions blogId={blog.id} status={blog.status} />
          </>
        )}

        {editing && (
          <div className="space-y-3 mb-4">
            <div>
              <Label required>Title</Label>
              <Input value={form.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => update("slug", e.target.value)} />
              <p className="text-[11px] text-zinc-500 mt-1">
                Lowercase letters, numbers, hyphens. Must be unique.
              </p>
            </div>
            <div>
              <Label>Excerpt (Post summary in Webflow)</Label>
              <Textarea
                rows={2}
                value={form.excerpt}
                onChange={(e) => update("excerpt", e.target.value)}
              />
            </div>
          </div>
        )}

        <BodyEditor
          value={editing ? form.content_md : blog.content_md}
          onChange={editing ? (v) => update("content_md", v) : undefined}
          editable={editing}
          metaTitle={editing ? form.meta_title : blog.meta_title}
          metaDesc={editing ? form.meta_desc : blog.meta_desc}
          slug={editing ? form.slug : blog.slug}
          siteUrl={siteUrl}
          publishedAt={blog.published_at}
          decoratedPreviewHtml={editing ? null : decoratedPreviewHtml}
        />
        {editing && (
          <p className="text-[11px] text-zinc-500 mt-2">
            The FAQ and Sources sections are added automatically when this
            post is published — no need to paste them into the body.
          </p>
        )}
      </Card>

      <div className="space-y-4">
        {/* ── LLM SEO audit ── */}
        <SeoAuditPanel blog={blog} />

        {/* ── Quality panel ── */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Quality check
            </div>
            {blog.quality_warnings.length > 0 && (
              <Badge tone="amber">
                {blog.quality_warnings.length} issue
                {blog.quality_warnings.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <dl className="text-sm space-y-2">
            <Metric
              label="Reading ease"
              value={blog.readability_score}
              format={(n) => n.toFixed(1)}
              target="50–75 (higher = easier)"
            />
            <Metric
              label="Main keyword usage"
              value={blog.keyword_density}
              format={(n) => `${(n * 100).toFixed(2)}%`}
              target="0.5%–2%"
            />
            <Metric
              label="Originality"
              value={blog.uniqueness_score}
              format={(n) => `${(100 - n * 100).toFixed(0)}% unique`}
              target="not too similar to past posts"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Word count</span>
              <span className="text-zinc-700">{blog.word_count ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Links to other posts</span>
              <span className="text-zinc-700">{blog.internal_links_resolved}</span>
            </div>
          </dl>
          {blog.quality_warnings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {blog.quality_warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle size={12} className="text-amber-600 mt-0.5 shrink-0" />
                  <span className="text-zinc-700">{w.message}</span>
                </div>
              ))}
            </div>
          )}
          {blog.claims_to_verify.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-zinc-600 hover:text-zinc-900">
                {blog.claims_to_verify.length} fact
                {blog.claims_to_verify.length === 1 ? "" : "s"} to double-check
              </summary>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-zinc-700">
                {blog.claims_to_verify.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <p className="text-[11px] text-zinc-500 mt-1">
                These sentences contain specific numbers, percentages, or
                years that the AI might have made up. Verify them before
                publishing.
              </p>
            </details>
          )}
        </Card>

        {/* ── SEO panel ── */}
        <Card>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">SEO</div>
          {editing ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label>SEO title</Label>
                  {lenBadge(form.meta_title, [50, 60])}
                </div>
                <Input
                  value={form.meta_title}
                  onChange={(e) => update("meta_title", e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>SEO description</Label>
                  {lenBadge(form.meta_desc, [150, 160])}
                </div>
                <Textarea
                  rows={3}
                  value={form.meta_desc}
                  onChange={(e) => update("meta_desc", e.target.value)}
                />
              </div>
              <div>
                <Label>Main keyword</Label>
                <Input
                  value={form.primary_keyword}
                  onChange={(e) => update("primary_keyword", e.target.value)}
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  The one phrase this post should rank for in Google. Used
                  to check how often it appears in the writing.
                </p>
              </div>
              <div>
                <Label>Related keywords (comma-separated)</Label>
                <Input
                  value={form.secondary_keywords}
                  onChange={(e) =>
                    update("secondary_keywords", e.target.value)
                  }
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Other phrases this post covers. Helps the AI link related
                  posts on your site together.
                </p>
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => update("tags", e.target.value)}
                />
              </div>
            </div>
          ) : (
            <dl className="text-sm space-y-2">
              <Row
                k="SEO title"
                v={blog.meta_title}
                badge={lenBadge(blog.meta_title, [50, 60])}
              />
              <Row
                k="SEO description"
                v={blog.meta_desc}
                badge={lenBadge(blog.meta_desc, [150, 160])}
              />
              <Row k="Main keyword" v={blog.primary_keyword || "—"} />
              <Row
                k="Related keywords"
                v={blog.secondary_keywords.join(", ") || "—"}
              />
              <Row k="Tags" v={blog.tags.join(", ") || "—"} />
            </dl>
          )}
        </Card>

        {/* ── Sources ── */}
        <Card>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Sources
          </div>
          {editing ? (
            <div>
              <Textarea
                rows={4}
                value={form.sources}
                onChange={(e) => update("sources", e.target.value)}
                className="font-mono text-xs"
                placeholder="https://example.com/article (one per line)"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                These show up as a &ldquo;Sources&rdquo; list at the bottom
                of the published post.
              </p>
            </div>
          ) : (
            <ul className="list-disc pl-5 text-xs text-zinc-700 space-y-1">
              {blog.sources.length === 0 && (
                <li className="list-none italic text-zinc-400">none</li>
              )}
              {blog.sources.map((s, i) => (
                <li key={i} className="break-all">
                  <a
                    href={s}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── FAQ ── */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">FAQ</div>
            {editing && (
              <button
                onClick={() => update("faq", [...form.faq, { q: "", a: "" }])}
                className="text-xs text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1"
              >
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          {editing ? (
            <div className="space-y-3">
              {form.faq.length === 0 && (
                <div className="text-xs text-zinc-400 italic">No FAQ items</div>
              )}
              {form.faq.map((f, i) => (
                <div
                  key={i}
                  className="border border-zinc-200 rounded-md p-2 space-y-1.5 relative"
                >
                  <button
                    onClick={() =>
                      update(
                        "faq",
                        form.faq.filter((_, idx) => idx !== i),
                      )
                    }
                    className="absolute top-1 right-1 p-1 text-zinc-400 hover:text-red-600"
                    aria-label="Remove FAQ"
                  >
                    <Trash2 size={12} />
                  </button>
                  <Input
                    placeholder="Question"
                    value={f.q}
                    onChange={(e) => {
                      const next = [...form.faq];
                      next[i] = { ...next[i], q: e.target.value };
                      update("faq", next);
                    }}
                  />
                  <Textarea
                    rows={2}
                    placeholder="Answer"
                    value={f.a}
                    onChange={(e) => {
                      const next = [...form.faq];
                      next[i] = { ...next[i], a: e.target.value };
                      update("faq", next);
                    }}
                  />
                </div>
              ))}
            </div>
          ) : blog.faq.length > 0 ? (
            <div className="space-y-3 text-sm">
              {blog.faq.map((f, i) => (
                <div key={i}>
                  <div className="font-medium">{f.q}</div>
                  <div className="text-zinc-600 mt-0.5">{f.a}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-zinc-400 italic">No FAQ items</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  badge,
}: {
  k: string;
  v: string;
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <dt className="text-xs text-zinc-500">{k}</dt>
        {badge}
      </div>
      <dd className="text-zinc-800 break-words">{v || "—"}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  format,
  target,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  target: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-500">
        {label} <span className="text-zinc-400">({target})</span>
      </span>
      <span className="text-zinc-700 font-mono">
        {value === null ? "—" : format(value)}
      </span>
    </div>
  );
}
