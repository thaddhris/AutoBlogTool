import { listAllTags, listPoolResources } from "@/lib/pool";
import PoolView from "./PoolView";

export const dynamic = "force-dynamic";

export default async function PoolPage() {
  const resources = listPoolResources({ limit: 300 });
  const tags = listAllTags();
  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Resource library
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          A shared library of source material the AI can use across many blog
          posts. Give each resource a few tags (like <em>ai</em>, <em>iot</em>,
          <em>company-overview</em>) and any blog request that picks the same
          tag will automatically use it as background reading.
        </p>
      </div>
      <PoolView initialResources={resources} initialTags={tags} />
    </div>
  );
}
