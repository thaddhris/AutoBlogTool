import { NextRequest } from "next/server";
import { getBlog, updateBlog, BlogPatch } from "@/lib/blogs";
import { FocusIntent } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const blog = getBlog(id);
  if (!blog) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ blog });
}

const SCALAR_KEYS = [
  "title",
  "slug",
  "excerpt",
  "content_md",
  "meta_title",
  "meta_desc",
  "banner_url",
  "banner_alt",
  "status",
  "scheduled_at",
  "h1",
  "primary_keyword",
  "tldr",
  "author",
  "reviewed_by",
] as const;

const ARRAY_KEYS = [
  "keywords",
  "tags",
  "secondary_keywords",
  "sources",
  "claims_to_verify",
] as const;

const FOCUS_INTENTS: FocusIntent[] = [
  "informational",
  "commercial",
  "transactional",
];

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: BlogPatch = {};

  for (const k of SCALAR_KEYS) {
    if (body[k] !== undefined)
      (patch as Record<string, unknown>)[k] = body[k];
  }

  for (const k of ARRAY_KEYS) {
    if (body[k] === undefined) continue;
    if (Array.isArray(body[k])) {
      (patch as Record<string, unknown>)[k] = (body[k] as unknown[]).map(
        String,
      );
    } else if (typeof body[k] === "string") {
      (patch as Record<string, unknown>)[k] = (body[k] as string)
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  if (body.faq !== undefined) patch.faq = body.faq as { q: string; a: string }[];

  if (body.focus_intent !== undefined) {
    const v = body.focus_intent;
    if (v === null) patch.focus_intent = null;
    else if (typeof v === "string" && (FOCUS_INTENTS as string[]).includes(v))
      patch.focus_intent = v as FocusIntent;
  }

  const updated = updateBlog(id, patch);
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ blog: updated });
}
