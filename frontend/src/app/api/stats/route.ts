import { statusCounts } from "@/lib/requests";
import { blogStatusCounts } from "@/lib/blogs";
import { db } from "@/lib/db";

export async function GET() {
  const recentLog = db()
    .prepare<[], { kind: string; message: string; created_at: string }>(
      `SELECT kind, message, created_at FROM run_log ORDER BY id DESC LIMIT 20`,
    )
    .all();
  return Response.json({
    requests: statusCounts(),
    blogs: blogStatusCounts(),
    recent: recentLog,
  });
}
