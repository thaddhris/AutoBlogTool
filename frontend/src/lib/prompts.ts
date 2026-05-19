/**
 * Default prompts for the two-pass blog generation pipeline.
 *
 * All four strings (two system messages + two user-message templates) are
 * editable per-install via Settings → Generation prompts. The pipeline reads
 * the saved value, or falls back to these defaults when the saved string is
 * empty (so a user-cleared field self-heals on the next generation).
 *
 * The user-message templates use a simple `{{placeholder}}` substitution
 * grammar. Unknown placeholders are left literal so typos surface in the
 * model output rather than getting silently dropped.
 */

// ─── SYSTEM MESSAGES ────────────────────────────────────────────────────────

export const DEFAULT_OUTLINE_SYSTEM = `You are an SEO content strategist for an industrial AI / IIoT platform.
Given a topic brief and source snippets you produce blog post metadata and a section outline.
You strictly obey character limits — they are hard requirements, not suggestions.
Always respond with valid JSON exactly matching the requested schema. No prose, no preface.`;

export const DEFAULT_BODY_SYSTEM = `You are a senior B2B content writer for an industrial AI / IIoT platform.
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

// ─── USER-MESSAGE TEMPLATES ─────────────────────────────────────────────────

/**
 * Schema description + JSON shape expected from the outline call. Inserted
 * into the outline user template via the `{{json_schema}}` placeholder.
 * Hardcoded because changing it without updating Zod will break validation —
 * users edit the template AROUND this block, not inside it.
 */
export const OUTLINE_JSON_SCHEMA_BLOCK = `Produce blog post metadata and a section outline as JSON. Hard requirements:
- "title_tag": SEO title, **20–60 chars**, primary keyword near the start.
- "meta_description": **120–165 chars** (target 150–160), action-oriented, includes the primary keyword.
- "h1": on-page headline, may differ from title_tag, **10–120 chars**.
- "slug_seed" (optional): kebab-case, 3–5 words, keyword-led, e.g. "oee-basics-plant-managers".
- "primary_keyword": single string, the head keyword.
- "secondary_keywords": **3–6** related/LSI keywords, no overlap with primary.
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
  "tldr": string,
  "excerpt": string,
  "tags": string[],
  "outline": [{ "heading": string, "bullets": string[] }],
  "faq": [{ "q": string, "a": string }],
  "sources": string[]
}
No prose outside JSON.`;

export const DEFAULT_OUTLINE_USER = `Brand: {{brand_name}}
Brand voice: {{brand_tone}}

## Blog request
Label: {{label}}
Topic / context: {{topic}}
{{keywords_block}}{{instructions_block}}
## Source material
{{source_block}}

{{json_schema}}`;

export const DEFAULT_BODY_USER = `Brand: {{brand_name}}
Brand voice: {{brand_tone}}

## Blog request
Label: {{label}}
Topic / context: {{topic}}
{{keywords_block}}{{instructions_block}}
## Source material
{{source_block}}

## Approved h1
{{h1}}

## Approved outline (follow this; each numbered item is an H2 section)
{{outline}}

## Target length
Approximately {{words_target}} words total.

Now write the full blog post body in Markdown.
- Open with a 1–2 paragraph intro that hooks the reader and previews the post. Do NOT include a "TL;DR" heading or block.
- Follow the outline order. Each numbered item becomes an H2 (##). Use H3 (###) for sub-points if needed.
- Include AT LEAST one bullet list AND one markdown table somewhere in the body.
- Include 2–3 internal-link placeholders shaped like [[related: short topic or keyword]] — these will be resolved automatically by the platform.
- End with a "## Key takeaways" bullet list (3–5 items) and a final CTA paragraph.
- Do NOT include the title as an H1.
- Do NOT include any text outside the markdown body (no JSON, no prefaces).`;

// ─── available placeholder docs (used by the Settings UI) ───────────────────

export interface PlaceholderDoc {
  name: string;
  description: string;
  example: string;
}

export const OUTLINE_PLACEHOLDERS: PlaceholderDoc[] = [
  { name: "brand_name", description: "Settings → Brand name", example: "Faclon Labs" },
  { name: "brand_tone", description: "Settings → Voice / tone guidance", example: "Authoritative, technical-but-accessible…" },
  { name: "label", description: "Blog Request → label", example: "Why predictive maintenance matters" },
  { name: "topic", description: "Blog Request → topic / context", example: "Predictive maintenance for rotary kilns…" },
  {
    name: "keywords_block",
    description:
      "Pre-formatted target-keywords line if any keywords are set on the request, else empty",
    example: "Target keywords (use the most relevant as primary_keyword): X, Y, Z\\n",
  },
  {
    name: "instructions_block",
    description:
      "Pre-formatted additional-instructions line if instructions are set on the request, else empty",
    example: "Additional instructions: keep it under 1000 words\\n",
  },
  { name: "source_block", description: "Top FTS5-retrieved snippets from attached resources, or fallback corpus", example: "Snippet 1: …\\nSnippet 2: …" },
  { name: "json_schema", description: "Locked schema description + JSON shape contract. Drop where you want the schema requirement to appear.", example: "Produce blog post metadata… { \"title_tag\": string, … }" },
];

export const BODY_PLACEHOLDERS: PlaceholderDoc[] = [
  ...OUTLINE_PLACEHOLDERS.filter((p) => p.name !== "json_schema"),
  { name: "h1", description: "outline.h1 from the outline pass", example: "Predictive Maintenance for Cement Plants" },
  { name: "title_tag", description: "outline.title_tag", example: "Predictive Maintenance: Cement Plant Guide" },
  { name: "meta_description", description: "outline.meta_description", example: "Reduce unplanned downtime…" },
  { name: "primary_keyword", description: "outline.primary_keyword", example: "predictive maintenance" },
  { name: "secondary_keywords", description: "outline.secondary_keywords, comma-joined", example: "cement plant, rotary kiln, IoT" },
  { name: "tldr", description: "outline.tldr — the 2–3 sentence answer", example: "Predictive maintenance cuts downtime by…" },
  { name: "outline", description: "Rendered outline (numbered list with bullets)", example: "1. Heading\\n   - bullet\\n   - bullet" },
  { name: "words_target", description: "Settings → Target word count", example: "1200" },
  {
    name: "inline_image_instructions",
    description:
      "Hybrid-image hint that asks the LLM to drop [[image: query]] placeholders for inline Pexels photos. Expands to empty when inline_images_max = 0 or Pexels key missing. Place this just before 'Now write the full blog post body…' so the model sees it as a prerequisite.",
    example: "## Inline images\\nDrop 2 short [[image: …]] placeholders inline…",
  },
];
