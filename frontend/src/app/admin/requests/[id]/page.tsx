import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequest } from "@/lib/requests";
import { listResources } from "@/lib/resources";
import { listPoolResources } from "@/lib/pool";
import { getBlogByRequest } from "@/lib/blogs";
import { Card } from "@/components/ui";
import { RequestStatusBadge, BlogStatusBadge } from "@/components/StatusBadge";
import { SeoScorePill } from "@/components/SeoScore";
import RequestActions from "./RequestActions";
import ResourcesPanel from "./ResourcesPanel";
import BriefEditor from "./BriefEditor";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = getRequest(id);
  if (!req) notFound();
  const resources = listResources(id);
  const blog = getBlogByRequest(id);
  // Preview which pool resources will get attached at generation time
  // based on this request's selected tags.
  const matchedPool = req.tags.length
    ? listPoolResources({ tags: req.tags, limit: 20 })
    : [];

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <Link
          href="/admin/requests"
          className="text-xs text-zinc-500 hover:text-zinc-700"
        >
          ← back to requests
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {req.label}
              </h1>
              <RequestStatusBadge status={req.status} />
            </div>
            <p className="text-sm text-zinc-500 max-w-2xl">{req.topic}</p>
          </div>
          <RequestActions request={req} hasBlog={!!blog} />
        </div>
      </div>

      {req.last_error && (
        <Card className="border-red-200 bg-red-50">
          <div className="text-xs font-medium text-red-800 mb-1">
            Last error
          </div>
          <div className="text-sm text-red-900 whitespace-pre-wrap">
            {req.last_error}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BriefEditor request={req} />

        {blog && (
          <Card>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Generated blog
              </div>
              <div className="flex items-center gap-1.5">
                <SeoScorePill audit={blog.seo_audit} showLabel />
                <BlogStatusBadge status={blog.status} />
              </div>
            </div>
            <Link
              href={`/admin/blogs/${blog.id}`}
              className="font-medium hover:underline block"
            >
              {blog.title}
            </Link>
            <div className="text-sm text-zinc-500 mt-1 line-clamp-3">
              {blog.excerpt}
            </div>
            {blog.seo_audit && (
              <div className="text-[11px] text-zinc-500 mt-2">
                LLM SEO audit: {Math.round(blog.seo_audit.overall_score)}/100
                · {blog.seo_audit.recommendations.length} recommendation
                {blog.seo_audit.recommendations.length === 1 ? "" : "s"}
              </div>
            )}
          </Card>
        )}
      </div>

      <ResourcesPanel requestId={req.id} initialResources={resources} />

      {req.tags.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Matched pool resources
            </div>
            <Link
              href="/admin/pool"
              className="text-xs text-zinc-500 hover:text-zinc-900 underline"
            >
              Open Resource Pool →
            </Link>
          </div>
          {matchedPool.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">
              No pool resources match the selected tags yet. Add resources
              tagged with{" "}
              {req.tags.map((t, i) => (
                <span key={t}>
                  <code className="font-mono">{t}</code>
                  {i < req.tags.length - 1 ? ", " : ""}
                </span>
              ))}{" "}
              from the Resource Pool page.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {matchedPool.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="flex flex-wrap gap-1 ml-2">
                    {r.tags
                      .filter((t) => req.tags.includes(t))
                      .map((t) => (
                        <span
                          key={t}
                          className="text-[11px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800"
                        >
                          {t}
                        </span>
                      ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-zinc-500 mt-3">
            These are retrieved alongside the directly-attached resources at
            generation time, ranked by FTS5 relevance to the request topic.
          </p>
        </Card>
      )}
    </div>
  );
}
