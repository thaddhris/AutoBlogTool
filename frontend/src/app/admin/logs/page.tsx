import LogsView from "./LogsView";
import { knownKinds, listLogs } from "@/lib/logs";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = listLogs({ limit: 200 });
  const kinds = knownKinds();
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Everything that happens behind the scenes — when posts get written,
          scheduled, published, and any errors along the way. Newest first.
        </p>
      </div>
      <LogsView initialLogs={logs} initialKinds={kinds} />
    </div>
  );
}
