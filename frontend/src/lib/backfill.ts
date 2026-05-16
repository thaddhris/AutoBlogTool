import { z } from "zod";
import { logEvent } from "./db";
import { getBlog, listBlogs, updateBlog } from "./blogs";
import { getSettings } from "./settings";
import { llmJsonValidated } from "./ai";
import { runQualityChecks } from "./quality";
import { jsonLdObjects } from "./seo";
import { Blog } from "./types";

const BackfillSchema = z.object({
  title_tag: z.string().min(20).max(60),
  meta_description: z.string().min(120).max(165),
  h1: z.string().min(10).max(120),
  primary_keyword: z.string().min(2).max(80),
  secondary_keywords: z.array(z.string().min(2).max(80)).min(3).max(6),
  focus_intent: z.enum(["informational", "commercial", "transactional"]),
  tldr: z.string().min(80).max(500),
});

type BackfillFields = z.infer<typeof BackfillSchema>;

const BACKFILL_SYSTEM = `You are an SEO content strategist for an industrial AI / IIoT platform.
Given an existing blog post you produce missing SEO metadata that fits the body.
Strictly obey character limits. Respond with valid JSON exactly matching the requested schema.`;

function isBlank(s: string | null | undefined): boolean {
  return !s || !s.trim();
}

function needsBackfill(blog: Blog): boolean {
  return (
    isBlank(blog.meta_title) ||
    isBlank(blog.meta_desc) ||
    !blog.h1 ||
    !blog.primary_keyword ||
    !blog.tldr ||
    !blog.focus_intent ||
    blog.secondary_keywords.length === 0
  );
}

async function fetchBackfill(blog: Blog): Promise<BackfillFields> {
  const settings = getSettings();
  const bodyExcerpt = blog.content_md.slice(0, 4000);
  const prompt = `Brand: ${settings.brand_name}
Brand voice: ${settings.brand_tone}

## Existing blog title
${blog.title}

## Existing slug
${blog.slug}

## Existing keywords (legacy)
${blog.keywords.join(", ") || "(none)"}

## Existing meta title (may be empty)
${blog.meta_title || "(empty)"}

## Existing meta description (may be empty)
${blog.meta_desc || "(empty)"}

## Body (first ~4000 chars)
${bodyExcerpt}

Produce a JSON object with these fields, respecting character limits:
- "title_tag" (20–60 chars, primary keyword near the start)
- "meta_description" (120–165 chars, action-oriented, mentions primary keyword)
- "h1" (10–120 chars, on-page headline; may differ from title_tag)
- "primary_keyword" (single head keyword phrase)
- "secondary_keywords" (3–6 related/LSI keywords)
- "focus_intent" (one of "informational" | "commercial" | "transactional")
- "tldr" (2–3 sentence answer to the search intent, 80–500 chars)

Base everything on what the post actually says — do not invent topics it doesn't cover.
No prose outside JSON.`;

  return llmJsonValidated<BackfillFields>({
    system: BACKFILL_SYSTEM,
    prompt,
    maxTokens: 1500,
    validate: (raw) => BackfillSchema.parse(raw),
    maxRetries: 2,
  });
}

export interface BackfillResult {
  scanned: number;
  llm_backfilled: number;
  quality_rescored: number;
  schema_refreshed: number;
  errors: { id: string; error: string }[];
}

/**
 * Walk every blog row and bring it up to the Phase-A SEO contract:
 *   1. If SEO metadata is missing, call the LLM to fill it in (one shot per
 *      blog, 2 retries on schema failure).
 *   2. Re-run readability/density/uniqueness scoring — cheap, no LLM.
 *   3. Rebuild the schema_json JSON-LD payload from the now-complete fields.
 *
 * Safe to re-run. Skips the LLM step on blogs that already have all SEO
 * fields populated.
 */
export async function backfillAllBlogs(opts?: {
  /** Pass true to skip the LLM step entirely (cheap, no-cost recompute). */
  metricsOnly?: boolean;
  /** Limit how many blogs we touch (for test runs). */
  limit?: number;
}): Promise<BackfillResult> {
  const blogs = listBlogs({ limit: opts?.limit ?? 1000 });
  const out: BackfillResult = {
    scanned: blogs.length,
    llm_backfilled: 0,
    quality_rescored: 0,
    schema_refreshed: 0,
    errors: [],
  };

  for (const b of blogs) {
    try {
      // ── 1. LLM-fill missing SEO fields ──
      if (!opts?.metricsOnly && needsBackfill(b)) {
        try {
          const f = await fetchBackfill(b);
          updateBlog(b.id, {
            meta_title: isBlank(b.meta_title) ? f.title_tag : b.meta_title,
            meta_desc: isBlank(b.meta_desc) ? f.meta_description : b.meta_desc,
            h1: b.h1 ?? f.h1,
            primary_keyword: b.primary_keyword ?? f.primary_keyword,
            secondary_keywords:
              b.secondary_keywords.length > 0
                ? b.secondary_keywords
                : f.secondary_keywords,
            focus_intent: b.focus_intent ?? f.focus_intent,
            tldr: b.tldr ?? f.tldr,
          });
          out.llm_backfilled++;
          logEvent("backfill.llm.ok", b.title, { blogId: b.id });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          out.errors.push({ id: b.id, error: `llm: ${msg}` });
          logEvent("backfill.llm.fail", msg, { blogId: b.id });
          // continue — we can still do metric + schema steps with whatever's there
        }
      }

      // ── 2. Re-run quality metrics on whatever we have now ──
      const fresh = getBlog(b.id) ?? b;
      const qc = runQualityChecks({
        content_md: fresh.content_md,
        primary_keyword: fresh.primary_keyword,
        title_tag: fresh.meta_title,
        meta_description: fresh.meta_desc,
        blog_id: fresh.id,
      });
      updateBlog(b.id, {
        readability_score: qc.readability_score,
        keyword_density: qc.keyword_density,
        uniqueness_score: qc.uniqueness_score,
        word_count: qc.word_count,
        claims_to_verify: qc.claims_to_verify,
        quality_warnings: qc.warnings,
      });
      out.quality_rescored++;

      // ── 3. Rebuild JSON-LD ──
      const final = getBlog(b.id) ?? b;
      const schema = jsonLdObjects(final);
      updateBlog(b.id, { schema_json: JSON.stringify(schema) });
      out.schema_refreshed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push({ id: b.id, error: msg });
      logEvent("backfill.error", msg, { blogId: b.id });
    }
  }
  logEvent(
    "backfill.run.done",
    `scanned=${out.scanned} llm=${out.llm_backfilled} metrics=${out.quality_rescored} errors=${out.errors.length}`,
  );
  return out;
}
