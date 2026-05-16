import Link from "next/link";
import { listBlogs } from "@/lib/blogs";
import { BlogStatusBadge } from "@/components/StatusBadge";
import { Countdown } from "@/components/Countdown";
import ClientTime from "@/components/ClientTime";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  // Include legacy 'scheduled' status rows so they don't disappear after the
  // model migration. Both kinds are "drafts" in the new model.
  const blogs = listBlogs({ status: ["draft", "scheduled"] }).sort((a, b) => {
    if (a.scheduled_at && b.scheduled_at)
      return a.scheduled_at.localeCompare(b.scheduled_at);
    if (a.scheduled_at) return -1;
    if (b.scheduled_at) return 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {blogs.length} draft{blogs.length === 1 ? "" : "s"} — editable until
          auto-publish timer expires
        </p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Excerpt</th>
              <th className="px-4 py-3 font-medium">Auto-publish</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {blogs.length === 0 && (
              <tr>
                <td
                  colSpan={4}
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
