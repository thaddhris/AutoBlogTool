import { nanoid } from "nanoid";
import { db, logEvent } from "./db";
import { ResourceType } from "./types";

// Module-scoped guard so we set pdfjs's worker URL exactly once per process.
let pdfWorkerSet = false;

function chunkText(text: string, target = 900, overlap = 100): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\s{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > target && buf) {
      chunks.push(buf.trim());
      const tail = buf.slice(-overlap);
      buf = tail + "\n\n" + p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

async function extractFromBuffer(
  buffer: Buffer,
  type: ResourceType,
  _name: string,
): Promise<string> {
  if (type === "pdf") {
    // pdf-parse v2 ships a class-based API on top of pdfjs-dist. pdfjs needs
    // its worker module URL set explicitly — by default it tries to resolve
    // a bundler-managed path that Next/Turbopack doesn't expose at runtime,
    // so we point it at the worker file shipped inside the pdf-parse package
    // itself. Setting it once is fine; pdfjs caches the value globally.
    const { PDFParse } = await import("pdf-parse");
    if (!pdfWorkerSet) {
      const path = await import("node:path");
      const { pathToFileURL } = await import("node:url");
      const workerPath = path.join(
        process.cwd(),
        "node_modules",
        "pdf-parse",
        "dist",
        "pdf-parse",
        "esm",
        "pdf.worker.mjs",
      );
      PDFParse.setWorker(pathToFileURL(workerPath).href);
      pdfWorkerSet = true;
    }
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const out = await parser.getText();
      return out.text ?? "";
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (type === "docx" || type === "doc") {
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ buffer });
    return out.value ?? "";
  }
  // unknown binary — best effort
  return buffer.toString("utf8");
}

async function extractFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FaclonAutoBlogBot/1.0; +https://faclonlabs.com)",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript").remove();
  const title = $("title").first().text().trim();
  const body = $("main").text() || $("article").text() || $("body").text();
  return `${title}\n\n${body}`.replace(/\s+\n/g, "\n").trim();
}

export interface IngestInput {
  request_id: string;
  name: string;
  type: ResourceType;
  source: string;
  buffer?: Buffer; // for pdf/docx
  text?: string; // for notes
}

export async function ingestResource(input: IngestInput): Promise<string> {
  const id = nanoid(12);
  db()
    .prepare(
      `INSERT INTO resources (id, request_id, name, type, source, status) VALUES (?, ?, ?, ?, ?, 'processing')`,
    )
    .run(id, input.request_id, input.name, input.type, input.source);
  logEvent("resource.ingest.start", input.name, {
    requestId: input.request_id,
  });

  try {
    let text = "";
    if (input.type === "url") {
      text = await extractFromUrl(input.source);
    } else if (input.type === "note") {
      text = input.text ?? "";
    } else if (input.buffer) {
      text = await extractFromBuffer(input.buffer, input.type, input.name);
    } else if (input.text) {
      text = input.text;
    }

    if (!text.trim()) throw new Error("Resource contained no extractable text");

    const chunks = chunkText(text);
    const insertChunk = db().prepare(
      `INSERT INTO chunks (id, resource_id, request_id, content, position) VALUES (?, ?, ?, ?, ?)`,
    );
    const tx = db().transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        insertChunk.run(nanoid(12), id, input.request_id, chunks[i], i);
      }
      db()
        .prepare(
          `UPDATE resources SET content = ?, status = 'ready', error = NULL WHERE id = ?`,
        )
        .run(text, id);
    });
    tx();

    logEvent("resource.ingest.ok", `${input.name} (${chunks.length} chunks)`, {
      requestId: input.request_id,
    });
    return id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db()
      .prepare(`UPDATE resources SET status = 'error', error = ? WHERE id = ?`)
      .run(msg, id);
    logEvent("resource.ingest.fail", `${input.name}: ${msg}`, {
      requestId: input.request_id,
    });
    throw err;
  }
}

// ─── Pool-scoped variant ────────────────────────────────────────────────────

import { setTags } from "./pool";
import { normalizeTags } from "./requests";

export interface IngestPoolInput {
  name: string;
  type: ResourceType;
  source: string;
  tags?: string[];
  buffer?: Buffer; // for pdf/docx
  text?: string; // for notes
}

/**
 * Same extraction/chunking pipeline as `ingestResource`, but writes into the
 * centralized pool tables. Pool resources are reusable across requests via
 * tag matching, not tied to any single request.
 */
export async function ingestPoolResource(
  input: IngestPoolInput,
): Promise<string> {
  const id = nanoid(12);
  const cleanTags = normalizeTags(input.tags ?? []);
  db()
    .prepare(
      `INSERT INTO pool_resources (id, name, type, source, status)
       VALUES (?, ?, ?, ?, 'processing')`,
    )
    .run(id, input.name, input.type, input.source);
  if (cleanTags.length) setTags(id, cleanTags);
  logEvent("pool.resource.ingest.start", input.name, {
    payload: { tags: cleanTags },
  });

  try {
    let text = "";
    if (input.type === "url") {
      text = await extractFromUrl(input.source);
    } else if (input.type === "note") {
      text = input.text ?? "";
    } else if (input.buffer) {
      text = await extractFromBuffer(input.buffer, input.type, input.name);
    } else if (input.text) {
      text = input.text;
    }

    if (!text.trim()) throw new Error("Resource contained no extractable text");

    const chunks = chunkText(text);
    const insertChunk = db().prepare(
      `INSERT INTO pool_chunks (id, resource_id, content, position)
       VALUES (?, ?, ?, ?)`,
    );
    const tx = db().transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        insertChunk.run(nanoid(12), id, chunks[i], i);
      }
      db()
        .prepare(
          `UPDATE pool_resources
           SET content = ?, status = 'ready', error = NULL,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(text, id);
    });
    tx();

    logEvent(
      "pool.resource.ingest.ok",
      `${input.name} (${chunks.length} chunks)`,
      { payload: { id, tags: cleanTags } },
    );
    return id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db()
      .prepare(
        `UPDATE pool_resources
         SET status = 'error', error = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(msg, id);
    logEvent("pool.resource.ingest.fail", `${input.name}: ${msg}`);
    throw err;
  }
}
