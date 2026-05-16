import { NextRequest } from "next/server";
import { clearLogs, knownKinds, listLogs } from "@/lib/logs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const logs = listLogs({
    kind: q.get("kind") || undefined,
    level: (q.get("level") as "all" | "errors") || "all",
    since_id: q.get("since_id") ? Number(q.get("since_id")) : undefined,
    since: q.get("since") || undefined,
    until: q.get("until") || undefined,
    request_id: q.get("request_id") || undefined,
    blog_id: q.get("blog_id") || undefined,
    limit: q.get("limit") ? Number(q.get("limit")) : 200,
  });
  return Response.json({ logs, kinds: knownKinds() });
}

export async function DELETE() {
  const removed = clearLogs();
  return Response.json({ ok: true, removed });
}
