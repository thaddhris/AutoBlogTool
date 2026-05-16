import Link from "next/link";
import { listRequests, statusCounts } from "@/lib/requests";
import { listBlogs, blogStatusCounts } from "@/lib/blogs";
import { getSettings } from "@/lib/settings";
import { Badge, Card } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { RequestStatusBadge, BlogStatusBadge } from "@/components/StatusBadge";
import RunNowButton from "./RunNowButton";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const requests = listRequests();
  const blogs = listBlogs();
  const reqCounts = statusCounts();
  const blogCounts = blogStatusCounts();
  const settings = getSettings();

  // Queue column — requests waiting in the pipeline.
  const pendingReqs = requests.filter((r) => r.status === "pending");
  const processingReqs = requests.filter((r) => r.status === "processing");

  // Draft column — every blog that hasn't been published, with or without a
  // pending auto-publish timer. Includes legacy 'scheduled' rows.
  const draftBlogs = blogs
    .filter((b) => b.status === "draft" || b.status === "scheduled")
    .sort((a, b) => {
      // Drafts with a near-term auto-publish go to the top
      if (a.scheduled_at && b.scheduled_at)
        return a.scheduled_at.localeCompare(b.scheduled_at);
      if (a.scheduled_at) return -1;
      if (b.scheduled_at) return 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

  const publishedBlogs = blogs.filter((b) => b.status === "published");

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Mode: <span className="font-medium">{settings.publish_mode}</span>{" "}
            · batch <span className="font-medium">{settings.batch_size}</span>{" "}
            · draft hold{" "}
            <span className="font-medium">{settings.draft_hold_hours}h</span>
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
        <StatCard label="Drafts" value={blogCounts.draft + (blogCounts as Record<string, number>).scheduled} tone="amber" />
        <StatCard
          label="Published"
          value={blogCounts.published}
          tone="green"
        />
        <StatCard label="Failed" value={reqCounts.failed} tone="red" />
        <StatCard label="Total" value={requests.length} tone="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KanbanColumn
          title="Scheduled Blog Requests"
          subtitle="In the queue, waiting for the next generation tick"
          count={pendingReqs.length + processingReqs.length}
        >
          {pendingReqs.length === 0 && processingReqs.length === 0 && (
            <EmptyState text="Queue is empty" />
          )}
          {processingReqs.map((r) => (
            <Link
              key={r.id}
              href={`/admin/requests/${r.id}`}
              className="block rounded-md border border-blue-200 bg-blue-50/50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{r.label}</div>
                <RequestStatusBadge status={r.status} />
              </div>
              <div className="text-xs text-zinc-500 mt-1">Generating…</div>
            </Link>
          ))}
          {pendingReqs.map((r) => (
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
              {r.priority !== 0 && (
                <div className="text-[11px] text-zinc-400 mt-1">
                  priority {r.priority}
                </div>
              )}
            </Link>
          ))}
        </KanbanColumn>

        <KanbanColumn
          title="Draft Stage"
          subtitle="Editable. Auto-publishes when the timer expires."
          count={draftBlogs.length}
        >
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
              {b.scheduled_at ? (
                <div className="text-xs text-violet-700 mt-1">
                  auto-publish in{" "}
                  <Countdown at={b.scheduled_at} className="font-medium" />
                </div>
              ) : (
                <div className="text-xs text-zinc-500 mt-1">
                  manual hold · no auto-publish timer
                </div>
              )}
            </Link>
          ))}
        </KanbanColumn>

        <KanbanColumn
          title="Published"
          subtitle="Live blogs"
          count={publishedBlogs.length}
        >
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
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-100/50 p-3 min-h-[300px]">
      <div className="flex items-center justify-between mb-1 px-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-zinc-500">{count}</span>
      </div>
      {subtitle && (
        <p className="text-[11px] text-zinc-500 mb-3 px-1">{subtitle}</p>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-xs text-zinc-400 italic py-6 text-center">{text}</div>
  );
}
