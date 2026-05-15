import { nanoid } from "nanoid";
import { db, logEvent } from "./db";
import { getSettings } from "./settings";
import { llmJson } from "./ai";
import { retrieve, requestCorpusSnippet } from "./rag";
import { slugify, blogJsonLd, faqJsonLd } from "./seo";
import { generateBanner } from "./images";
import { getRequest, updateRequest } from "./requests";
import { getBlogByRequest } from "./blogs";
import { Blog } from "./types";

const WRITER_SYSTEM = `You are a senior B2B content writer for an industrial AI / IIoT platform.
You write SEO-optimized blog posts that read like a thoughtful human expert wrote them — concrete, useful, never robotic.
Hard rules:
- Use the supplied source snippets faithfully. Do not invent specific stats, customer names, or product features that aren't in the snippets, brand context, or topic brief.
- Markdown only for the body. Use H2/H3 headings, short paragraphs, bullet lists, and a "Key takeaways" section near the end.
- Include a clear call-to-action paragraph at the end.
- Do not include the title as an H1 in the body — the platform renders it separately.
- Always respond with the exact JSON shape requested. No prose outside JSON.`;

interface WriterOutput {
  title: string;
  meta_title: string;
  meta_desc: string;
  excerpt: string;
  content_md: string;
  keywords: string[];
  tags: string[];
  faq: { q: string; a: string }[];
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base) || `post-${nanoid(6)}`;
  let i = 1;
  while (true) {
    const exists = db()
      .prepare<[string], { c: number }>(
        `SELECT COUNT(*) AS c FROM blogs WHERE slug = ?`,
      )
      .get(slug);
    if (!exists || exists.c === 0) return slug;
    i += 1;
    slug = `${slugify(base)}-${i}`;
    if (i > 50) return `${slug}-${nanoid(4)}`;
  }
}

export async function generateBlogForRequest(requestId: string): Promise<Blog> {
  const req = getRequest(requestId);
  if (!req) throw new Error("Request not found");
  const settings = getSettings();

  updateRequest(requestId, { status: "processing", last_error: null });
  logEvent("request.generate.start", req.label, { requestId });

  const retrievalQuery = [req.topic, req.keywords.join(" ")].join(" ").trim();
  const top = retrieve(requestId, retrievalQuery, 10);
  const fallback = top.length === 0 ? requestCorpusSnippet(requestId, 5000) : "";
  const sourceBlock =
    top.length > 0
      ? top.map((c, i) => `Snippet ${i + 1}:\n${c.content}`).join("\n\n")
      : fallback
        ? `Resource excerpts:\n${fallback}`
        : "No supporting resources provided.";

  const prompt = `Brand: ${settings.brand_name}
Brand voice: ${settings.brand_tone}

## Blog request
Label: ${req.label}
Topic / context: ${req.topic}
${req.keywords.length ? `Target keywords: ${req.keywords.join(", ")}` : ""}
${req.instructions ? `Additional instructions: ${req.instructions}` : ""}

## Target length
Approximately ${settings.words_target} words.

## Source material
${sourceBlock}

Write the blog post. Respond with JSON of shape:
{
  "title": string,            // strong, SEO-aware title (≤ 70 chars ideal)
  "meta_title": string,       // ≤ 60 chars
  "meta_desc": string,        // 140–160 chars
  "excerpt": string,          // 1–2 sentence hook
  "content_md": string,       // full body in markdown, NO H1
  "keywords": string[],       // 3–8 keywords / phrases
  "tags": string[],           // 2–5 short tags
  "faq": [ { "q": string, "a": string } ]   // 3–5 FAQ items
}
No prose outside JSON.`;

  let out: WriterOutput;
  try {
    out = await llmJson<WriterOutput>({
      system: WRITER_SYSTEM,
      prompt,
      maxTokens: 6000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateRequest(requestId, { status: "failed", last_error: msg });
    logEvent("request.generate.fail", msg, { requestId });
    throw err;
  }

  const banner = generateBanner({ title: out.title, brand: settings.brand_name });
  const slug = await uniqueSlug(out.title);
  const id = nanoid(12);
  const schema = {
    blog: blogJsonLd({
      title: out.title,
      description: out.meta_desc,
      url: `/blog/${slug}`,
      brand: settings.brand_name,
      image: banner.url,
    }),
    faq: faqJsonLd(out.faq),
  };

  // Default to draft. The queue/cron step decides whether to schedule or
  // auto-publish based on settings.publish_mode.
  db()
    .prepare(
      `INSERT INTO blogs (id, request_id, title, slug, excerpt, content_md, meta_title, meta_desc,
                          keywords_json, tags_json, faq_json, schema_json,
                          banner_url, banner_alt, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    )
    .run(
      id,
      requestId,
      out.title,
      slug,
      out.excerpt,
      out.content_md,
      out.meta_title,
      out.meta_desc,
      JSON.stringify(out.keywords ?? []),
      JSON.stringify(out.tags ?? []),
      JSON.stringify(out.faq ?? []),
      JSON.stringify(schema),
      banner.url,
      banner.alt,
    );

  updateRequest(requestId, { status: "draft", blog_id: id, last_error: null });
  logEvent("request.generate.ok", out.title, { requestId, blogId: id });
  const blog = getBlogByRequest(requestId);
  if (!blog) throw new Error("Blog persisted but could not be re-read");
  return blog;
}
