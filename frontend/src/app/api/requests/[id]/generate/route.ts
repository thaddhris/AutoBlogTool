import { NextRequest } from "next/server";
import { generateBlogForRequest } from "@/lib/pipeline";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const blog = await generateBlogForRequest(id);
    return Response.json({ blog });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
