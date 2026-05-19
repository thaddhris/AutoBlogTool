import { listAllTags } from "@/lib/pool";

export async function GET() {
  return Response.json({ tags: listAllTags() });
}
