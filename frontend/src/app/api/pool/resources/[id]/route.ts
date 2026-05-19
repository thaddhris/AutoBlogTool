import { NextRequest } from "next/server";
import {
  deletePoolResource,
  getPoolResource,
  reindexPoolResource,
  renamePoolResource,
  replaceNoteContent,
  setTags,
} from "@/lib/pool";
import { chunkText } from "@/lib/ingest";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const r = getPoolResource(id);
  if (!r) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ resource: r });
}

/**
 * Editable fields:
 *   - tags: array | comma-separated string → setTags
 *   - name: string → rename
 *   - text: string → replaceNoteContent (note-type resources only; throws
 *           400 with a clear message for other types)
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  // Tags first — cheap, no transaction needed.
  if (body.tags !== undefined) {
    if (Array.isArray(body.tags)) {
      setTags(id, body.tags.map(String));
    } else if (typeof body.tags === "string") {
      setTags(
        id,
        body.tags
          .split(/[,\n]/)
          .map((s: string) => s.trim())
          .filter(Boolean),
      );
    }
  }

  if (typeof body.name === "string" && body.name.trim()) {
    renamePoolResource(id, body.name.trim());
  }

  if (typeof body.text === "string") {
    try {
      replaceNoteContent(id, body.text, chunkText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: msg }, { status: 400 });
    }
  }

  // Re-chunk from the stored extracted text. Useful after extraction logic
  // improves (e.g. stripping "-- N of M --" markers from older PDF imports).
  // POST /api/pool/resources/<id>?reindex=1 OR PATCH with { reindex: true }.
  if (body.reindex === true) {
    try {
      reindexPoolResource(id, chunkText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: msg }, { status: 400 });
    }
  }

  const r = getPoolResource(id);
  if (!r) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ resource: r });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ok = deletePoolResource(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
