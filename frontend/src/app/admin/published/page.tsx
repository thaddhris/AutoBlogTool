import Link from "next/link";
import { listBlogs } from "@/lib/blogs";
import { BlogStatusBadge } from "@/components/StatusBadge";
import ClientTime from "@/components/ClientTime";
import { SeoScoreEmpty, SeoScorePill } from "@/components/SeoScore";
import DateRangeFilter from "@/components/DateRangeFilter";
import { parseBound, withinRange } from "@/lib/dateFilter";

// Turn the noisy `published_url` value into something a human can scan at a
// glance. Webflow API responses come back like
// `https://api.webflow.com/v2/collections/<col>/items/<id>` — we just show the
// platform name + short item id, and stash the full URL on the title attr so
// admins can hover/click to inspect. Markdown-publisher rows look like
// `/published/<slug>.md` — show just the filename.
function PublishedLocation({ url }: { url: string }) {
  let label = url;
  let isWebflow = false;
  if (url.startsWith("https://api.webflow.com")) {
    isWebflow = true;
    const m = url.match(/items\/([a-f0-9]+)/i);
    label = m ? `Webflow · ${m[1].slice(0, 8)}` : "Webflow item";
  } else if (url.startsWith("/published/")) {
    label = url.replace(/^\/published\//, "");
  }
  return (
    <span
      title={url}
      className={`block truncate ${isWebflow ? "text-zinc-700" : "font-mono"}`}
    >
      {label}
    </span>
  );
}

export const dynamic = "force-dynamic";

export default async function PublishedPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = parseBound(sp.from);
  const to = parseBound(sp.to);
  const filterActive = Boolean(from || to);

  const allBlogs = listBlogs({ status: "published" });
  const blogs = allBlogs.filter((b) => withinRange(b.published_at, from, to));
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Published</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {filterActive
            ? `${blogs.length} of ${allBlogs.length} in this range`
            : `${blogs.length} post${blogs.length === 1 ? "" : "s"}`}{" "}
          live on your site.
        </p>
      </div>
      <DateRangeFilter
        basePath="/admin/published"
        initialFrom={from ? from.toISOString() : null}
        initialTo={to ? to.toISOString() : null}
        helpText="Filters by the time each post actually went live."
      />
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[8%]" />
            <col className="w-[16%]" />
            <col className="w-[32%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">SEO</th>
              <th className="px-4 py-3 font-medium">Published</th>
              <th className="px-4 py-3 font-medium">Where</th>
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
                  Nothing published yet.
                </td>
              </tr>
            )}
            {blogs.map((b) => (
              <tr
                key={b.id}
                className="border-b border-zinc-100 hover:bg-zinc-50/50"
              >
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/admin/blogs/${b.id}`}
                    className="font-medium hover:underline break-words"
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
                <td className="px-4 py-3 text-zinc-700">
                  {b.published_at ? <ClientTime at={b.published_at} /> : "—"}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {b.published_url ? (
                    <PublishedLocation url={b.published_url} />
                  ) : (
                    "—"
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
