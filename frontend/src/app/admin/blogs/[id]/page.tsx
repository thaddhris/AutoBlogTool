import Link from "next/link";
import { marked } from "marked";
import { notFound } from "next/navigation";
import { getBlog } from "@/lib/blogs";
import { getRequest } from "@/lib/requests";
import { getSettings } from "@/lib/settings";
import { decorateBlogBodyHtml } from "@/lib/seoBlocks";
import { BlogStatusBadge } from "@/components/StatusBadge";
import { LlmSeoScorePill, SeoScorePill } from "@/components/SeoScore";
import BlogActions from "./BlogActions";
import BlogEditor from "./BlogEditor";

export const dynamic = "force-dynamic";

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const blog = getBlog(id);
  if (!blog) notFound();
  const req = getRequest(blog.request_id);
  const siteUrl = getSettings().site_url;
  // Render the saved markdown the same way the Webflow publisher would —
  // marked → decoratedBlogBodyHtml (TOC + CTAs + related + bio). Passed to
  // BodyEditor's Preview tab so authors see exactly what readers will see.
  const rawHtml = marked.parse(blog.content_md || "", { async: false }) as string;
  const decoratedPreviewHtml = decorateBlogBodyHtml(rawHtml, blog);

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <Link
          href={req ? `/admin/requests/${req.id}` : "/admin/requests"}
          className="text-xs text-zinc-500 hover:text-zinc-700"
        >
          ← back
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {blog.title}
              </h1>
              <BlogStatusBadge status={blog.status} />
              <SeoScorePill audit={blog.seo_audit} size="md" showLabel />
              <LlmSeoScorePill
                audit={blog.llm_seo_audit}
                size="md"
                showLabel
              />
            </div>
            <p className="text-sm text-zinc-500">{blog.excerpt}</p>
            <div className="text-xs text-zinc-400">/{blog.slug}</div>
          </div>
          <BlogActions blog={blog} />
        </div>
      </div>

      <BlogEditor
        blog={blog}
        siteUrl={siteUrl}
        decoratedPreviewHtml={decoratedPreviewHtml}
      />
    </div>
  );
}
