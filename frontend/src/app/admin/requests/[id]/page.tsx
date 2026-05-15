import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequest } from "@/lib/requests";
import { listResources } from "@/lib/resources";
import { getBlogByRequest } from "@/lib/blogs";
import { Card } from "@/components/ui";
import { RequestStatusBadge, BlogStatusBadge } from "@/components/StatusBadge";
import RequestActions from "./RequestActions";
import ResourcesPanel from "./ResourcesPanel";

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
        <Card>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Brief
          </div>
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-xs text-zinc-500">Keywords</dt>
              <dd className="text-zinc-800">
                {req.keywords.length ? req.keywords.join(", ") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Instructions</dt>
              <dd className="text-zinc-800 whitespace-pre-wrap">
                {req.instructions || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Priority</dt>
              <dd className="text-zinc-800">{req.priority}</dd>
            </div>
          </dl>
        </Card>

        {blog && (
          <Card>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Generated blog
              </div>
              <BlogStatusBadge status={blog.status} />
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
          </Card>
        )}
      </div>

      <ResourcesPanel requestId={req.id} initialResources={resources} />
    </div>
  );
}
