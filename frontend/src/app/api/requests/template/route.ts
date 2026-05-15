import { templateBuffer } from "@/lib/excel";

export async function GET() {
  const buf = templateBuffer();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="blog-requests-template.xlsx"',
    },
  });
}
