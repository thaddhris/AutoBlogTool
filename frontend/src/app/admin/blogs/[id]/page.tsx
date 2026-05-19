import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlog } from "@/lib/blogs";
import { getRequest } from "@/lib/requests";
import { getSettings } from "@/lib/settings";
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

      <BlogEditor blog={blog} siteUrl={siteUrl} />
    </div>
  );
}
