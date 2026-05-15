import { nanoid } from "nanoid";
import { db, logEvent } from "./db";
import { ResourceType } from "./types";

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
  name: string,
): Promise<string> {
  if (type === "pdf") {
    const mod = await import("pdf-parse");
    const pdf = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default
      ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
    const out = await pdf(buffer);
    return out.text ?? "";
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
