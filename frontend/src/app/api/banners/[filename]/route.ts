import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

/**
 * Stream a generated banner image from `.data/banners/<filename>`.
 *
 * Why this exists: Next 16's production build snapshots `public/` at
 * `next build` time. Every banner the running app writes to `public/banners`
 * after that 404s in production. By keeping banners in `.data/banners`
 * (same persistent directory as the SQLite DB) and serving them through
 * this route, the bytes are reachable regardless of when they were written.
 *
 * Security: the filename is normalised + validated against a strict
 * `[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp|svg)` allow-list so a path-traversal
 * attempt (`../../etc/passwd`) gets rejected before any fs work happens.
 *
 * Caching: 24h immutable cache — filenames already include a timestamp +
 * nanoid suffix so they're effectively content-addressed.
 */
const BANNERS_DIR = path.join(process.cwd(), ".data", "banners");

// Filenames are always `<timestamp36>-<nanoid8>.<ext>` or the legacy
// `_overlay-preview.png` debug ones, plus the inline variant `inline-…`.
// We're conservative: only allow alphanumerics, dashes, underscores, and
// a single trailing extension.
const SAFE_FILENAME = /^[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|svg)$/i;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ filename: string }> },
) {
  const { filename } = await ctx.params;
  if (!SAFE_FILENAME.test(filename)) {
    return new Response("Bad filename", { status: 400 });
  }
  const abs = path.join(BANNERS_DIR, filename);
  // Defence-in-depth: even with the regex above, refuse to serve anything
  // whose normalised absolute path falls outside the banners directory.
  if (!abs.startsWith(BANNERS_DIR + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!fs.existsSync(abs)) {
    return new Response("Not found", { status: 404 });
  }
  const buf = fs.readFileSync(abs);
  const ext = filename.split(".").pop()!.toLowerCase();
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
      "Content-Length": String(buf.byteLength),
      // Immutable: filenames are unique per generation.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
