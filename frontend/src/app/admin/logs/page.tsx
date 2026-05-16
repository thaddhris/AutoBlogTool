import LogsView from "./LogsView";
import { knownKinds, listLogs } from "@/lib/logs";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = listLogs({ limit: 200 });
  const kinds = knownKinds();
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Every step the pipeline takes lands here — generation, scheduling,
          publishing, image errors. Newest first.
        </p>
      </div>
      <LogsView initialLogs={logs} initialKinds={kinds} />
    </div>
  );
}
