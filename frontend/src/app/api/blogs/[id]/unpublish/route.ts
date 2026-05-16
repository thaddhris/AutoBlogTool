import { NextRequest } from "next/server";
import { getBlog, updateBlog } from "@/lib/blogs";
import { updateRequest } from "@/lib/requests";
import { logEvent } from "@/lib/db";

/**
 * Revert a published blog back to draft *locally*. The live CMS post (e.g.
 * on Webflow) is NOT removed by this endpoint — the admin is expected to
 * delete or unpublish it manually on the CMS if desired. The intent is to
 * unlock the local record for re-editing / re-generation without losing
 * the historical URL or published_at.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const blog = getBlog(id);
  if (!blog) {
    return Response.json({ error: "Blog not found" }, { status: 404 });
  }
  if (blog.status !== "published") {
    return Response.json(
      { error: "Only published blogs can be unpublished" },
      { status: 400 },
    );
  }

  const updated = updateBlog(id, {
    status: "draft",
    published_at: null,
    published_url: null,
    // Don't reset scheduled_at — admin may want to re-queue an auto-publish
    // by setting it explicitly. Leave whatever was there.
  });
  updateRequest(blog.request_id, { status: "draft" });
  logEvent("blog.unpublish", blog.title, {
    blogId: id,
    requestId: blog.request_id,
    payload: { previous_url: blog.published_url },
  });
  return Response.json({ blog: updated });
}
