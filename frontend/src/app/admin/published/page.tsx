import Link from "next/link";
import { listBlogs } from "@/lib/blogs";
import { BlogStatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function PublishedPage() {
  const blogs = listBlogs({ status: "published" });
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Published</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {blogs.length} blog{blogs.length === 1 ? "" : "s"} live
        </p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Published at</th>
              <th className="px-4 py-3 font-medium">Output</th>
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
                  Nothing published yet.
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
                <td className="px-4 py-3 text-zinc-700">
                  {b.published_at
                    ? new Date(b.published_at).toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {b.published_url ?? ""}
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
