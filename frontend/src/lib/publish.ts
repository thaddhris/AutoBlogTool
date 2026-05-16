import { logEvent } from "./db";
import { getBlog, updateBlog } from "./blogs";
import { updateRequest } from "./requests";
import { getSettings } from "./settings";
import { publish as publishMarkdown } from "./publishers/markdown";
import { publish as publishWebflow } from "./publishers/webflow";
import { Blog, Publisher } from "./types";

async function dispatch(
  blog: Blog,
  target: Publisher,
): Promise<{ url: string }> {
  switch (target) {
    case "webflow":
      return publishWebflow(blog);
    case "markdown":
    default:
      return publishMarkdown(blog);
  }
}

export async function publishBlog(blogId: string): Promise<Blog> {
  const blog = getBlog(blogId);
  if (!blog) throw new Error("Blog not found");
  if (blog.status === "published") return blog;

  const settings = getSettings();
  const target = settings.publisher;

  updateBlog(blogId, { status: "publishing" });
  logEvent("blog.publish.start", `${blog.title} → ${target}`, {
    blogId,
    requestId: blog.request_id,
  });

  try {
    const { url } = await dispatch(blog, target);
    const updated = updateBlog(blogId, {
      status: "published",
      published_at: new Date().toISOString(),
      published_url: url,
    });
    updateRequest(blog.request_id, { status: "published" });
    logEvent("blog.publish.ok", blog.title, {
      blogId,
      requestId: blog.request_id,
      payload: { url, target },
    });
    return updated!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateBlog(blogId, { status: "failed" });
    updateRequest(blog.request_id, { status: "failed", last_error: msg });
    logEvent("blog.publish.fail", `${target}: ${msg}`, {
      blogId,
      requestId: blog.request_id,
    });
    throw err;
  }
}
