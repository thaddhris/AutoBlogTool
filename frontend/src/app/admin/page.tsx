import Link from "next/link";
import { listRequests, statusCounts } from "@/lib/requests";
import { listBlogs, blogStatusCounts } from "@/lib/blogs";
import { getSettings } from "@/lib/settings";
import { Badge, Card } from "@/components/ui";
import { RequestStatusBadge, BlogStatusBadge } from "@/components/StatusBadge";
import RunNowButton from "./RunNowButton";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const requests = listRequests();
  const blogs = listBlogs();
  const reqCounts = statusCounts();
  const blogCounts = blogStatusCounts();
  const settings = getSettings();

  const pending = requests.filter((r) => r.status === "pending");
  const processing = requests.filter((r) => r.status === "processing");
  const draftBlogs = blogs.filter((b) => b.status === "draft");
  const scheduledBlogs = blogs.filter((b) => b.status === "scheduled");
  const publishedBlogs = blogs.filter((b) => b.status === "published");

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Queue picks the top {settings.batch_size} pending requests each
            cron run. Mode:{" "}
            <span className="font-medium">{settings.publish_mode}</span> · every{" "}
            {settings.publish_interval_hours}h
          </p>
        </div>
        <RunNowButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Pending" value={reqCounts.pending} tone="neutral" />
        <StatCard
          label="Processing"
          value={reqCounts.processing}
          tone="blue"
        />
        <StatCard label="Drafts" value={blogCounts.draft} tone="amber" />
        <StatCard
          label="Scheduled"
          value={blogCounts.scheduled}
          tone="violet"
        />
        <StatCard
          label="Published"
          value={blogCounts.published}
          tone="green"
        />
        <StatCard label="Failed" value={reqCounts.failed} tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KanbanColumn
          title="Scheduled / Queued"
          count={pending.length + processing.length + scheduledBlogs.length}
        >
          {pending.length === 0 &&
            processing.length === 0 &&
            scheduledBlogs.length === 0 && <EmptyState text="Nothing queued" />}
          {pending.map((r) => (
            <Link
              key={r.id}
              href={`/admin/requests/${r.id}`}
              className="block rounded-md border border-zinc-200 bg-white p-3 hover:border-zinc-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{r.label}</div>
                <RequestStatusBadge status={r.status} />
              </div>
              <div className="text-xs text-zinc-500 mt-1 line-clamp-2">
                {r.topic}
              </div>
            </Link>
          ))}
          {processing.map((r) => (
            <Link
              key={r.id}
              href={`/admin/requests/${r.id}`}
              className="block rounded-md border border-blue-200 bg-blue-50/50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{r.label}</div>
                <RequestStatusBadge status={r.status} />
              </div>
              <div className="text-xs text-zinc-500 mt-1 line-clamp-2">
                Generating…
              </div>
            </Link>
          ))}
          {scheduledBlogs.map((b) => (
            <Link
              key={b.id}
              href={`/admin/blogs/${b.id}`}
              className="block rounded-md border border-violet-200 bg-violet-50/40 p-3 hover:border-violet-400"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{b.title}</div>
                <BlogStatusBadge status={b.status} />
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {b.scheduled_at
                  ? new Date(b.scheduled_at).toLocaleString()
                  : "no schedule"}
              </div>
            </Link>
          ))}
        </KanbanColumn>

        <KanbanColumn title="Draft Stage" count={draftBlogs.length}>
          {draftBlogs.length === 0 && <EmptyState text="No drafts" />}
          {draftBlogs.map((b) => (
            <Link
              key={b.id}
              href={`/admin/blogs/${b.id}`}
              className="block rounded-md border border-zinc-200 bg-white p-3 hover:border-zinc-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{b.title}</div>
                <BlogStatusBadge status={b.status} />
              </div>
              <div className="text-xs text-zinc-500 mt-1 line-clamp-2">
                {b.excerpt}
              </div>
            </Link>
          ))}
        </KanbanColumn>

        <KanbanColumn title="Published" count={publishedBlogs.length}>
          {publishedBlogs.length === 0 && <EmptyState text="Nothing yet" />}
          {publishedBlogs.slice(0, 20).map((b) => (
            <Link
              key={b.id}
              href={`/admin/blogs/${b.id}`}
              className="block rounded-md border border-zinc-200 bg-white p-3 hover:border-zinc-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{b.title}</div>
                <BlogStatusBadge status={b.status} />
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {b.published_at
                  ? new Date(b.published_at).toLocaleString()
                  : ""}
              </div>
            </Link>
          ))}
        </KanbanColumn>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Parameters<typeof Badge>[0]["tone"];
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          {label}
        </div>
        <Badge tone={tone}>{value}</Badge>
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

function KanbanColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-100/50 p-3 min-h-[300px]">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-zinc-500">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-xs text-zinc-400 italic py-6 text-center">{text}</div>
  );
}
