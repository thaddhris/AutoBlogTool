"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import TurndownService from "turndown";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Code,
  Link2,
  Image as ImageIcon,
  Undo2,
  Redo2,
} from "lucide-react";

// ─── md ↔ html helpers ──────────────────────────────────────────────────────
//
// Round-tripping is best-effort. The body markdown contains some platform
// tokens that aren't real markdown — `[[related: x]]`, `[[image: x]]`. Those
// flow through as plain text, which means an admin can still SEE them in
// Rich mode and edit/delete them. That's what we want.

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

// Preserve newlines around images so they render as block-level in markdown.
turndown.addRule("blockImage", {
  filter: "img",
  replacement: (_content, node) => {
    const el = node as HTMLImageElement;
    const alt = el.getAttribute("alt") || "";
    const src = el.getAttribute("src") || "";
    return `\n\n![${alt}](${src})\n\n`;
  },
});

function mdToHtml(md: string): string {
  return marked.parse(md || "", { async: false }) as string;
}

function htmlToMd(html: string): string {
  return turndown.turndown(html);
}

// ─── SERP preview helpers ───────────────────────────────────────────────────

interface SerpProps {
  siteUrl: string;
  slug: string;
  metaTitle: string;
  metaDesc: string;
  publishedAt: string | null;
}

function SerpPreview({
  siteUrl,
  slug,
  metaTitle,
  metaDesc,
  publishedAt,
}: SerpProps) {
  const base = (siteUrl || "https://example.com").replace(/\/$/, "");
  const url = `${base}/blog/${slug}`;
  // Google truncates SERP titles around 60 chars and descriptions around 160.
  const truncatedTitle =
    metaTitle.length > 60 ? metaTitle.slice(0, 57) + "…" : metaTitle;
  const truncatedDesc =
    metaDesc.length > 160 ? metaDesc.slice(0, 157) + "…" : metaDesc;
  const dateLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "preview";

  const titleWarn = metaTitle.length < 30 || metaTitle.length > 60;
  const descWarn = metaDesc.length < 120 || metaDesc.length > 165;

  return (
    <div className="max-w-2xl">
      <div className="mb-2 text-[11px] text-zinc-500 uppercase tracking-wide">
        How this post will look in Google
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg p-4 font-sans">
        <div className="flex items-center gap-1 text-xs text-zinc-600 mb-1">
          <span className="inline-block w-4 h-4 rounded-full bg-zinc-200" />
          <span className="font-medium text-zinc-700">
            {new URL(base).hostname || "example.com"}
          </span>
          <span className="text-zinc-400">›</span>
          <span>blog</span>
          <span className="text-zinc-400">›</span>
          <span className="truncate">{slug}</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xl text-blue-700 hover:underline font-medium leading-snug block"
        >
          {truncatedTitle || (
            <span className="text-zinc-400 italic">No title tag set</span>
          )}
        </a>
        <div className="text-sm text-zinc-600 mt-1">
          <span className="text-zinc-500">{dateLabel}</span>
          {" — "}
          {truncatedDesc || (
            <span className="text-zinc-400 italic">
              No meta description set
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div
          className={`p-2 rounded border ${
            titleWarn
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          <div className="font-medium">
            Title tag: {metaTitle.length} chars
          </div>
          <div>Target 30–60 (50–60 ideal)</div>
        </div>
        <div
          className={`p-2 rounded border ${
            descWarn
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          <div className="font-medium">
            Meta description: {metaDesc.length} chars
          </div>
          <div>Target 120–165 (150–160 ideal)</div>
        </div>
      </div>
    </div>
  );
}

// ─── Rich toolbar ───────────────────────────────────────────────────────────

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main editor ────────────────────────────────────────────────────────────

export interface BodyEditorProps {
  value: string;
  onChange?: (markdown: string) => void;
  editable: boolean;
  /** SEO-preview inputs. Required so the SERP tab can render. */
  metaTitle: string;
  metaDesc: string;
  slug: string;
  siteUrl: string;
  publishedAt: string | null;
  /** Server-rendered HTML with TOC + CTAs + related-articles + author bio
   *  applied, matching what the Webflow publisher emits. Used in the
   *  Preview tab so authors see exactly what readers will see. Pass
   *  `null` while the user is mid-edit (we can't decorate unsaved markdown
   *  without a round-trip), and we'll fall back to plain marked.parse. */
  decoratedPreviewHtml?: string | null;
}

type EditorTab = "rich" | "raw" | "preview" | "serp";

export default function BodyEditor({
  value,
  onChange,
  editable,
  metaTitle,
  metaDesc,
  slug,
  siteUrl,
  publishedAt,
  decoratedPreviewHtml,
}: BodyEditorProps) {
  const [tab, setTab] = useState<EditorTab>(editable ? "rich" : "preview");

  // ── TipTap (rich) editor ──
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: mdToHtml(value),
    editable,
    onUpdate: ({ editor }) => {
      if (!onChange) return;
      onChange(htmlToMd(editor.getHTML()));
    },
    // Avoid SSR mismatch — TipTap renders in browser only.
    immediatelyRender: false,
  });

  // TipTap's `editable` is captured at construction. When BlogEditor flips
  // the `editing` flag (Edit draft / Done editing), we need to push the new
  // value into the editor — otherwise the WYSIWYG stays read-only forever.
  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  // Keep TipTap in sync if the markdown prop changes from outside (e.g. user
  // edits in Raw mode and switches back). We compare round-tripped values to
  // avoid re-rendering on every keystroke.
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value === lastValueRef.current) return;
    lastValueRef.current = value;
    // Only reset content when the editor isn't focused (i.e. external change),
    // otherwise we'd nuke the user's cursor position.
    if (!editor.isFocused) {
      editor.commands.setContent(mdToHtml(value), { emitUpdate: false });
    }
  }, [value, editor]);

  // ── Raw mode: textarea drives form.content_md directly ──
  function onRawChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange?.(e.target.value);
  }

  // ── Image insert (Rich mode) ──
  function insertImage() {
    if (!editor) return;
    const url = window.prompt("Image URL (use /banners/… or a full https URL)");
    if (!url) return;
    const alt = window.prompt("Alt text", "") ?? "";
    editor.chain().focus().setImage({ src: url, alt }).run();
  }

  function insertLink() {
    if (!editor) return;
    const url = window.prompt("Link URL");
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  // ── Preview HTML for the Preview tab ──
  // Prefer the server-decorated HTML (TOC + CTAs + related + author bio)
  // when the editor isn't editing, so the Preview matches what readers
  // will see on the published site. While editing, fall back to a plain
  // marked.parse of the live markdown — we can't run the decoration
  // pipeline without round-tripping unsaved edits to the server.
  const previewHtml = useMemo(() => {
    if (decoratedPreviewHtml && !editable) return decoratedPreviewHtml;
    return mdToHtml(value);
  }, [value, decoratedPreviewHtml, editable]);

  // Tabs visible depend on editability.
  const tabs: { id: EditorTab; label: string; editOnly?: boolean }[] = [
    { id: "rich", label: "Visual", editOnly: true },
    { id: "raw", label: "Markdown", editOnly: true },
    { id: "preview", label: "Preview" },
    { id: "serp", label: "Google preview" },
  ];
  const visibleTabs = tabs.filter((t) => editable || !t.editOnly);

  // If we're in view mode but tab is rich/raw (e.g. transitioning), correct it.
  useEffect(() => {
    if (!editable && (tab === "rich" || tab === "raw")) setTab("preview");
    if (editable && tab === "preview") {
      // Don't force a switch — admin may want to stay in preview.
    }
  }, [editable, tab]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-200">
        <div className="flex">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {editable && tab === "rich" && editor && (
          <div className="flex items-center gap-0.5 pb-1.5">
            <ToolbarBtn
              title="Undo"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
            >
              <Undo2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Redo"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
            >
              <Redo2 size={14} />
            </ToolbarBtn>
            <span className="w-px h-4 bg-zinc-200 mx-1" />
            <ToolbarBtn
              title="Bold"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Italic"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="H2"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              <Heading2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="H3"
              active={editor.isActive("heading", { level: 3 })}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
            >
              <Heading3 size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Ordered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Blockquote"
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Inline code"
              active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <Code size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Insert link" onClick={insertLink}>
              <Link2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Insert image" onClick={insertImage}>
              <ImageIcon size={14} />
            </ToolbarBtn>
          </div>
        )}
      </div>

      {tab === "rich" && editor && (
        <div className="border border-zinc-200 rounded-md bg-white">
          <EditorContent
            editor={editor}
            className="prose-blog px-3 py-2 min-h-[400px] [&_*:focus]:outline-none"
          />
          <div className="px-3 py-1 text-[11px] text-zinc-400 border-t border-zinc-100">
            Edits here are saved as Markdown automatically. Anything that
            looks like
            <code className="mx-1">[[related: …]]</code> or
            <code className="mx-1">[[image: …]]</code> is a placeholder —
            we fill those in for you when the post is generated.
          </div>
        </div>
      )}

      {tab === "raw" && (
        <div>
          <textarea
            rows={22}
            value={value}
            onChange={onRawChange}
            className="w-full font-mono text-xs leading-relaxed rounded-md border border-zinc-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            placeholder="Markdown source…"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            FAQ and Sources sections are added automatically when the post is
            published — don&apos;t paste them in here.
          </p>
        </div>
      )}

      {tab === "preview" && (
        <article
          className="prose-blog border border-zinc-200 rounded-md bg-white px-4 py-3 min-h-[200px]"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      {tab === "serp" && (
        <SerpPreview
          siteUrl={siteUrl}
          slug={slug}
          metaTitle={metaTitle}
          metaDesc={metaDesc}
          publishedAt={publishedAt}
        />
      )}
    </div>
  );
}
