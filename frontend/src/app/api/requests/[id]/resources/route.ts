import { NextRequest } from "next/server";
import { listResources } from "@/lib/resources";
import { ingestResource } from "@/lib/ingest";
import { getRequest } from "@/lib/requests";
import { ResourceType } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return Response.json({ resources: listResources(id) });
}

function detectType(filename: string): ResourceType {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  return "doc";
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!getRequest(id))
    return Response.json({ error: "Request not found" }, { status: 404 });

  const contentType = request.headers.get("content-type") || "";

  // multipart/form-data — file upload (or note/url submitted as form fields)
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file && file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const type = detectType(file.name);
      try {
        const rid = await ingestResource({
          request_id: id,
          name: file.name,
          type,
          source: file.name,
          buffer,
        });
        return Response.json({ ok: true, resource_id: rid }, { status: 201 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json({ error: msg }, { status: 400 });
      }
    }
  }

  // application/json — { type: "url"|"note", source/text, name }
  const body = await request.json().catch(() => ({}));
  const type = body.type as ResourceType;
  if (type === "url") {
    const source = String(body.source ?? "").trim();
    if (!source)
      return Response.json({ error: "source URL required" }, { status: 400 });
    try {
      const rid = await ingestResource({
        request_id: id,
        name: body.name ? String(body.name) : source,
        type: "url",
        source,
      });
      return Response.json({ ok: true, resource_id: rid }, { status: 201 });
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
      const rid = await ingestResource({
        request_id: id,
        name: body.name ? String(body.name) : "Note",
        type: "note",
        source: "inline",
        text,
      });
      return Response.json({ ok: true, resource_id: rid }, { status: 201 });
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
