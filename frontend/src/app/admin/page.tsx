import Link from "next/link";
import { listRequests } from "@/lib/requests";
import { listBlogs } from "@/lib/blogs";
import { getSettings } from "@/lib/settings";
import { Badge, Card } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import ClientTime from "@/components/ClientTime";
import { RequestStatusBadge, BlogStatusBadge } from "@/components/StatusBadge";
import { SeoScorePill } from "@/components/SeoScore";
import DeleteBlogButton from "@/components/DeleteBlogButton";
import RunNowButton from "./RunNowButton";
import DateRangeFilter from "@/components/DateRangeFilter";
import { parseBound, withinRange } from "@/lib/dateFilter";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = parseBound(sp.from);
  const to = parseBound(sp.to);
  const filterActive = Boolean(from || to);

  const allRequests = listRequests();
  const allBlogs = listBlogs();
  const settings = getSettings();

  // Queue lives in the present, so the filter narrows by request `created_at`
  // — "show me requests submitted in this window."
  const requests = allRequests.filter((r) => withinRange(r.created_at, from, to));
  // Drafts: narrow by created_at (when the post was generated).
  // Published: narrow by published_at (when it actually went live).
  const blogs = allBlogs.filter((b) => {
    if (b.status === "published") return withinRange(b.published_at, from, to);
    return withinRange(b.created_at, from, to);
  });

  // Recompute counts from the filtered lists so the stat cards reflect the
  // current window.
  const reqCounts = {
    pending: requests.filter((r) => r.status === "pending").length,
    processing: requests.filter((r) => r.status === "processing").length,
  };
  const blogCounts = {
    draft:
      blogs.filter((b) => b.status === "draft" || b.status === "scheduled")
        .length,
    published: blogs.filter((b) => b.status === "published").length,
  };

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

  // Failed column — both requests and blogs that errored out. A single
  // failure usually produces *both* a failed request row AND a failed blog
  // row linked by request_id, so we dedupe: the blog wins (more detail to
  // link to). Orphan failed blogs (request already cleaned up) and orphan
  // failed requests (failed before any blog was created) both show as
  // standalone cards. Sorted newest-first so the latest mess is on top.
  const allFailedBlogs = blogs.filter((b) => b.status === "failed");
  const blogReqIds = new Set(allFailedBlogs.map((b) => b.request_id));
  const failedReqs = requests
    .filter((r) => r.status === "failed" && !blogReqIds.has(r.id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const failedBlogs = allFailedBlogs.sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  const failedCount = failedReqs.length + failedBlogs.length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {settings.publish_mode === "auto"
              ? "Posts publish automatically after the review window."
              : "Posts wait for you to publish them manually."}{" "}
            Writing <span className="font-medium">{settings.batch_size}</span>{" "}
            post{settings.batch_size === 1 ? "" : "s"} per run · review
            window{" "}
            <span className="font-medium">{settings.draft_hold_hours}h</span>
          </p>
        </div>
        <RunNowButton />
      </div>

      <DateRangeFilter
        basePath="/admin"
        initialFrom={from ? from.toISOString() : null}
        initialTo={to ? to.toISOString() : null}
        helpText="Narrows every column to items active in this range — requests by submission time, drafts by creation, live posts by go-live time."
      />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Pending" value={reqCounts.pending} tone="neutral" />
        <StatCard
          label="Processing"
          value={reqCounts.processing}
          tone="blue"
        />
        <StatCard label="Drafts" value={blogCounts.draft} tone="amber" />
        <StatCard
          label="Published"
          value={blogCounts.published}
          tone="green"
        />
        <StatCard label="Failed" value={failedCount} tone="red" />
        <StatCard
          label="All requests"
          value={requests.length}
          tone="violet"
          hint="Every blog request in this window — pending, processing, drafts, published, or failed. Counts may overlap with the other cards."
        />
      </div>

      {filterActive && (
        <p className="text-xs text-zinc-500 -mt-2">
          Counts and lists below are limited to the selected date range. Click
          &ldquo;All time&rdquo; to clear.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KanbanColumn
          title="In queue"
          subtitle="Waiting to be written on the next run"
          count={pendingReqs.length + processingReqs.length}
        >
          {pendingReqs.length === 0 && processingReqs.length === 0 && (
            <EmptyState text="Nothing waiting" />
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
              <div className="text-xs text-zinc-500 mt-1">Writing now…</div>
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
          title="Drafts"
          subtitle="Review and edit. Goes live when the timer runs out."
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
              {b.seo_audit && (
                <div className="mt-1.5">
                  <SeoScorePill audit={b.seo_audit} size="xs" showLabel />
                </div>
              )}
            </Link>
          ))}
        </KanbanColumn>

        <KanbanColumn
          title="Live"
          subtitle="Already on your site"
          count={publishedBlogs.length}
        >
          {publishedBlogs.length === 0 && <EmptyState text="Nothing yet" />}
          {/* Sort newest-first then cap visible cards. We show only the 20
              most-recent here; the column header always reflects the true
              filtered total. Footer below explains when there's overflow. */}
          {publishedBlogs
            .slice()
            .sort((a, b) =>
              (b.published_at ?? "").localeCompare(a.published_at ?? ""),
            )
            .slice(0, 20)
            .map((b) => (
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
                {b.published_at && <ClientTime at={b.published_at} />}
              </div>
            </Link>
          ))}
          {publishedBlogs.length > 20 && (
            <Link
              href="/admin/published"
              className="block text-center text-xs text-zinc-500 hover:text-zinc-800 underline pt-1"
            >
              and {publishedBlogs.length - 20} more — see all
            </Link>
          )}
        </KanbanColumn>

        <KanbanColumn
          title="Needs attention"
          subtitle="Generation or publishing went wrong — open to retry."
          count={failedCount}
        >
          {failedCount === 0 && <EmptyState text="Nothing failed" />}
          {failedReqs.map((r) => (
            <Link
              key={r.id}
              href={`/admin/requests/${r.id}`}
              className="block rounded-md border border-red-200 bg-red-50/50 p-3 hover:border-red-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{r.label}</div>
                <RequestStatusBadge status={r.status} />
              </div>
              <div
                className="text-xs text-red-700 mt-1 line-clamp-2"
                title={r.last_error ?? ""}
              >
                {r.last_error || "Generation failed."}
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                <ClientTime at={r.updated_at} />
              </div>
            </Link>
          ))}
          {failedBlogs.map((b) => (
            <Link
              key={b.id}
              href={`/admin/blogs/${b.id}`}
              className="block rounded-md border border-red-200 bg-red-50/50 p-3 hover:border-red-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{b.title}</div>
                <div className="flex items-center gap-1 shrink-0">
                  <BlogStatusBadge status={b.status} />
                  <DeleteBlogButton
                    blogId={b.id}
                    title={b.title}
                    status={b.status}
                    size="sm"
                  />
                </div>
              </div>
              <div className="text-xs text-red-700 mt-1">
                Publish failed — open to retry or unpublish.
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                <ClientTime at={b.updated_at} />
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
  hint,
}: {
  label: string;
  value: number;
  tone: Parameters<typeof Badge>[0]["tone"];
  hint?: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between" title={hint}>
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

