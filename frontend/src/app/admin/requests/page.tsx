import { listRequests } from "@/lib/requests";
import RequestsToolbar from "./RequestsToolbar";
import RequestsTable from "./RequestsTable";
import DateRangeFilter from "@/components/DateRangeFilter";
import { parseBound, withinRange } from "@/lib/dateFilter";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = parseBound(sp.from);
  const to = parseBound(sp.to);
  const filterActive = Boolean(from || to);

  const allRequests = listRequests();
  const requests = allRequests.filter((r) =>
    withinRange(r.created_at, from, to),
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Blog Requests
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {filterActive
              ? `${requests.length} of ${allRequests.length} in this range`
              : `${requests.length} total`}{" "}
            · higher-priority items are written first
          </p>
        </div>
        <RequestsToolbar />
      </div>
      <DateRangeFilter
        basePath="/admin/requests"
        initialFrom={from ? from.toISOString() : null}
        initialTo={to ? to.toISOString() : null}
        helpText="Filters requests by the time they were submitted."
      />
      <RequestsTable initial={requests} />
    </div>
  );
}
