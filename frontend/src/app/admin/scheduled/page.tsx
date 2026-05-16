import Link from "next/link";
import { listBlogs } from "@/lib/blogs";
import { BlogStatusBadge } from "@/components/StatusBadge";
import { Countdown } from "@/components/Countdown";

export const dynamic = "force-dynamic";

// "Scheduled" is now just drafts that have an active auto-publish timer.
// Manual-held drafts (no timer) live on the Drafts page instead.
export default async function ScheduledPage() {
  const all = listBlogs({ status: ["draft", "scheduled"] });
  const blogs = all
    .filter((b) => b.scheduled_at)
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Scheduled blogs
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {blogs.length} blog{blogs.length === 1 ? "" : "s"} with an active
          auto-publish timer
        </p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Auto-publish in</th>
              <th className="px-4 py-3 font-medium">At</th>
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
                  <Countdown
                    at={b.scheduled_at}
                    className="font-medium text-violet-700"
                  />
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {b.scheduled_at
                    ? new Date(b.scheduled_at).toLocaleString()
                    : "—"}
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
