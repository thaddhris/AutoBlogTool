import { NextRequest } from "next/server";
import { createRequest, listRequests } from "@/lib/requests";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") || undefined;
  const rows = listRequests({
    status: status as Parameters<typeof listRequests>[0] extends infer A
      ? A extends { status?: infer S }
        ? S
        : never
      : never,
  });
  return Response.json({ requests: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const label = String(body.label ?? "").trim();
  const topic = String(body.topic ?? "").trim();
  if (!label || !topic) {
    return Response.json(
      { error: "label and topic are required" },
      { status: 400 },
    );
  }
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map(String)
    : typeof body.keywords === "string"
      ? body.keywords
          .split(/[,;\n]/)
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];
  const created = createRequest({
    label,
    topic,
    keywords,
    instructions: String(body.instructions ?? "").trim(),
    priority: Number.isFinite(body.priority) ? body.priority : 0,
  });
  return Response.json({ request: created }, { status: 201 });
}
