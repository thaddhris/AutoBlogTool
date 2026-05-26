import { NextRequest } from "next/server";
import { publishBlog } from "@/lib/publish";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // `force=true` (in query OR body) bypasses the publish-time quality
  // gate. Only used by the manual "Publish now" admin action.
  const url = new URL(req.url);
  let force = url.searchParams.get("force") === "1";
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object" && body.force === true) {
      force = true;
    }
  } catch {
    /* no body → keep query-derived value */
  }
  try {
    const blog = await publishBlog(id, { force });
    return Response.json({ blog });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 422 for gate failures so the UI can render a "Force publish" prompt
    // rather than a generic 500 + alert.
    const isGate = msg.startsWith("Quality gate failed:");
    return Response.json(
      { error: msg, gate: isGate },
      { status: isGate ? 422 : 500 },
    );
  }
}
