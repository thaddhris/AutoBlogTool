import { NextRequest } from "next/server";
import { listPoolResources } from "@/lib/pool";
import { ingestPoolResource } from "@/lib/ingest";
import { ResourceType } from "@/lib/types";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const tagsParam = q.get("tags");
  const tags = tagsParam
    ? tagsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  return Response.json({ resources: listPoolResources({ tags }) });
}

function detectType(filename: string): ResourceType {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  return "doc";
}

/**
 * Two paths:
 *   - multipart/form-data with "file" + optional "tags" (comma-separated) → file upload
 *   - application/json { type: "url"|"note", source/text, name, tags[] } → URL or note
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const tagsRaw = String(form.get("tags") ?? "");
    const tags = tagsRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!file || !(file instanceof File)) {
      return Response.json({ error: "file is required" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const id = await ingestPoolResource({
        name: file.name,
        type: detectType(file.name),
        source: file.name,
        buffer,
        tags,
      });
      return Response.json({ ok: true, resource_id: id }, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: msg }, { status: 400 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const type = body.type as ResourceType;
  const tags = Array.isArray(body.tags)
    ? body.tags.map(String)
    : typeof body.tags === "string"
      ? body.tags
          .split(/[,\n]/)
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];

  if (type === "url") {
    const source = String(body.source ?? "").trim();
    if (!source)
      return Response.json({ error: "source URL required" }, { status: 400 });
    try {
      const id = await ingestPoolResource({
        name: body.name ? String(body.name) : source,
        type: "url",
        source,
        tags,
      });
      return Response.json({ ok: true, resource_id: id }, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: msg }, { status: 400 });
    }
  }
  if (type === "note") {
    const text = String(body.text ?? "").trim();
    if (!text)
      return Response.json({ error: "text required" }, { status: 400 });
    try {
      const id = await ingestPoolResource({
        name: body.name ? String(body.name) : "Note",
        type: "note",
        source: "inline",
        text,
        tags,
      });
      return Response.json({ ok: true, resource_id: id }, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: msg }, { status: 400 });
    }
  }
  return Response.json(
    { error: "Unsupported resource payload" },
    { status: 400 },
  );
}
