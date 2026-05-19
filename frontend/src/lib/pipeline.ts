import { nanoid } from "nanoid";
import { z } from "zod";
import { db, logEvent } from "./db";
import { getSettings } from "./settings";
import { llmJsonValidated, llmText } from "./ai";
import { retrieve, requestCorpusSnippet, retrieveFromPool } from "./rag";
import { keywordSlug, jsonLdObjects } from "./seo";
import { generateBanner, resolveInlineImages } from "./images";
import { getRequest, updateRequest } from "./requests";
import { getBlog, getBlogByRequest, updateBlog } from "./blogs";
import { resolveInternalLinks } from "./internalLinks";
import { runQualityChecks } from "./quality";
import { Blog } from "./types";
import {
  DEFAULT_BODY_SYSTEM,
  DEFAULT_BODY_USER,
  DEFAULT_OUTLINE_SYSTEM,
  DEFAULT_OUTLINE_USER,
  OUTLINE_JSON_SCHEMA_BLOCK,
} from "./prompts";

/**
 * Tiny template engine — expands `{{name}}` against a vars map. Unknown
 * placeholders are left literal so typos surface in the model output rather
 * than being silently dropped.
 */
function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? vars[name]
      : `{{${name}}}`,
  );
}

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

// Zod gates are deliberately wide — they catch garbage (empty strings, model
// hallucinating a paragraph in a title field) but don't enforce SEO best
// practice. Soft constraints (Flesch range, density 0.5–2%, title_tag 50–60,
// meta_desc 150–160) live in quality.ts and surface as warnings on the blog
// detail page instead of failing the whole generation. This keeps the
// pipeline robust against Groq output that's slightly off-target.
const OutlineSchema = z.object({
  title_tag: z
    .string()
    .min(10, "title_tag must be at least 10 chars")
    .max(80, "title_tag must be at most 80 chars"),
  meta_description: z
    .string()
    .min(50, "meta_description must be at least 50 chars")
    .max(200, "meta_description must be at most 200 chars"),
  h1: z.string().min(5, "h1 must be at least 5 chars").max(160),
  slug_seed: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "slug_seed must be kebab-case ascii")
    .optional(),
  primary_keyword: z.string().min(2).max(80),
  secondary_keywords: z.array(z.string().min(2).max(80)).min(2).max(8),
  tldr: z.string().min(50).max(700),
  excerpt: z.string().min(20).max(320),
  tags: z.array(z.string().min(2).max(40)).min(1).max(8),
  outline: z
    .array(
      z.object({
        heading: z.string().min(3).max(160),
        bullets: z.array(z.string().min(3).max(280)).min(1).max(8),
      }),
    )
    .min(3)
    .max(10),
  faq: z
    .array(
      z.object({
        q: z.string().min(5).max(240),
        a: z.string().min(15).max(900),
      }),
    )
    .min(2)
    .max(8),
  sources: z.array(z.string().url()).max(15).default([]),
});

type Outline = z.infer<typeof OutlineSchema>;

// System messages now come from settings — see DEFAULT_OUTLINE_SYSTEM /
// DEFAULT_BODY_SYSTEM in prompts.ts for the platform defaults. Empty values
// fall back to those defaults at call time.

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
  // Per-request resources first — the admin attached them explicitly so they
  // should anchor the writing.
  const top = retrieve(requestId, retrievalQuery, 10);
  // Pool resources second — looked up by tag overlap. Skipped if the request
  // has no tags.
  const poolHits = retrieveFromPool(retrievalQuery, req.tags ?? [], 6);
  const fallback =
    top.length === 0 && poolHits.length === 0
      ? requestCorpusSnippet(requestId, 5000)
      : "";

  const sourceParts: string[] = [];
  if (top.length > 0) {
    sourceParts.push(
      top
        .map((c, i) => `Snippet ${i + 1} (attached):\n${c.content}`)
        .join("\n\n"),
    );
  }
  if (poolHits.length > 0) {
    sourceParts.push(
      poolHits
        .map(
          (c, i) =>
            `Pool snippet ${i + 1} (from "${c.resource_name}", tags: ${c.tags.join(", ")}):\n${c.content}`,
        )
        .join("\n\n"),
    );
  }
  if (sourceParts.length === 0 && fallback) {
    sourceParts.push(`Resource excerpts:\n${fallback}`);
  }
  const sourceBlock =
    sourceParts.join("\n\n---\n\n") || "No supporting resources provided.";

  if (poolHits.length > 0) {
    logEvent(
      "pool.retrieve",
      `request=${requestId} tags=${(req.tags ?? []).join(",")} hits=${poolHits.length}`,
      { requestId },
    );
  }

  // ── Step 1: outline + metadata with Zod validation + 2 retries ──
  const baseVars: Record<string, string> = {
    brand_name: settings.brand_name,
    brand_tone: settings.brand_tone,
    label: req.label,
    topic: req.topic,
    keywords_block: req.keywords.length
      ? `Target keywords (use the most relevant as primary_keyword): ${req.keywords.join(", ")}\n`
      : "",
    instructions_block: req.instructions
      ? `Additional instructions: ${req.instructions}\n`
      : "",
    source_block: sourceBlock,
    json_schema: OUTLINE_JSON_SCHEMA_BLOCK,
  };

  const outlineTemplate =
    settings.outline_user_template?.trim() || DEFAULT_OUTLINE_USER;
  const outlinePrompt = renderTemplate(outlineTemplate, baseVars);

  let outline: Outline;
  try {
    outline = await llmJsonValidated<Outline>({
      system: settings.outline_system_prompt?.trim() || DEFAULT_OUTLINE_SYSTEM,
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
  // Hybrid-image hint: tells the body writer to drop `[[image: query]]`
  // placeholders when inline images are turned on AND a Pexels key exists.
  // Expands to empty string when off — keeps the default template clean.
  const inlineImagesEnabled =
    (settings.inline_images_max ?? 0) > 0 && !!settings.pexels_api_key;
  const inlineImageInstructions = inlineImagesEnabled
    ? `## Inline images
Drop ${Math.min(settings.inline_images_max, 5)} short [[image: search query]] placeholders inline at natural points where a photograph strengthens the post. Each query should be 2–5 concrete words a stock-photo library could match (e.g. [[image: cement plant rotary kiln]], [[image: industrial dashboard team]]). The platform resolves these to real photos automatically — DO NOT write markdown image syntax yourself.

`
    : "";

  const bodyVars: Record<string, string> = {
    ...baseVars,
    h1: outline.h1,
    title_tag: outline.title_tag,
    meta_description: outline.meta_description,
    primary_keyword: outline.primary_keyword,
    secondary_keywords: outline.secondary_keywords.join(", "),
    tldr: outline.tldr,
    outline: outlineForBody,
    words_target: String(settings.words_target),
    inline_image_instructions: inlineImageInstructions,
  };
  const bodyTemplate =
    settings.body_user_template?.trim() || DEFAULT_BODY_USER;
  const bodyPrompt = renderTemplate(bodyTemplate, bodyVars);

  let body: string;
  try {
    body = await llmText({
      system: settings.body_system_prompt?.trim() || DEFAULT_BODY_SYSTEM,
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

  // ── Step 3b: resolve [[image: …]] placeholders with Pexels (hybrid mode) ──
  // Hero comes from the configured image_provider; inline body images always
  // come from Pexels because real photos read more credibly than AI for B2B.
  const inlineMax = settings.inline_images_max ?? 0;
  const inlineResult = await resolveInlineImages(body, inlineMax);
  body = inlineResult.body;
  if (inlineResult.resolved || inlineResult.skipped) {
    logEvent(
      "inline_images.resolve",
      `resolved=${inlineResult.resolved} skipped=${inlineResult.skipped}`,
      { requestId },
    );
  }

  // ── Step 4: banner ──
  const banner = await generateBanner({
    title: outline.h1,
    description: outline.meta_description,
    brand: settings.brand_name,
    primary_keyword: outline.primary_keyword,
  });

  // ── Step 5: persist initial draft so quality checks can reference its id ──
  // Regenerating a request should REPLACE the existing draft, not pile up
  // a second one. We delete any non-published blog rows tied to this request
  // before inserting the fresh draft. Published rows are preserved (the UI
  // already blocks regenerate while a request is in 'published' state, so
  // this is only a defensive guard).
  const removed = db()
    .prepare(
      `DELETE FROM blogs WHERE request_id = ? AND status NOT IN ('published','publishing')`,
    )
    .run(requestId);
  if (removed.changes > 0) {
    logEvent(
      "request.generate.replace",
      `replaced ${removed.changes} prior draft${removed.changes === 1 ? "" : "s"}`,
      { requestId },
    );
  }

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
         primary_keyword, secondary_keywords_json,
         sources_json, internal_links_resolved
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft',
               ?, ?, ?, ?)`,
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
      outline.primary_keyword,
      JSON.stringify(outline.secondary_keywords),
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
