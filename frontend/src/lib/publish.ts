import { logEvent } from "./db";
import { getBlog, updateBlog } from "./blogs";
import { updateRequest } from "./requests";
import { getSettings } from "./settings";
import { submitForIndexing } from "./indexing";
import { publish as publishMarkdown } from "./publishers/markdown";
import { publish as publishWebflow } from "./publishers/webflow";
import { Blog, Publisher } from "./types";

/**
 * Run the publish-time quality gate. Returns an array of failure reasons;
 * empty array → publish is allowed. Each rule is opt-in via Settings so a
 * brand-new install passes by default.
 *
 * NOTE: `min_seo_score` only fires when the blog has a cached `seo_audit`
 * — we don't auto-run the audit because it costs LLM tokens. Admins who
 * want the score check should also run audits (manual or as part of
 * their generation pipeline).
 */
export function checkPublishGate(blog: Blog): string[] {
  const s = getSettings();
  if (!s.quality_gate_enabled) return [];
  const reasons: string[] = [];

  const wc = blog.word_count ?? 0;
  if (s.min_word_count > 0 && wc > 0 && wc < s.min_word_count) {
    reasons.push(
      `word count ${wc} is below the minimum of ${s.min_word_count}`,
    );
  }
  if (s.max_word_count > 0 && wc > s.max_word_count) {
    reasons.push(
      `word count ${wc} exceeds the maximum of ${s.max_word_count}`,
    );
  }

  if (
    s.min_seo_score > 0 &&
    blog.seo_audit &&
    typeof blog.seo_audit.overall_score === "number" &&
    blog.seo_audit.overall_score < s.min_seo_score
  ) {
    reasons.push(
      `SEO score ${blog.seo_audit.overall_score}/100 is below the minimum of ${s.min_seo_score}`,
    );
  }

  return reasons;
}

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

export async function publishBlog(
  blogId: string,
  opts: { force?: boolean } = {},
): Promise<Blog> {
  const blog = getBlog(blogId);
  if (!blog) throw new Error("Blog not found");
  if (blog.status === "published") return blog;

  const settings = getSettings();
  const target = settings.publisher;

  // ── Pre-publish quality gate ──
  // Always evaluate so we can log; only enforce when the admin didn't
  // pass `force`. `force` is only set by the manual "Publish now" admin
  // action; cron and auto-publish never bypass the gate.
  const reasons = checkPublishGate(blog);
  if (reasons.length > 0) {
    if (!opts.force) {
      const detail = reasons.join("; ");
      logEvent("blog.publish.gate.block", detail, {
        blogId,
        requestId: blog.request_id,
      });
      throw new Error(`Quality gate failed: ${detail}`);
    }
    logEvent(
      "blog.publish.gate.override",
      `forced past gate (${reasons.join("; ")})`,
      { blogId, requestId: blog.request_id },
    );
  }

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

    // ── Search-engine indexing pings (fire-and-forget) ──
    // Both endpoints (Google + IndexNow) are best-effort: failures are
    // logged but never re-thrown so a flaky indexing endpoint can't
    // turn a successful publish into a failed one. We submit the
    // canonical public URL (site_url + /blog/<slug>) when configured —
    // otherwise the publisher's `url` (Webflow API URL) which only
    // helps for the markdown publisher's local URL.
    const canonical =
      settings.site_url
        ? `${settings.site_url.replace(/\/$/, "")}/blog/${blog.slug}`
        : url;
    if (settings.google_indexing_enabled || settings.indexnow_enabled) {
      void submitForIndexing({
        url: canonical,
        blogId,
        requestId: blog.request_id,
      });
    }

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
