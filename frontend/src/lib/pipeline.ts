import { nanoid } from "nanoid";
import { z } from "zod";
import { db, logEvent } from "./db";
import { getSettings } from "./settings";
import { llmJsonValidated, llmText } from "./ai";
import { retrieve, requestCorpusSnippet } from "./rag";
import { keywordSlug, jsonLdObjects } from "./seo";
import { generateBanner } from "./images";
import { getRequest, updateRequest } from "./requests";
import { getBlog, getBlogByRequest, updateBlog } from "./blogs";
import { resolveInternalLinks } from "./internalLinks";
import { runQualityChecks } from "./quality";
import { Blog, FocusIntent } from "./types";

// ─── Outline JSON contract ───────────────────────────────────────────────────
//
// We do generation in two LLM calls:
//   1. Outline call — strict JSON, validated with Zod, up to 2 retries.
//      Returns ALL metadata + a per-section outline (heading + bullets).
//   2. Body call — plain markdown, no JSON, guided by the approved outline.
//
// Splitting the markdown out of the JSON dodges the long-string escape failures
// we used to hit with Groq's strict JSON mode. Validation runs on the outline
// only — the body is post-processed mechanically.

const OutlineSchema = z.object({
  title_tag: z
    .string()
    .min(20, "title_tag must be at least 20 chars")
    .max(60, "title_tag must be at most 60 chars"),
  meta_description: z
    .string()
    .min(120, "meta_description must be at least 120 chars")
    .max(165, "meta_description must be at most 165 chars"),
  h1: z.string().min(10, "h1 must be at least 10 chars").max(120),
  slug_seed: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "slug_seed must be kebab-case ascii")
    .optional(),
  primary_keyword: z.string().min(2).max(80),
  secondary_keywords: z.array(z.string().min(2).max(80)).min(3).max(6),
  focus_intent: z.enum([
    "informational",
    "commercial",
    "transactional",
  ]),
  tldr: z.string().min(80).max(500),
  excerpt: z.string().min(40).max(280),
  tags: z.array(z.string().min(2).max(40)).min(2).max(5),
  outline: z
    .array(
      z.object({
        heading: z.string().min(4).max(120),
        bullets: z.array(z.string().min(4).max(220)).min(2).max(6),
      }),
    )
    .min(4)
    .max(8),
  faq: z
    .array(
      z.object({
        q: z.string().min(8).max(200),
        a: z.string().min(20).max(700),
      }),
    )
    .min(3)
    .max(5),
  sources: z.array(z.string().url()).max(10).default([]),
});

type Outline = z.infer<typeof OutlineSchema>;

const OUTLINE_SYSTEM = `You are an SEO content strategist for an industrial AI / IIoT platform.
Given a topic brief and source snippets you produce blog post metadata and a section outline.
You strictly obey character limits — they are hard requirements, not suggestions.
Always respond with valid JSON exactly matching the requested schema. No prose, no preface.`;

const BODY_SYSTEM = `You are a senior B2B content writer for an industrial AI / IIoT platform.
You write SEO-optimized blog posts that read like a thoughtful human expert wrote them — concrete, useful, never robotic.
Hard rules:
- Use the supplied source snippets faithfully. Do not invent specific stats, customer names, or product features that aren't in the snippets, brand context, or topic brief.
- Output ONLY Markdown. No JSON, no preamble, no closing remarks.
- The platform renders the H1 separately from the "h1" field — do NOT include an H1 in the body.
- Use H2 (##) for the section headings provided, H3 (###) for sub-points.
- Keep paragraphs short (2–4 sentences).
- Insert at least one bullet list AND one table.
- Where a related concept could link to another post on the site, drop a placeholder of the form [[related: short keyword or topic]]. Aim for 2–3 placeholders, never more than 5.
- End with a "## Key takeaways" bullet list (3–5 items) then a short, clear call-to-action paragraph.`;

async function uniqueSlug(base: string): Promise<string> {
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
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
${req.keywords.length ? `Target keywords (use the most relevant as primary_keyword): ${req.keywords.join(", ")}` : ""}
${req.instructions ? `Additional instructions: ${req.instructions}` : ""}

## Source material
${sourceBlock}`;

  // ── Step 1: outline + metadata with Zod validation + 2 retries ──
  const outlinePrompt = `${briefBlock}

Produce blog post metadata and a section outline as JSON. Hard requirements:
- "title_tag": SEO title, **20–60 chars**, primary keyword near the start.
- "meta_description": **120–165 chars** (target 150–160), action-oriented, includes the primary keyword.
- "h1": on-page headline, may differ from title_tag, **10–120 chars**.
- "slug_seed" (optional): kebab-case, 3–5 words, keyword-led, e.g. "oee-basics-plant-managers".
- "primary_keyword": single string, the head keyword.
- "secondary_keywords": **3–6** related/LSI keywords, no overlap with primary.
- "focus_intent": one of "informational" | "commercial" | "transactional".
- "tldr": 2–3 sentence answer to the search intent, **80–500 chars**.
- "excerpt": 1–2 sentence hook for listing pages, **40–280 chars**.
- "tags": **2–5** short tags.
- "outline": **4–8** sections. Each has "heading" and **2–6** "bullets".
- "faq": **3–5** real-user questions with answers (20–700 chars each).
- "sources": up to 10 URLs cited in the post (empty array if none).

Respond with JSON of shape:
{
  "title_tag": string,
  "meta_description": string,
  "h1": string,
  "slug_seed": string,
  "primary_keyword": string,
  "secondary_keywords": string[],
  "focus_intent": "informational" | "commercial" | "transactional",
  "tldr": string,
  "excerpt": string,
  "tags": string[],
  "outline": [{ "heading": string, "bullets": string[] }],
  "faq": [{ "q": string, "a": string }],
  "sources": string[]
}
No prose outside JSON.`;

  let outline: Outline;
  try {
    outline = await llmJsonValidated<Outline>({
      system: OUTLINE_SYSTEM,
      prompt: outlinePrompt,
      maxTokens: 3000,
      validate: (raw) => OutlineSchema.parse(raw),
      maxRetries: 2,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateRequest(requestId, { status: "failed", last_error: msg });
    logEvent("request.generate.fail", `outline: ${msg}`, { requestId });
    throw err;
  }

  // ── Step 2: full markdown body, guided by the approved outline ──
  const outlineForBody = outline.outline
    .map(
      (s, i) =>
        `${i + 1}. ${s.heading}\n${s.bullets.map((b) => `   - ${b}`).join("\n")}`,
    )
    .join("\n");
  const bodyPrompt = `${briefBlock}

## Approved h1
${outline.h1}

## Approved outline (follow this; each numbered item is an H2 section)
${outlineForBody}

## TL;DR to include verbatim at the very top under a "## TL;DR" heading
${outline.tldr}

## Target length
Approximately ${settings.words_target} words total.

Now write the full blog post body in Markdown.
- Start with a "## TL;DR" block using the text above, then a 1–2 paragraph intro.
- Follow the outline order. Each numbered item becomes an H2 (##). Use H3 (###) for sub-points if needed.
- Include AT LEAST one bullet list AND one markdown table somewhere in the body.
- Include 2–3 internal-link placeholders shaped like [[related: short topic or keyword]] — these will be resolved automatically by the platform.
- End with a "## Key takeaways" bullet list (3–5 items) and a final CTA paragraph.
- Do NOT include the title as an H1.
- Do NOT include any text outside the markdown body (no JSON, no prefaces).`;

  let body: string;
  try {
    body = await llmText({
      system: BODY_SYSTEM,
      prompt: bodyPrompt,
      maxTokens: 6000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateRequest(requestId, { status: "failed", last_error: msg });
    logEvent("request.generate.fail", `body: ${msg}`, { requestId });
    throw err;
  }

  // Strip accidental leading H1 + ```markdown wrappers
  body = body.replace(/^\s*#\s+[^\n]+\n+/, "");
  body = body
    .replace(/^```(?:markdown|md)?\s*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();

  // ── Step 3: resolve [[related: …]] placeholders ──
  const { body: linkedBody, resolved, skipped } = resolveInternalLinks(body, null);
  body = linkedBody;
  if (resolved || skipped) {
    logEvent(
      "internal_links.resolve",
      `resolved=${resolved} skipped=${skipped}`,
      { requestId },
    );
  }

  // ── Step 4: banner ──
  const banner = await generateBanner({
    title: outline.h1,
    description: outline.meta_description,
    brand: settings.brand_name,
  });

  // ── Step 5: persist initial draft so quality checks can reference its id ──
  const slug = await uniqueSlug(
    outline.slug_seed ?? keywordSlug(outline.h1, outline.primary_keyword),
  );
  const id = nanoid(12);

  db()
    .prepare(
      `INSERT INTO blogs (
         id, request_id, title, slug, excerpt, content_md,
         meta_title, meta_desc,
         keywords_json, tags_json, faq_json, schema_json,
         banner_url, banner_alt, status,
         h1, primary_keyword, secondary_keywords_json,
         focus_intent, tldr, author, sources_json,
         internal_links_resolved
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft',
               ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      requestId,
      outline.h1,
      slug,
      outline.excerpt,
      body,
      outline.title_tag,
      outline.meta_description,
      JSON.stringify([outline.primary_keyword, ...outline.secondary_keywords]),
      JSON.stringify(outline.tags),
      JSON.stringify(outline.faq),
      "{}", // schema_json filled in below once we have the persisted blog
      banner.url,
      banner.alt,
      outline.h1,
      outline.primary_keyword,
      JSON.stringify(outline.secondary_keywords),
      outline.focus_intent as FocusIntent,
      outline.tldr,
      settings.default_author || null,
      JSON.stringify(outline.sources ?? []),
      resolved,
    );

  // ── Step 6: quality checks ──
  const qc = runQualityChecks({
    content_md: body,
    primary_keyword: outline.primary_keyword,
    title_tag: outline.title_tag,
    meta_description: outline.meta_description,
    blog_id: id,
  });

  // ── Step 7: JSON-LD ──
  const persisted = getBlog(id);
  if (!persisted) throw new Error("Blog persisted but not readable");
  const schema = jsonLdObjects(persisted);

  updateBlog(id, {
    schema_json: JSON.stringify(schema),
    readability_score: qc.readability_score,
    keyword_density: qc.keyword_density,
    uniqueness_score: qc.uniqueness_score,
    word_count: qc.word_count,
    claims_to_verify: qc.claims_to_verify,
    quality_warnings: qc.warnings,
  });

  updateRequest(requestId, { status: "draft", blog_id: id, last_error: null });
  logEvent(
    "request.generate.ok",
    `${outline.h1} (warnings: ${qc.warnings.length}, links: ${resolved})`,
    { requestId, blogId: id },
  );
  const blog = getBlogByRequest(requestId);
  if (!blog) throw new Error("Blog persisted but could not be re-read");
  return blog;
}
