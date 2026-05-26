import { generateIndexNowKey } from "@/lib/indexing";

/**
 * Returns a fresh 32-char hex key suitable for IndexNow. Used by the
 * Settings UI's "Generate key" button. We don't persist it server-side —
 * the admin must paste it back into Settings, hit Save, and then upload
 * `<key>.txt` to the public site root.
 */
export async function POST() {
  return Response.json({ key: generateIndexNowKey() });
}
