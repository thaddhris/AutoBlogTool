import Link from "next/link";
import { listBlogs } from "@/lib/blogs";
import { BlogStatusBadge } from "@/components/StatusBadge";
import { Countdown } from "@/components/Countdown";
import ClientTime from "@/components/ClientTime";
import { SeoScoreEmpty, SeoScorePill } from "@/components/SeoScore";
import DateRangeFilter from "@/components/DateRangeFilter";
import { parseBound, withinRange } from "@/lib/dateFilter";
import DeleteBlogButton from "@/components/DeleteBlogButton";

export const dynamic = "force-dynamic";

// "Scheduled" is now just drafts that have an active auto-publish timer.
// Manual-held drafts (no timer) live on the Drafts page instead.
export default async function ScheduledPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = parseBound(sp.from);
  const to = parseBound(sp.to);
  const filterActive = Boolean(from || to);

  const all = listBlogs({ status: ["draft", "scheduled"] });
  const allScheduled = all
    .filter((b) => b.scheduled_at)
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1));
  const blogs = allScheduled.filter((b) =>
    withinRange(b.scheduled_at, from, to),
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Scheduled
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {filterActive
            ? `${blogs.length} of ${allScheduled.length} in this range`
            : `${blogs.length} post${blogs.length === 1 ? "" : "s"}`}{" "}
          set to publish automatically at a specific time.
        </p>
      </div>
      <DateRangeFilter
        basePath="/admin/scheduled"
        initialFrom={from ? from.toISOString() : null}
        initialTo={to ? to.toISOString() : null}
        helpText="Filters by the planned go-live time, so you can see what's queued for a specific window."
      />
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">SEO</th>
              <th className="px-4 py-3 font-medium">Goes live in</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-16 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {blogs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-zinc-400"
                >
                  Nothing scheduled.
                </td>
              </tr>
            )}
            {blogs.map((b) => (
              <tr
                key={b.id}
                className="border-b border-zinc-100 hover:bg-zinc-50/50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/blogs/${b.id}`}
                    className="font-medium hover:underline"
                  >
                    {b.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {b.seo_audit ? (
                    <SeoScorePill audit={b.seo_audit} />
                  ) : (
                    <SeoScoreEmpty />
                  )}
                </td>
                <td className="px-4 py-3">
                  <Countdown
                    at={b.scheduled_at}
                    className="font-medium text-violet-700"
                  />
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {b.scheduled_at ? <ClientTime at={b.scheduled_at} /> : "—"}
                </td>
                <td className="px-4 py-3">
                  <BlogStatusBadge status={b.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteBlogButton
                    blogId={b.id}
                    title={b.title}
                    status={b.status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
