import { NextRequest } from "next/server";
import { importBuffer } from "@/lib/excel";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const result = importBuffer(buf);
  return Response.json(result);
}
