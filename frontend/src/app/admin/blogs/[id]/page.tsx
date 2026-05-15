import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getBlog } from "@/lib/blogs";
import { getRequest } from "@/lib/requests";
import { Card } from "@/components/ui";
import { BlogStatusBadge } from "@/components/StatusBadge";
import BlogActions from "./BlogActions";

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
  const html = marked.parse(blog.content_md || "", { async: false }) as string;

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <Link
          href={
            req ? `/admin/requests/${req.id}` : "/admin/requests"
          }
          className="text-xs text-zinc-500 hover:text-zinc-700"
        >
          ← back
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {blog.title}
              </h1>
              <BlogStatusBadge status={blog.status} />
            </div>
            <p className="text-sm text-zinc-500">{blog.excerpt}</p>
            <div className="text-xs text-zinc-400">/{blog.slug}</div>
          </div>
          <BlogActions blog={blog} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
            Content
          </div>
          {blog.banner_url && (
            // svg data-URL placeholder; safe to render as <img>
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={blog.banner_url}
              alt={blog.banner_alt ?? blog.title}
              className="w-full rounded-md mb-4 border border-zinc-200"
            />
          )}
          <article
            className="prose-blog"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              SEO
            </div>
            <dl className="text-sm space-y-2">
              <div>
                <dt className="text-xs text-zinc-500">Meta title</dt>
                <dd>{blog.meta_title}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Meta description</dt>
                <dd className="text-zinc-700">{blog.meta_desc}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Keywords</dt>
                <dd>{blog.keywords.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Tags</dt>
                <dd>{blog.tags.join(", ") || "—"}</dd>
              </div>
            </dl>
          </Card>

          {blog.faq.length > 0 && (
            <Card>
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                FAQ
              </div>
              <div className="space-y-3 text-sm">
                {blog.faq.map((f, i) => (
                  <div key={i}>
                    <div className="font-medium">{f.q}</div>
                    <div className="text-zinc-600 mt-0.5">{f.a}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
