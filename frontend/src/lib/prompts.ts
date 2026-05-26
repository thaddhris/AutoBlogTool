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
- "meta_description": **HARD LIMIT 280 chars; target 150–160 chars** (anything past 160 gets truncated by Google in the SERP). Action-oriented, single sentence or two short ones, includes the primary keyword. Do NOT pad with brand boilerplate — count your characters and stop. Example for the right length: "Discover how predictive maintenance cuts downtime in cement plants by 30%. A practical guide to rotary kiln monitoring with Faclon Labs." (140 chars).
- "h1": on-page headline, may differ from title_tag, **10–120 chars**.
- "slug_seed" (optional): kebab-case, 3–5 words, keyword-led, e.g. "oee-basics-plant-managers".
- "primary_keyword": single string, the head keyword.
- "secondary_keywords": **3–6** related/LSI keywords, no overlap with primary.
- "tldr": The "Quick Answer" — a 40–60 word self-contained paragraph that directly answers the post's headline question. Must include the primary_keyword in the first sentence. This becomes the Speakable / AEO target in the rendered body (wrapped in <div class="quick-answer">) and is what AI search engines (ChatGPT, Perplexity, Gemini AI Overview) prefer to cite. Concrete, factual, no marketing fluff. **220–360 chars** (≈ 40–60 words).
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

## Live SERP context (use this to design an outline that beats the current page-1 results)
{{serp_block}}

## SERP-aware outlining rules
- The outline MUST cover every distinct angle from the top 10 organic results AND every People Also Ask question above. Treat that as the minimum semantic coverage required to rank.
- Pick a primary_keyword that matches actual search intent visible in the SERP titles, not a brand slogan.
- Aim higher than the median word count of the top 10 — match the deepest competitor's coverage and add what they're missing.
- Add at least one section that answers a PAA question explicitly (verbatim phrasing is fine — it's how PAA snippets get won).

{{json_schema}}`;

export const DEFAULT_BODY_USER = `Brand: {{brand_name}}
Brand voice: {{brand_tone}}

## Blog request
Label: {{label}}
Topic / context: {{topic}}
{{keywords_block}}{{instructions_block}}
## Source material
{{source_block}}

## Live SERP context
{{serp_block}}

{{exa_sources}}

## Approved h1
{{h1}}

## Approved outline (follow this; each numbered item is an H2 section)
{{outline}}

## Target length
Approximately {{words_target}} words total.

Now write the full blog post body in Markdown.

## Answer-Engine Optimization (AEO) — STRUCTURE REQUIREMENTS

1. **Quick Answer block (FIRST thing after the title):**
   Open the post with a raw HTML wrapper exactly like this:
   <div class="quick-answer">
   <strong>Quick answer:</strong> <40–60 word self-contained answer that directly answers the title's question. No preamble, no "in this post we'll explore", no "let's dive in". Just the answer. Treat it as the paragraph an AI assistant should be able to read aloud verbatim or cite as the canonical answer.>
   </div>

   Rules for the Quick Answer:
   • Exactly 40–60 words.
   • Includes the primary keyword in the first sentence.
   • Self-contained — readable without the rest of the post.
   • Concrete, factual, no marketing fluff. No "leverage", "unlock", "revolutionize".
   • IF a featured snippet is shown in the SERP context above, write this block so Google could swap it in as the new snippet.
   • IF a Google AI Overview is shown above, make this block deeper and more specific than the AI Overview — include a concrete number, named standard, or named tool the AI Overview lacks.

2. **Intro paragraph:** After the Quick Answer block, write 1–2 paragraphs that frame the topic for a reader who wants context. NOT a recap of the Quick Answer.

3. **Body sections:** Follow the approved outline. Each numbered item becomes an H2 (##). Use H3 (###) for sub-points.
   - Cover every PAA question listed in the SERP context above, either in the body sections or in the FAQ. Use the verbatim PAA phrasing as an H3 where natural — PAA boxes are won by question-shaped headings followed by tight 50–80 word answers.
   - Include AT LEAST one bullet list AND one markdown table somewhere in the body.
   - Include 4–8 internal-link placeholders shaped like [[related: short topic or keyword]] — these will be resolved automatically by the platform to other published posts on this site. Spread them naturally through the body, not clustered.
   - **External citations**: when the "Verified external sources" block above is populated, cite 3–5 of those sources INLINE in the body. Each citation MUST be a real markdown link of the form \`[anchor phrase](https://url-from-the-list)\` — the anchor phrase is part of your sentence (e.g. "industry analysis", "a recent BusinessInsider report"), NOT a label like "Source 1". NEVER write the literal text "[Source N]", "[1]", or any bracketed number — those render as plain text and look broken to readers. ONLY use URLs from that verified-sources block. If the block is empty, skip external citations entirely (do not hallucinate sources).

4. **Key Takeaways block (REQUIRED, near the end):**
   Wrap the closing summary list in a raw HTML wrapper:
   <div class="key-takeaways">

   ## Key takeaways
   - Bullet 1 (1 sentence, concrete)
   - Bullet 2 …
   - 3 to 5 items total.

   </div>

   This wrapper lets voice assistants and AI search engines read the summary aloud via Speakable schema.

5. **CTA paragraph** at the very end (one short paragraph, conversational).

## Hard rules
- Do NOT include the title as an H1 (the platform renders the H1 separately).
- Do NOT include any text outside the markdown body (no JSON, no prefaces, no closing remarks).
- Do NOT add a separate "## TL;DR" heading — the Quick Answer block above replaces it.`;

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
  {
    name: "serp_block",
    description:
      "DataForSEO SERP context for the primary keyword: top 10 organic results, People Also Ask, featured snippet, AI Overview, related searches. Empty when SERP analysis is disabled or fails. Place this where you want the writer to consider competitor coverage.",
    example: "## SERP signals for \"predictive maintenance\"\\nTop 10 organic competitors:\\n  1. <Title> — <url>\\nPeople Also Ask:\\n  - …",
  },
  {
    name: "exa_sources",
    description:
      "Verified authoritative URLs found by Exa AI for the primary + secondary keywords, each with 1–2 query-relevant highlights. The writer uses these for inline citations instead of hallucinating URLs. Empty fallback string when Exa is disabled or returns nothing — body prompt should still degrade gracefully.",
    example: "## Verified external sources (real URLs found via Exa AI)\\nSource 1: <Title> — <url>\\n  ↳ <highlight>\\n  ↳ <highlight>\\nSource 2: …",
  },
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
