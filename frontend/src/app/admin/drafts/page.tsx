import Link from "next/link";
import { listBlogs } from "@/lib/blogs";
import { BlogStatusBadge } from "@/components/StatusBadge";
import { Countdown } from "@/components/Countdown";
import ClientTime from "@/components/ClientTime";
import { SeoScoreEmpty, SeoScorePill } from "@/components/SeoScore";
import DateRangeFilter from "@/components/DateRangeFilter";
import { parseBound, withinRange } from "@/lib/dateFilter";

export const dynamic = "force-dynamic";

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = parseBound(sp.from);
  const to = parseBound(sp.to);
  const filterActive = Boolean(from || to);

  // Include legacy 'scheduled' status rows so they don't disappear after the
  // model migration. Both kinds are "drafts" in the new model.
  const allBlogs = listBlogs({ status: ["draft", "scheduled"] }).sort((a, b) => {
    if (a.scheduled_at && b.scheduled_at)
      return a.scheduled_at.localeCompare(b.scheduled_at);
    if (a.scheduled_at) return -1;
    if (b.scheduled_at) return 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
  const blogs = allBlogs.filter((b) => withinRange(b.created_at, from, to));
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {filterActive
            ? `${blogs.length} of ${allBlogs.length} in this range`
            : `${blogs.length} post${blogs.length === 1 ? "" : "s"}`}{" "}
          waiting to be reviewed or published. You can edit each one until it
          goes live.
        </p>
      </div>
      <DateRangeFilter
        basePath="/admin/drafts"
        initialFrom={from ? from.toISOString() : null}
        initialTo={to ? to.toISOString() : null}
        helpText="Filters drafts by the time they were generated."
      />
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Excerpt</th>
              <th className="px-4 py-3 font-medium">SEO</th>
              <th className="px-4 py-3 font-medium">Auto-publish</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {blogs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-zinc-400"
                >
                  No drafts.
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
                <td className="px-4 py-3 text-zinc-600 max-w-md">
                  <div className="line-clamp-2">{b.excerpt}</div>
                </td>
                <td className="px-4 py-3">
                  {b.seo_audit ? (
                    <SeoScorePill audit={b.seo_audit} />
                  ) : (
                    <SeoScoreEmpty />
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-700 text-xs">
                  {b.scheduled_at ? (
                    <>
                      <Countdown
                        at={b.scheduled_at}
                        className="font-medium text-violet-700"
                      />
                      <div className="text-zinc-500">
                        <ClientTime at={b.scheduled_at} />
                      </div>
                    </>
                  ) : (
                    <span className="text-zinc-400 italic">paused</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <BlogStatusBadge status={b.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

