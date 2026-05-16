import { nanoid } from "nanoid";
import { db, logEvent } from "./db";
import { getSettings } from "./settings";
import { llmJson, llmText } from "./ai";
import { retrieve, requestCorpusSnippet } from "./rag";
import { slugify, blogJsonLd, faqJsonLd } from "./seo";
import { generateBanner } from "./images";
import { getRequest, updateRequest } from "./requests";
import { getBlogByRequest } from "./blogs";
import { Blog } from "./types";

// Generation is split into two LLM calls to avoid Groq's strict JSON mode
// rejecting long markdown payloads that aren't perfectly escaped inside a
// JSON string value:
//   1. Outline call  → JSON metadata (title, meta, FAQ, keywords, outline)
//   2. Body call     → plain markdown body, guided by the outline
// This trades one extra round-trip for a much higher success rate.

const OUTLINE_SYSTEM = `You are an SEO content strategist for an industrial AI / IIoT platform.
Given a topic brief and source snippets, you produce blog post metadata and a section outline.
Always respond with the exact JSON shape requested. No prose outside JSON.`;

const BODY_SYSTEM = `You are a senior B2B content writer for an industrial AI / IIoT platform.
You write SEO-optimized blog posts that read like a thoughtful human expert wrote them — concrete, useful, never robotic.
Hard rules:
- Use the supplied source snippets faithfully. Do not invent specific stats, customer names, or product features that aren't in the snippets, brand context, or topic brief.
- Output ONLY Markdown. No JSON, no preamble, no closing remarks.
- Use H2 (##) for sections and H3 (###) for sub-sections. Short paragraphs, bullet lists where helpful.
- Include a "## Key takeaways" section near the end.
- Include a clear call-to-action paragraph at the very end.
- DO NOT include the title as an H1 — the platform renders it separately.`;

interface OutlineOutput {
  title: string;
  meta_title: string;
  meta_desc: string;
  excerpt: string;
  keywords: string[];
  tags: string[];
  outline: { heading: string; bullets: string[] }[];
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

  const briefBlock = `Brand: ${settings.brand_name}
Brand voice: ${settings.brand_tone}

## Blog request
Label: ${req.label}
Topic / context: ${req.topic}
${req.keywords.length ? `Target keywords: ${req.keywords.join(", ")}` : ""}
${req.instructions ? `Additional instructions: ${req.instructions}` : ""}

## Source material
${sourceBlock}`;

  // --- Step 1: outline + metadata as JSON ---
  const outlinePrompt = `${briefBlock}

Produce the blog post metadata and a section outline. Respond with JSON of shape:
{
  "title": string,            // strong, SEO-aware title (≤ 70 chars ideal)
  "meta_title": string,       // ≤ 60 chars
  "meta_desc": string,        // 140–160 chars
  "excerpt": string,          // 1–2 sentence hook
  "keywords": string[],       // 3–8 keywords / phrases
  "tags": string[],           // 2–5 short tags
  "outline": [                // 4–7 sections (excluding intro), in order
    { "heading": string, "bullets": string[] }  // 2–5 bullets per section
  ],
  "faq": [ { "q": string, "a": string } ]      // 3–5 FAQ items
}
No prose outside JSON.`;

  let outline: OutlineOutput;
  try {
    outline = await llmJson<OutlineOutput>({
      system: OUTLINE_SYSTEM,
      prompt: outlinePrompt,
      maxTokens: 2000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateRequest(requestId, { status: "failed", last_error: msg });
    logEvent("request.generate.fail", `outline: ${msg}`, { requestId });
    throw err;
  }

  // --- Step 2: full markdown body, guided by the outline ---
  const outlineForBody = outline.outline
    .map(
      (s, i) =>
        `${i + 1}. ${s.heading}\n${s.bullets.map((b) => `   - ${b}`).join("\n")}`,
    )
    .join("\n");
  const bodyPrompt = `${briefBlock}

## Approved title
${outline.title}

## Approved outline (follow this; each numbered item is an H2 section)
${outlineForBody}

## Target length
Approximately ${settings.words_target} words total.

Now write the full blog post body in Markdown.
- Start with a 1–2 paragraph intro before the first ## heading.
- Follow the outline order. Each numbered item becomes an H2 (##). Use H3 (###) for sub-points if needed.
- End with a "## Key takeaways" bullet list and then a final CTA paragraph.
- Do NOT include the title as an H1.
- Do NOT include any text outside the markdown body (no JSON, no prefaces).`;

  let body: string;
  try {
    body = await llmText({
      system: BODY_SYSTEM,
      prompt: bodyPrompt,
      maxTokens: 5000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateRequest(requestId, { status: "failed", last_error: msg });
    logEvent("request.generate.fail", `body: ${msg}`, { requestId });
    throw err;
  }

  // Strip accidental leading H1 (some models add it even when told not to)
  body = body.replace(/^\s*#\s+[^\n]+\n+/, "");
  // Some models wrap in ```markdown … ``` — peel that
  body = body
    .replace(/^```(?:markdown|md)?\s*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();

  const banner = generateBanner({
    title: outline.title,
    brand: settings.brand_name,
  });
  const slug = await uniqueSlug(outline.title);
  const id = nanoid(12);
  const schema = {
    blog: blogJsonLd({
      title: outline.title,
      description: outline.meta_desc,
      url: `/blog/${slug}`,
      brand: settings.brand_name,
      image: banner.url,
    }),
    faq: faqJsonLd(outline.faq),
  };

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
      outline.title,
      slug,
      outline.excerpt,
      body,
      outline.meta_title,
      outline.meta_desc,
      JSON.stringify(outline.keywords ?? []),
      JSON.stringify(outline.tags ?? []),
      JSON.stringify(outline.faq ?? []),
      JSON.stringify(schema),
      banner.url,
      banner.alt,
    );

  updateRequest(requestId, { status: "draft", blog_id: id, last_error: null });
  logEvent("request.generate.ok", outline.title, { requestId, blogId: id });
  const blog = getBlogByRequest(requestId);
  if (!blog) throw new Error("Blog persisted but could not be re-read");
  return blog;
}
