import { Badge } from "./ui";

export function RequestStatusBadge({ status }: { status: string }) {
  const map: Record<string, Parameters<typeof Badge>[0]["tone"]> = {
    pending: "neutral",
    processing: "blue",
    draft: "amber",
    scheduled: "violet",
    published: "green",
    failed: "red",
  };
  return <Badge tone={map[status] ?? "neutral"}>{status}</Badge>;
}

export function BlogStatusBadge({ status }: { status: string }) {
  const map: Record<string, Parameters<typeof Badge>[0]["tone"]> = {
    draft: "amber",
    scheduled: "violet",
    publishing: "blue",
    published: "green",
    failed: "red",
  };
  return <Badge tone={map[status] ?? "neutral"}>{status}</Badge>;
}
