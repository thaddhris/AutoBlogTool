import Link from "next/link";
import { listRequests } from "@/lib/requests";
import { RequestStatusBadge } from "@/components/StatusBadge";
import ClientTime from "@/components/ClientTime";
import RequestsToolbar from "./RequestsToolbar";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const requests = listRequests();
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Blog Requests
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {requests.length} total · queue picks the highest-priority pending
            requests first
          </p>
        </div>
        <RequestsToolbar />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium">Keywords</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-zinc-400"
                >
                  No requests yet. Click <strong>New request</strong> or{" "}
                  <strong>Import Excel</strong> to add some.
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr
                key={r.id}
                className="border-b border-zinc-100 hover:bg-zinc-50/50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/requests/${r.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {r.label}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-600 max-w-md">
                  <div className="line-clamp-1">{r.topic}</div>
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {r.keywords.slice(0, 3).join(", ")}
                  {r.keywords.length > 3 && ` +${r.keywords.length - 3}`}
                </td>
                <td className="px-4 py-3 text-zinc-700">{r.priority}</td>
                <td className="px-4 py-3">
                  <RequestStatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  <ClientTime at={r.created_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
