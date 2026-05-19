import { z } from "zod";
import { llmJsonValidated } from "./ai";
import { getSettings } from "./settings";
import { runQualityChecks } from "./quality";
import { Blog, LlmSeoAudit, SeoAudit } from "./types";

// ─── Shared deterministic facts ────────────────────────────────────────────
//
// Both auditors get the same factual brief so their scores are comparable and
// not biased by what each one happens to "look at" in the body.

function buildFactsBlock(blog: Blog, qcSummary: string): string {
  const facts = [
    `Title (admin): ${blog.title}`,
    `Title tag: ${blog.meta_title || "(empty)"}`,
    `Meta description: ${blog.meta_desc || "(empty)"}`,
    `H1: ${blog.h1 || blog.title}`,
    `Slug: ${blog.slug}`,
    `TL;DR: ${blog.tldr || "(empty)"}`,
    `Excerpt: ${blog.excerpt || "(empty)"}`,
    `Primary keyword: ${blog.primary_keyword || "(empty)"}`,
    `Secondary keywords: ${blog.secondary_keywords.join(", ") || "(empty)"}`,
    `Tags (general): ${blog.tags.join(", ") || "(empty)"}`,
    `Hero image alt text: ${blog.banner_alt || "(empty)"}`,
    `Schema.org JSON-LD bytes: ${blog.schema_json ? blog.schema_json.length : 0}`,
    `Internal links resolved: ${blog.internal_links_resolved}`,
    `Sources cited: ${blog.sources.length}`,
    `FAQ items: ${blog.faq.length}`,
    `Word count: ${blog.word_count ?? "(unknown)"}`,
  ];
  return `## Blog under audit\n\n${facts.join("\n")}\n\n## Computed quality metrics (server-side, deterministic)\n${qcSummary}\n\n## Current FAQ\n${
    blog.faq.length === 0
      ? "(no FAQ items)"
      : blog.faq.map((f, i) => `${i + 1}. ${f.q}\n   → ${f.a}`).join("\n")
  }`;
}

function buildBodyExcerpt(blog: Blog, maxChars: number): string {
  return blog.content_md.length > maxChars
    ? blog.content_md.slice(0, maxChars) + "\n\n[…truncated for audit…]"
    : blog.content_md;
}

function buildQcSummary(blog: Blog): string {
  const qc = runQualityChecks({
    content_md: blog.content_md,
    primary_keyword: blog.primary_keyword,
    title_tag: blog.meta_title,
    meta_description: blog.meta_desc,
    blog_id: blog.id,
  });
  return [
    `Flesch reading ease: ${qc.readability_score ?? "n/a"} (target 50–75)`,
    `Primary keyword density: ${
      qc.keyword_density === null
        ? "n/a (no primary keyword set)"
        : `${(qc.keyword_density * 100).toFixed(2)}% (target 0.5%–2%)`
    }`,
    `Uniqueness (max sim. vs other posts): ${
      qc.uniqueness_score === null
        ? "n/a"
        : `${(qc.uniqueness_score * 100).toFixed(1)}% (target < 85%)`
    }`,
    `Word count: ${qc.word_count}`,
    `Title tag length: ${blog.meta_title.length} chars (target 50–60)`,
    `Meta description length: ${blog.meta_desc.length} chars (target 150–160)`,
    `Server-flagged warnings: ${qc.warnings.length}${
      qc.warnings.length
        ? "\n  - " + qc.warnings.map((w) => w.message).join("\n  - ")
        : ""
    }`,
  ].join("\n");
}

// ─── Traditional SEO ───────────────────────────────────────────────────────

const TraditionalAspectSchema = z.object({
  score: z.number().min(0).max(100),
  notes: z.array(z.string().min(3).max(280)).min(1).max(6),
});

const TRADITIONAL_ASPECT_KEYS = [
  "keyword_optimization",
  "metadata",
  "heading_structure",
  "readability",
  "internal_linking",
  "schema_markup",
  "alt_text",
  "content_structure",
] as const;

const TraditionalRecommendationSchema = z.object({
  priority: z.enum(["high", "medium", "low"]),
  aspect: z.enum(TRADITIONAL_ASPECT_KEYS),
  action: z.string().min(8).max(320),
  field: z
    .enum(["title_tag", "meta_description", "excerpt", "tldr", "faq"])
    .optional(),
});

const RewritesSchema = z
  .object({
    title_tag: z.string().min(10).max(80).optional(),
    meta_description: z.string().min(50).max(220).optional(),
    excerpt: z.string().min(20).max(320).optional(),
    tldr: z.string().min(50).max(700).optional(),
    faq: z
      .array(
        z.object({
          q: z.string().min(5).max(240),
          a: z.string().min(15).max(900),
        }),
      )
      .min(2)
      .max(8)
      .optional(),
  })
  .default({});

const TraditionalAuditSchema = z.object({
  overall_score: z.number().min(0).max(100),
  aspects: z.object({
    keyword_optimization: TraditionalAspectSchema,
    metadata: TraditionalAspectSchema,
    heading_structure: TraditionalAspectSchema,
    readability: TraditionalAspectSchema,
    internal_linking: TraditionalAspectSchema,
    schema_markup: TraditionalAspectSchema,
    alt_text: TraditionalAspectSchema,
    content_structure: TraditionalAspectSchema,
  }),
  recommendations: z.array(TraditionalRecommendationSchema).min(1).max(20),
  rewrites: RewritesSchema,
});

type TraditionalPayload = z.infer<typeof TraditionalAuditSchema>;

const TRADITIONAL_SYSTEM = `You are an experienced SEO auditor for B2B industrial AI / IIoT blogs.
You score a blog post against a fixed rubric of traditional search-engine ranking factors and emit concrete, actionable recommendations.
Hard rules:
- Always respond with valid JSON exactly matching the requested schema. No prose.
- Every aspect score is 0–100, where 0 = unusable, 50 = passable, 75 = solid, 90+ = exceptional.
- "Notes" on each aspect are short (1 sentence each) and specific — cite actual fields/numbers where possible.
- Recommendations are actionable. Bad: "improve title". Good: "Title tag is 42 chars; extend to 55–60 to fill the SERP and add the year for freshness."
- If a recommendation can be applied automatically (rewriting a metadata field), set "field" to the field name AND include a better version in "rewrites".
- For "rewrites" you may include any subset; only include a field if your proposed version is genuinely better than the current one.`;

function buildTraditionalPrompt(blog: Blog, qcSummary: string): string {
  return `${buildFactsBlock(blog, qcSummary)}

## Body
${buildBodyExcerpt(blog, 6000)}

---

Score this blog against the eight traditional SEO aspects and emit JSON:

{
  "overall_score": number,                  // 0–100, weighted overall
  "aspects": {
    "keyword_optimization": { "score": number, "notes": string[] },
    "metadata":             { "score": number, "notes": string[] },
    "heading_structure":    { "score": number, "notes": string[] },
    "readability":          { "score": number, "notes": string[] },
    "internal_linking":     { "score": number, "notes": string[] },
    "schema_markup":        { "score": number, "notes": string[] },
    "alt_text":             { "score": number, "notes": string[] },
    "content_structure":    { "score": number, "notes": string[] }
  },
  "recommendations": [
    { "priority": "high"|"medium"|"low",
      "aspect":   one of the eight aspect keys,
      "action":   "specific actionable instruction",
      "field":    (optional) "title_tag"|"meta_description"|"excerpt"|"tldr"|"faq" if auto-fixable }
  ],
  "rewrites": {
    "title_tag":        (optional) string,
    "meta_description": (optional) string,
    "excerpt":          (optional) string,
    "tldr":             (optional) string,
    "faq":              (optional) [{"q":string,"a":string}]
  }
}

Score guidance:
- keyword_optimization: primary keyword in title_tag, H1, first paragraph, and 2–3 H2s. Density 0.5–2%. Secondary keywords woven in naturally without stuffing.
- metadata: title_tag 50–60 chars with keyword at start, meta_description 150–160 chars and action-oriented, slug 3–5 keyword-led words.
- heading_structure: exactly one H1, logical H2/H3 hierarchy, no jumps (e.g. H2 → H4), descriptive headings (not "Introduction").
- readability: short paragraphs (2–4 sentences), Flesch 50–75 ideal for B2B, no walls of text, scannable.
- internal_linking: 2–5 resolved [[related: …]] links pointing to thematically-related published posts; meaningful anchor text.
- schema_markup: presence and completeness of JSON-LD (Article/BlogPosting + FAQPage if FAQ items exist). Penalise empty schema_json.
- alt_text: hero image alt is descriptive (not "image of …"), includes primary keyword naturally when relevant, ≤ 125 chars.
- content_structure: TL;DR up top, clear H2 hierarchy, ≥ 1 bullet list and ≥ 1 table, Key takeaways + CTA at end, FAQ section present.

Only include rewrites where your version is materially better than the current one.
No prose outside JSON.`;
}

// ─── LLM / AI-crawlability SEO ─────────────────────────────────────────────

const LlmAspectSchema = z.object({
  score: z.number().min(0).max(100),
  notes: z.array(z.string().min(3).max(280)).min(1).max(6),
});

const LLM_ASPECT_KEYS = [
  "semantic_clarity",
  "ai_readability",
  "retrieval_friendliness",
  "chunk_quality",
  "answerability",
  "citation_potential",
  "contextual_completeness",
  "embedding_optimization",
  "topic_coverage",
] as const;

const LlmRecommendationSchema = z.object({
  priority: z.enum(["high", "medium", "low"]),
  aspect: z.enum(LLM_ASPECT_KEYS),
  action: z.string().min(8).max(320),
});

const LlmAuditSchema = z.object({
  overall_score: z.number().min(0).max(100),
  aspects: z.object({
    semantic_clarity: LlmAspectSchema,
    ai_readability: LlmAspectSchema,
    retrieval_friendliness: LlmAspectSchema,
    chunk_quality: LlmAspectSchema,
    answerability: LlmAspectSchema,
    citation_potential: LlmAspectSchema,
    contextual_completeness: LlmAspectSchema,
    embedding_optimization: LlmAspectSchema,
    topic_coverage: LlmAspectSchema,
  }),
  recommendations: z.array(LlmRecommendationSchema).min(1).max(20),
});

type LlmAuditPayload = z.infer<typeof LlmAuditSchema>;

const LLM_SYSTEM = `You are an AI-search and retrieval auditor. You score a blog post by how well it can be discovered, ingested, and cited by LLM-driven systems (ChatGPT / Perplexity / Gemini answer panels, RAG pipelines, embedding-based retrievers).
You score independently of any traditional Google SEO rubric. Your concerns are:
  - whether passages stand alone as retrievable units
  - whether claims are self-contained, citable, and grounded
  - whether the prose is free of ambiguity, anaphora, and "as we saw above" back-references that confuse chunked retrieval
  - whether entities, definitions, and units are explicit enough to embed well
Hard rules:
- Always respond with valid JSON exactly matching the requested schema. No prose.
- Every aspect score is 0–100, where 0 = unusable, 50 = passable, 75 = solid, 90+ = exceptional.
- "Notes" on each aspect are short (1 sentence each), grounded in actual passages from the body.
- Recommendations are actionable and rewrite-oriented. Bad: "be clearer". Good: "Paragraph under '## Edge inference' relies on 'this approach' — re-state the approach (federated MQTT ingestion) so the chunk stands alone in retrieval."`;

function buildLlmPrompt(blog: Blog, qcSummary: string): string {
  return `${buildFactsBlock(blog, qcSummary)}

## Body
${buildBodyExcerpt(blog, 6000)}

---

Score this blog against the nine AI-crawlability aspects and emit JSON:

{
  "overall_score": number,
  "aspects": {
    "semantic_clarity":        { "score": number, "notes": string[] },
    "ai_readability":          { "score": number, "notes": string[] },
    "retrieval_friendliness":  { "score": number, "notes": string[] },
    "chunk_quality":           { "score": number, "notes": string[] },
    "answerability":           { "score": number, "notes": string[] },
    "citation_potential":      { "score": number, "notes": string[] },
    "contextual_completeness": { "score": number, "notes": string[] },
    "embedding_optimization":  { "score": number, "notes": string[] },
    "topic_coverage":          { "score": number, "notes": string[] }
  },
  "recommendations": [
    { "priority": "high"|"medium"|"low",
      "aspect":   one of the nine aspect keys,
      "action":   "specific actionable instruction" }
  ]
}

Score guidance:
- semantic_clarity: unambiguous nouns and verbs, defined acronyms on first use, no vague "this/that/it" without a clear referent, explicit subject in each sentence.
- ai_readability: machine-parseable structure — short sentences, one idea per sentence, consistent terminology, no rhetorical flourish that obscures meaning.
- retrieval_friendliness: would an embedding model retrieve the right passage for a user query? Penalise meandering openings, reward headings that contain query-like phrases.
- chunk_quality: when split into 400–800 token chunks, does each chunk stand alone? Penalise heavy cross-references ("as we discussed", "see above"), reward chunks that re-state their subject.
- answerability: would an LLM extract a direct answer to common user questions? Reward explicit Q&A framing, numbered steps, bolded definitions, FAQ.
- citation_potential: are claims phrased so an LLM would cite *this post* as the source? Reward original numbers, named frameworks, distinctive phrasings; penalise generic recaps of common knowledge.
- contextual_completeness: does each section provide enough surrounding context (definitions, units, scope) to stand without the rest of the post?
- embedding_optimization: keyword variety and entity density across the body — synonyms, related concepts, named tools/standards/units. Avoid keyword stuffing; reward semantic breadth.
- topic_coverage: depth and breadth of the topic — does it address sub-questions an LLM would expect under this title? Are there obvious gaps a user would still need to ask elsewhere?

No prose outside JSON.`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function auditTraditionalSeo(blog: Blog): Promise<SeoAudit> {
  const settings = getSettings();
  if (!settings.groq_api_key) {
    throw new Error("Groq API key not configured");
  }
  const qcSummary = buildQcSummary(blog);
  const payload = await llmJsonValidated<TraditionalPayload>({
    system: TRADITIONAL_SYSTEM,
    prompt: buildTraditionalPrompt(blog, qcSummary),
    maxTokens: 4000,
    temperature: 0.2,
    validate: (raw) => TraditionalAuditSchema.parse(raw),
    maxRetries: 2,
  });
  return {
    ...payload,
    rewrites: payload.rewrites ?? {},
    generated_at: new Date().toISOString(),
    blog_updated_at_at_audit: blog.updated_at,
  };
}

export async function auditLlmSeo(blog: Blog): Promise<LlmSeoAudit> {
  const settings = getSettings();
  if (!settings.groq_api_key) {
    throw new Error("Groq API key not configured");
  }
  const qcSummary = buildQcSummary(blog);
  const payload = await llmJsonValidated<LlmAuditPayload>({
    system: LLM_SYSTEM,
    prompt: buildLlmPrompt(blog, qcSummary),
    maxTokens: 4000,
    temperature: 0.2,
    validate: (raw) => LlmAuditSchema.parse(raw),
    maxRetries: 2,
  });
  return {
    ...payload,
    generated_at: new Date().toISOString(),
    blog_updated_at_at_audit: blog.updated_at,
  };
}

/**
 * Back-compat alias. Older callers (and any saved scripts) used `auditBlog`
 * to get the traditional audit. Keep it pointing at the traditional auditor
 * so nothing breaks; new code should call `auditTraditionalSeo` directly.
 */
export const auditBlog = auditTraditionalSeo;
