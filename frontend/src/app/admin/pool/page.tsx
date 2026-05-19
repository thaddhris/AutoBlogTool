import { listAllTags, listPoolResources } from "@/lib/pool";
import PoolView from "./PoolView";

export const dynamic = "force-dynamic";

export default async function PoolPage() {
  const resources = listPoolResources({ limit: 300 });
  const tags = listAllTags();
  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resource Pool</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Reusable resources shared across blog requests. Tag each resource;
          requests that select matching tags will retrieve them at generation
          time.
        </p>
      </div>
      <PoolView initialResources={resources} initialTags={tags} />
    </div>
  );
}
