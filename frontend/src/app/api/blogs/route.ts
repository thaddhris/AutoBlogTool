import { NextRequest } from "next/server";
import { listBlogs } from "@/lib/blogs";
import { BlogStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status") || undefined;
  const status = statusParam
    ? (statusParam.split(",") as BlogStatus[])
    : undefined;
  return Response.json({ blogs: listBlogs({ status }) });
}
