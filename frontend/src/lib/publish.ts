import { logEvent } from "./db";
import { getBlog, updateBlog } from "./blogs";
import { updateRequest } from "./requests";
import { publish as publishMarkdown } from "./publishers/markdown";
import { Blog } from "./types";

export async function publishBlog(blogId: string): Promise<Blog> {
  const blog = getBlog(blogId);
  if (!blog) throw new Error("Blog not found");
  if (blog.status === "published") return blog;

  updateBlog(blogId, { status: "publishing" });
  logEvent("blog.publish.start", blog.title, {
    blogId,
    requestId: blog.request_id,
  });

  try {
    // v1 — only markdown publisher is wired. Architecture is intentionally
    // pluggable: when wordpress/webflow get re-introduced, swap on a target.
    const { url } = await publishMarkdown(blog);
    const updated = updateBlog(blogId, {
      status: "published",
      published_at: new Date().toISOString(),
      published_url: url,
    });
    updateRequest(blog.request_id, { status: "published" });
    logEvent("blog.publish.ok", blog.title, {
      blogId,
      requestId: blog.request_id,
      payload: { url },
    });
    return updated!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateBlog(blogId, { status: "failed" });
    updateRequest(blog.request_id, { status: "failed", last_error: msg });
    logEvent("blog.publish.fail", msg, {
      blogId,
      requestId: blog.request_id,
    });
    throw err;
  }
}
