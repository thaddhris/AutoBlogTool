"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import {
  Button,
  Card,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { Blog } from "@/lib/types";
import { Pencil, X, Plus, Trash2 } from "lucide-react";

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
  };
}

export default function BlogEditor({ blog }: { blog: Blog }) {
  const router = useRouter();
  // Edit is locked once a blog has gone live; allow on draft & scheduled.
  const editable = blog.status === "draft" || blog.status === "scheduled";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableFields>(() => toForm(blog));
  const [saving, setSaving] = useState(false);

  const rendered = useMemo(
    () => marked.parse(blog.content_md || "", { async: false }) as string,
    [blog.content_md],
  );

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
        keywords: form.keywords
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        tags: form.tags
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        faq: form.faq.filter((f) => f.q.trim() && f.a.trim()),
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
                <Button
                  variant="ghost"
                  onClick={cancelEdit}
                  disabled={saving}
                >
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blog.banner_url}
            alt={blog.banner_alt ?? blog.title}
            className="w-full rounded-md mb-4 border border-zinc-200"
          />
        )}

        {editing ? (
          <div className="space-y-3">
            <div>
              <Label required>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => update("slug", e.target.value)}
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Must be unique. Only lowercase letters, numbers and hyphens.
              </p>
            </div>
            <div>
              <Label>Excerpt</Label>
              <Textarea
                rows={2}
                value={form.excerpt}
                onChange={(e) => update("excerpt", e.target.value)}
              />
            </div>
            <div>
              <Label>Body (markdown)</Label>
              <Textarea
                rows={22}
                value={form.content_md}
                onChange={(e) => update("content_md", e.target.value)}
                className="font-mono text-xs leading-relaxed"
              />
            </div>
          </div>
        ) : (
          <article
            className="prose-blog"
            dangerouslySetInnerHTML={{ __html: rendered }}
          />
        )}
      </Card>

      <div className="space-y-4">
        <Card>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            SEO
          </div>
          {editing ? (
            <div className="space-y-3">
              <div>
                <Label>Meta title</Label>
                <Input
                  value={form.meta_title}
                  onChange={(e) => update("meta_title", e.target.value)}
                />
              </div>
              <div>
                <Label>Meta description</Label>
                <Textarea
                  rows={3}
                  value={form.meta_desc}
                  onChange={(e) => update("meta_desc", e.target.value)}
                />
              </div>
              <div>
                <Label>Keywords (comma separated)</Label>
                <Input
                  value={form.keywords}
                  onChange={(e) => update("keywords", e.target.value)}
                />
              </div>
              <div>
                <Label>Tags (comma separated)</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => update("tags", e.target.value)}
                />
              </div>
            </div>
          ) : (
            <dl className="text-sm space-y-2">
              <div>
                <dt className="text-xs text-zinc-500">Meta title</dt>
                <dd>{blog.meta_title || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Meta description</dt>
                <dd className="text-zinc-700">{blog.meta_desc || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Keywords</dt>
                <dd>{blog.keywords.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Tags</dt>
                <dd>{blog.tags.join(", ") || "—"}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              FAQ
            </div>
            {editing && (
              <button
                onClick={() =>
                  update("faq", [...form.faq, { q: "", a: "" }])
                }
                className="text-xs text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1"
              >
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          {editing ? (
            <div className="space-y-3">
              {form.faq.length === 0 && (
                <div className="text-xs text-zinc-400 italic">
                  No FAQ items
                </div>
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
