import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { getSettings } from "./settings";
import { logEvent } from "./db";
import { applyTitleOverlay, bannerUrlToPath } from "./bannerCompose";

// Banners are saved as files under `public/banners/` so Next can serve them
// directly. We return a site-relative path (e.g. `/banners/abc.png`) which
// the admin UI renders fine. Webflow needs an absolute URL — the publisher
// prepends settings.public_base_url at upload time.
const BANNERS_DIR = path.join(process.cwd(), "public", "banners");

export interface Banner {
  url: string;
  alt: string;
}

export interface GenerateBannerInput {
  title: string;
  description?: string;
  brand: string;
  /** Optional. If present, used as the Pexels search query — cleaner results
   *  than parsing the full title. Ignored by other providers. */
  primary_keyword?: string | null;
}

function ensureBannersDir() {
  if (!fs.existsSync(BANNERS_DIR)) fs.mkdirSync(BANNERS_DIR, { recursive: true });
}

// ─── placeholder ────────────────────────────────────────────────────────────

function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

function placeholderSvgDataUrl(input: GenerateBannerInput): string {
  const hue = hashHue(input.title);
  const safeTitle = input.title.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 630'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='hsl(${hue}, 70%, 35%)'/>
        <stop offset='100%' stop-color='hsl(${(hue + 40) % 360}, 70%, 20%)'/>
      </linearGradient>
    </defs>
    <rect width='1200' height='630' fill='url(#g)'/>
    <text x='60' y='90' font-family='Inter, system-ui, sans-serif' font-size='28' fill='rgba(255,255,255,0.7)' font-weight='600'>${input.brand}</text>
    <foreignObject x='60' y='150' width='1080' height='420'>
      <div xmlns='http://www.w3.org/1999/xhtml' style='font-family:Inter,system-ui,sans-serif;color:white;font-size:64px;font-weight:700;line-height:1.15;'>${safeTitle}</div>
    </foreignObject>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ─── gemini ─────────────────────────────────────────────────────────────────

function buildImagePrompt(input: GenerateBannerInput): string {
  const desc = input.description
    ? `Additional context: ${input.description}.`
    : "";

  // The prompt is engineered to push every provider (OpenAI, Gemini, FLUX)
  // toward documentary-style photography instead of illustration or 3D
  // render. The opening line ("Photorealistic, color photograph…") is the
  // single strongest signal; the camera/lens/lighting language reinforces
  // it; the explicit "NOT an illustration / NOT a 3D render" anti-cues at
  // the end stop the model from drifting back to art.
  return [
    `Photorealistic documentary-style color photograph for the hero image of an enterprise B2B industrial AI and IIoT article titled "${input.title}".`,

    desc,

    "Shot on a full-frame DSLR with a 35mm prime lens at f/2.8, shallow depth of field, sharp focus on the primary subject, naturally blurred background.",

    "Natural cinematic lighting — realistic highlights, shadows, reflections, and slight atmospheric haze when it serves the scene.",

    "The subject of the photograph must be CONCRETE and SPECIFIC to the post topic — do NOT default to a generic shot of an engineer-in-hardhat next to machinery. Vary framing across posts: sometimes a tight macro detail of equipment, sometimes a mid-range shot of a working subject, sometimes an environmental wide of an operating space — chosen by the topic.",

    "Color palette grounded in real industrial tones: blue, steel, graphite, white, with a quiet cyan accent from screens or status lights. No oversaturated colors, no neon glow.",

    "Composition: clean, editorial, strong focal hierarchy, rule-of-thirds, ample negative space.",

    "Absolutely no text, captions, labels, logos, watermarks, UI mockups, or readable typography anywhere in the image.",

    "STRICT: this must look like a real photograph. NOT an illustration. NOT a 3D render. NOT concept art. NOT CGI. NOT a digital painting. NOT a vector graphic. NOT a stylised infographic. No cartoon shading, no smooth plastic surfaces, no fantasy or sci-fi exaggeration.",

    "Final output: 16:9 widescreen, magazine-cover quality, ready to publish as a 1200x630 blog hero banner."
  ].join(" ");
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  error?: { message?: string; status?: string };
}

/**
 * Calls Gemini's image-generation endpoint, writes the resulting PNG/JPEG to
 * `public/banners/<id>.<ext>`, and returns the site-relative URL.
 */
async function geminiBanner(input: GenerateBannerInput): Promise<Banner> {
  const settings = getSettings();
  const key = settings.gemini_api_key;
  if (!key) throw new Error("Gemini API key not configured");
  const model = settings.gemini_image_model || "gemini-3.1-flash-image";

  const prompt = buildImagePrompt(input);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  const raw = await res.text();
  let parsed: GeminiResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as GeminiResponse) : {};
  } catch {
    /* leave parsed empty */
  }

  if (!res.ok) {
    const msg = parsed.error?.message || raw.slice(0, 300) || res.statusText;
    throw new Error(`Gemini ${res.status}: ${msg}`);
  }

  const parts = parsed.candidates?.[0]?.content?.parts ?? [];
  let mime = "";
  let data = "";
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    if (inline?.data) {
      mime =
        ("mimeType" in (p.inlineData ?? {}) ? p.inlineData?.mimeType : undefined) ||
        ("mime_type" in (p.inline_data ?? {}) ? p.inline_data?.mime_type : undefined) ||
        "image/png";
      data = inline.data;
      break;
    }
  }
  if (!data) {
    throw new Error(
      "Gemini response contained no image data. Check the model name and that the key has access.",
    );
  }

  ensureBannersDir();
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const id = `${Date.now().toString(36)}-${nanoid(8)}`;
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(BANNERS_DIR, filename), Buffer.from(data, "base64"));

  return {
    url: `/banners/${filename}`,
    alt: `${input.brand} — ${input.title}`,
  };
}

// ─── fal (FLUX) ─────────────────────────────────────────────────────────────
//
// Fal AI hosts the FLUX family of text-to-image models. We hit the synchronous
// endpoint at fal.run/<model>, which blocks until the image is ready (~2-5s
// for flux-schnell, longer for flux-dev / flux-pro). The response shape is:
//   { images: [{ url, width, height, content_type }], seed, has_nsfw_concepts, ... }
//
// We download the returned URL and persist a copy under public/banners/ so the
// CMS publisher has a stable local path (Fal's signed URLs expire).

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

interface FalResponse {
  images?: FalImage[];
  detail?: string | { msg?: string }[];
  error?: string;
}

async function falBanner(input: GenerateBannerInput): Promise<Banner> {
  const settings = getSettings();
  const key = settings.fal_api_key;
  if (!key) throw new Error("Fal AI key not configured");
  const model = settings.fal_image_model || "fal-ai/flux/schnell";

  const prompt = buildImagePrompt(input);

  // Schnell only accepts 1–4 inference steps; dev/pro accept 1–50.
  const isSchnell = /schnell/i.test(model);
  const body: Record<string, unknown> = {
    prompt,
    image_size: "landscape_16_9", // ~1024x576 — close enough to 1200x630.
    num_images: 1,
    enable_safety_checker: true,
    num_inference_steps: isSchnell ? 4 : 28,
  };

  const url = `https://fal.run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${key}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed: FalResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as FalResponse) : {};
  } catch {
    /* leave parsed empty */
  }
  if (!res.ok) {
    const detail = Array.isArray(parsed.detail)
      ? parsed.detail.map((d) => d.msg).join("; ")
      : parsed.detail || parsed.error || raw.slice(0, 300) || res.statusText;
    throw new Error(`Fal ${res.status}: ${detail}`);
  }
  const image = parsed.images?.[0];
  if (!image?.url) {
    throw new Error(
      "Fal response contained no image URL. Check the model slug under Settings (e.g. 'fal-ai/flux/schnell').",
    );
  }

  // Download Fal's signed URL and persist locally so Webflow / static hosting
  // can fetch a stable path after the upstream URL expires.
  const imgRes = await fetch(image.url);
  if (!imgRes.ok) {
    throw new Error(`Fal image download ${imgRes.status}`);
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mime = image.content_type || "image/png";
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";

  ensureBannersDir();
  const id = `${Date.now().toString(36)}-${nanoid(8)}`;
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(BANNERS_DIR, filename), buf);

  return {
    url: `/banners/${filename}`,
    alt: `${input.brand} — ${input.title}`,
  };
}

// ─── openai (gpt-image-1 / dall-e-3) ────────────────────────────────────────
//
// OpenAI exposes a single synchronous endpoint at
//   POST https://api.openai.com/v1/images/generations
// that supports both gpt-image-1 (the newer, sharper Image API model) and
// the older dall-e-3. We pick the closest 16:9-ish size each model accepts
// and persist the returned image to public/banners/.
//
// Two response shapes:
//   - gpt-image-1 → always `b64_json` (the URL/`url` field isn't supported)
//   - dall-e-3    → either `url` or `b64_json` depending on response_format
// We request b64_json universally so we don't have to deal with OpenAI's
// signed-URL expiry (which is ~1h).

interface OpenAIImageResponseItem {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

interface OpenAIImageResponse {
  created?: number;
  data?: OpenAIImageResponseItem[];
  error?: { message?: string; type?: string; code?: string };
}

function openaiSizeForModel(model: string): string {
  // gpt-image-1 supports: 1024x1024, 1024x1536, 1536x1024, auto
  // dall-e-3 supports:    1024x1024, 1024x1792, 1792x1024
  // We always want landscape closest to 16:9.
  if (/^dall-?e-?3/i.test(model)) return "1792x1024";
  return "1536x1024"; // gpt-image-1 and unknowns default here
}

async function openaiBanner(input: GenerateBannerInput): Promise<Banner> {
  const settings = getSettings();
  const key = settings.openai_api_key;
  if (!key) throw new Error("OpenAI API key not configured");
  const model = settings.openai_image_model || "gpt-image-1";

  const prompt = buildImagePrompt(input);
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: openaiSizeForModel(model),
  };
  // dall-e-3 accepts response_format; gpt-image-1 errors on it (always b64).
  // For dall-e-3 we also pin `style: "natural"` — the default ("vivid") is
  // a hyper-stylized look that conflicts with our "real photograph" prompt.
  // gpt-image-1 has no style parameter — its realism is steered entirely by
  // the prompt text.
  if (/^dall-?e-?3/i.test(model)) {
    body.response_format = "b64_json";
    body.quality = "hd";
    body.style = "natural";
  } else {
    // gpt-image-1: "low" | "medium" | "high" | "auto". "high" matches our
    // editorial use case and produces sharper realism than "medium".
    body.quality = "high";
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed: OpenAIImageResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as OpenAIImageResponse) : {};
  } catch {
    /* leave parsed empty */
  }
  if (!res.ok) {
    const msg = parsed.error?.message || raw.slice(0, 300) || res.statusText;
    throw new Error(`OpenAI ${res.status}: ${msg}`);
  }

  const item = parsed.data?.[0];
  let buf: Buffer | null = null;
  if (item?.b64_json) {
    buf = Buffer.from(item.b64_json, "base64");
  } else if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`OpenAI image download ${imgRes.status}`);
    buf = Buffer.from(await imgRes.arrayBuffer());
  }
  if (!buf) {
    throw new Error(
      "OpenAI response contained no image data. Check the model name and your account access.",
    );
  }

  ensureBannersDir();
  const id = `${Date.now().toString(36)}-${nanoid(8)}`;
  const filename = `${id}.png`;
  fs.writeFileSync(path.join(BANNERS_DIR, filename), buf);

  return {
    url: `/banners/${filename}`,
    alt: `${input.brand} — ${input.title}`,
  };
}

// ─── openai-agentic (multi-agent chain) ─────────────────────────────────────
//
// Replaces the one-shot openaiBanner with a 4-agent pipeline modelled on the
// user-supplied workflow JSON:
//
//   1. content-agent       (gpt-4.1-mini)  → shortens / tightens the title
//                                            so downstream agents and image
//                                            models stay on-topic.
//   2. visual-style-agent  (gpt-4.1-mini)  → derives an industry-aware
//                                            visual palette / style block.
//   3. image-prompt-agent  (gpt-4.1)       → fuses everything above into a
//                                            cinematic photorealistic prompt.
//   4. image-generation    (gpt-image-1)   → produces the final PNG.
//
// We skip the spec's optional "layout-agent" — it produces split-layout JSON
// for a frontend renderer that doesn't exist in this pipeline (Webflow takes
// a single image file as the hero). If we ever ship a frontend that needs
// composited banners with overlaid titles + glassmorphism panels, we can
// add a sharp/SVG step after the image is saved.
//
// Each agent call is logged so admins can inspect every step in the Activity
// Log.

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function openaiChat(args: {
  key: string;
  model: string;
  system: string;
  user: string;
  jsonMode: boolean;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.key}`,
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.7,
      max_tokens: args.maxTokens ?? 600,
      ...(args.jsonMode
        ? { response_format: { type: "json_object" } }
        : {}),
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  });
  const raw = await res.text();
  let parsed: OpenAIChatResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as OpenAIChatResponse) : {};
  } catch {
    /* leave empty */
  }
  if (!res.ok) {
    const msg = parsed.error?.message || raw.slice(0, 300) || res.statusText;
    throw new Error(`OpenAI chat ${args.model} ${res.status}: ${msg}`);
  }
  const text = parsed.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`OpenAI chat ${args.model}: empty response`);
  return text;
}

function safeParseJson<T>(s: string): T | null {
  // Models sometimes wrap JSON in ```json fences even with response_format
  // pinned. Strip them before parsing.
  const cleaned = s
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

interface OptimizedTitle {
  optimizedTitle: string;
  fontSize?: number;
  lineBreaks?: string[];
}

interface VisualStyle {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  style?: string;
  graphicElements?: string[];
}

interface EnhancedPrompt {
  enhancedPrompt: string;
}

async function runContentAgent(
  key: string,
  title: string,
  industry: string,
): Promise<OptimizedTitle> {
  const out = await openaiChat({
    key,
    model: "gpt-4.1-mini",
    jsonMode: true,
    maxTokens: 300,
    system:
      "You are a design-aware content agent for industrial B2B blog hero banners. You return ONLY valid JSON exactly matching the requested schema. No prose.",
    user: `Optimize the following blog title so it reads cleanly inside a hero banner.

Title: "${title}"
Industry: ${industry}

Rules:
- Max 65 characters in the optimized title.
- Max 4 lines.
- Preserve the original meaning — do not change the topic.
- Professional industrial tone.

Return JSON exactly like:
{
  "optimizedTitle": "<the shorter, punchier title>",
  "fontSize": 74,
  "lineBreaks": ["<line 1>", "<line 2>", "..."]
}`,
  });
  const parsed = safeParseJson<OptimizedTitle>(out);
  return parsed ?? { optimizedTitle: title };
}

async function runVisualStyleAgent(
  key: string,
  industry: string,
  theme: string,
): Promise<VisualStyle> {
  const out = await openaiChat({
    key,
    model: "gpt-4.1-mini",
    jsonMode: true,
    maxTokens: 350,
    system:
      "You are a visual-style strategist for industrial B2B hero banners. You return ONLY valid JSON exactly matching the requested schema. No prose.",
    user: `Generate a visual configuration for a photorealistic editorial hero banner.

Industry: ${industry}
Theme: ${theme}

Return JSON exactly like:
{
  "primaryColor": "#…",
  "secondaryColor": "#…",
  "accentColor": "#…",
  "style": "<one-sentence style descriptor, e.g. 'cinematic documentary photography, low ambient haze, working factory floor'>",
  "graphicElements": ["<element>", "<element>", "..."]
}`,
  });
  return safeParseJson<VisualStyle>(out) ?? {};
}

async function runImagePromptAgent(
  key: string,
  args: {
    title: string;
    seedPrompt: string;
    industry: string;
    theme: string;
    visualStyle: VisualStyle;
  },
): Promise<string> {
  const styleHints = [
    args.visualStyle.style && `Style: ${args.visualStyle.style}`,
    args.visualStyle.primaryColor &&
      `Color palette anchors: primary ${args.visualStyle.primaryColor}` +
        (args.visualStyle.secondaryColor
          ? `, secondary ${args.visualStyle.secondaryColor}`
          : "") +
        (args.visualStyle.accentColor
          ? `, accent ${args.visualStyle.accentColor}`
          : ""),
    args.visualStyle.graphicElements?.length &&
      `Suggested elements: ${args.visualStyle.graphicElements.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const out = await openaiChat({
    key,
    model: "gpt-4.1",
    jsonMode: true,
    maxTokens: 700,
    system:
      "You enhance image-generation prompts for OpenAI gpt-image-1. The target is a photorealistic editorial hero banner for an industrial B2B blog. Your job is to translate an article title into a CONCRETE photographic scene that uniquely illustrates that title — not a generic 'engineer in hard hat next to machinery' fallback. You return ONLY valid JSON. No prose.",
    user: `Translate this article title into a specific photographic scene for the hero banner.

Title: "${args.title}"
Industry: ${args.industry}
Theme: ${args.theme}
${styleHints ? `Visual style: ${styleHints}` : ""}

Seed prompt (photographic style rules — preserve these directives):
${args.seedPrompt}

# Critical rules

1. The scene MUST be specific to what the article is about, not a generic industrial stock photo. Read the title carefully and pick a subject that illustrates *that specific concept*:
   - "Meter offset / calibration"  → close-up macro of a digital flow meter or pressure gauge, with calibration tooling or a tablet showing a value, NOT a wide engineer shot.
   - "Steam trap monitoring"        → close shot of a steam trap on a pipe with visible condensation, or thermal-camera-style imagery, NOT a generic factory.
   - "Predictive maintenance"       → vibration sensor mounted on a bearing housing or motor, hands-free, NOT an inspection scene.
   - "Energy monitoring / OEE"      → SCADA wall of dashboards in a control room, or sub-station with meters, NOT a person reading a tablet.
   - "Cement plant" / "Power plant" → identifiable equipment of that plant type (rotary kiln, cooling tower, boiler), NOT a generic warehouse.
   - "AI in manufacturing"          → server rack or edge gateway physically wired into a production line, NOT a robotic arm.
   Apply the SAME logic to whatever the title actually says.

2. Vary the framing deliberately. Choose ONE: macro detail (the equipment is the hero, no human), mid-range (equipment + part of a human, e.g. a gloved hand), or environmental wide (equipment in context of the operating space, human optional and small). Do NOT default to "engineer in hard hat looking at a screen" — that's banned unless the title is literally about an engineer's workflow.

3. The photograph should look like a real working environment captured by a documentary photographer, not staged.

# Style invariants (always include)

- Photorealistic documentary photograph; NOT illustration, NOT 3D render, NOT CGI.
- Natural cinematic lighting with realistic highlights, shadows, atmospheric depth.
- Blue / steel / graphite / cyan palette unless the visual-style block overrides.
- 16:9 framing.
- Absolutely no text, labels, logos, watermarks, or typography in the image.

# Output

One single paragraph, 80–180 words. Concrete and visual — describe what's physically in the frame. No marketing buzzwords like "leverage", "unlock", "revolutionize". Start the paragraph by naming the specific subject and framing choice (e.g. "Close-up macro photograph of …", "Wide environmental shot of …", "Mid-range frame of …").

Return JSON exactly like:
{ "enhancedPrompt": "<the final single-paragraph prompt>" }`,
  });
  const parsed = safeParseJson<EnhancedPrompt>(out);
  if (!parsed?.enhancedPrompt) {
    throw new Error("image-prompt-agent produced no enhancedPrompt");
  }
  return parsed.enhancedPrompt;
}

async function openaiImagesGenerate(
  key: string,
  model: string,
  prompt: string,
): Promise<Buffer> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: openaiSizeForModel(model),
  };
  if (/^dall-?e-?3/i.test(model)) {
    body.response_format = "b64_json";
    body.quality = "hd";
    body.style = "natural";
  } else {
    body.quality = "high";
  }
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: OpenAIImageResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as OpenAIImageResponse) : {};
  } catch {
    /* leave parsed empty */
  }
  if (!res.ok) {
    const msg = parsed.error?.message || raw.slice(0, 300) || res.statusText;
    throw new Error(`OpenAI images ${res.status}: ${msg}`);
  }
  const item = parsed.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`OpenAI image download ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error("OpenAI images response contained no image data");
}

async function openaiAgenticBanner(
  input: GenerateBannerInput,
): Promise<Banner> {
  const settings = getSettings();
  const key = settings.openai_api_key;
  if (!key) throw new Error("OpenAI API key not configured");
  const imageModel = settings.openai_image_model || "gpt-image-1";

  // Defaults derived from the brand. We don't add new settings fields — these
  // can be overridden later if we expose them in the Settings UI.
  const industry =
    settings.brand_name || "Industrial AI / IIoT";
  const theme = "Industrial Futuristic";
  const seedPrompt = buildImagePrompt(input);

  // Step 1 — content-agent
  let optimized: OptimizedTitle = { optimizedTitle: input.title };
  try {
    optimized = await runContentAgent(key, input.title, industry);
    logEvent(
      "image.agent.content",
      `optimizedTitle="${optimized.optimizedTitle}"`,
      { payload: optimized },
    );
  } catch (err) {
    logEvent(
      "image.agent.content.fail",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Step 2 — visual-style-agent
  let visualStyle: VisualStyle = {};
  try {
    visualStyle = await runVisualStyleAgent(key, industry, theme);
    logEvent("image.agent.style", visualStyle.style || "(no style returned)", {
      payload: visualStyle,
    });
  } catch (err) {
    logEvent(
      "image.agent.style.fail",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Step 3 — image-prompt-agent (the one whose output we actually feed to
  // gpt-image-1). If this step fails, fall back to the seed prompt so we
  // still produce *something* rather than dropping to the placeholder.
  let enhancedPrompt = seedPrompt;
  try {
    enhancedPrompt = await runImagePromptAgent(key, {
      title: optimized.optimizedTitle || input.title,
      seedPrompt,
      industry,
      theme,
      visualStyle,
    });
    logEvent(
      "image.agent.prompt",
      `enhanced (${enhancedPrompt.length} chars)`,
      { payload: { enhancedPrompt } },
    );
  } catch (err) {
    logEvent(
      "image.agent.prompt.fail",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Step 4 — image-generation
  const buf = await openaiImagesGenerate(key, imageModel, enhancedPrompt);
  ensureBannersDir();
  const id = `${Date.now().toString(36)}-${nanoid(8)}`;
  const filename = `${id}.png`;
  const absPath = path.join(BANNERS_DIR, filename);
  fs.writeFileSync(absPath, buf);

  // Step 5 — bake the title into the image (glassmorphism panel + brand line).
  // The agentic flow has both the optimized title and the content-agent's
  // suggested line breaks, so the layout is much cleaner than the plain
  // openai path. If the toggle is off in Settings, skip this step and ship
  // the raw photographic background.
  if (settings.banner_title_overlay !== false) {
    try {
      await applyTitleOverlay(absPath, {
        brand: input.brand,
        title: optimized.optimizedTitle || input.title,
        lineBreaks: optimized.lineBreaks,
      });
      logEvent("image.overlay.ok", `openai-agentic → ${filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent("image.overlay.fail", `openai-agentic → ${msg}`);
    }
  }

  return {
    url: `/banners/${filename}`,
    alt: `${input.brand} — ${input.title}`,
  };
}

// ─── fluxapi.ai ─────────────────────────────────────────────────────────────
//
// fluxapi.ai is a third-party FLUX host (separate from Fal). It exposes an
// async/queue API:
//   POST  /api/v1/flux/kontext/generate     → { data: { taskId } }
//   GET   /api/v1/flux/kontext/record-info?taskId=…
//                                          → { data: { successFlag, response: { resultImageUrl } } }
//
// We POST once to enqueue, then poll record-info on a fixed interval until
// the task reports SUCCESS (successFlag = 1) or one of the failure flags
// (2 = create failed, 3 = generate failed). The model name from settings is
// passed through; defaults to "flux-kontext-pro".
//
// The returned resultImageUrl expires after 14 days, so we download a copy
// to public/banners/ for stable serving — same pattern as Fal and Gemini.

interface FluxApiEnqueueResponse {
  code?: number;
  msg?: string;
  data?: { taskId?: string };
}

interface FluxApiRecordResponse {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    successFlag?: number; // 0=generating, 1=success, 2=create_failed, 3=generate_failed
    errorCode?: number | null;
    errorMessage?: string | null;
    response?: {
      originImageUrl?: string;
      resultImageUrl?: string;
    } | null;
  };
}

async function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

async function fluxapiBanner(input: GenerateBannerInput): Promise<Banner> {
  const settings = getSettings();
  const key = settings.fluxapi_api_key;
  if (!key) throw new Error("FluxAPI key not configured");
  const model = settings.fluxapi_image_model || "flux-kontext-pro";

  const prompt = buildImagePrompt(input);
  const enqueueRes = await fetch(
    "https://api.fluxapi.ai/api/v1/flux/kontext/generate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        prompt,
        model,
        aspectRatio: "16:9",
        outputFormat: "jpeg",
        // Defaults from doc: enableTranslation true, safetyTolerance 2.
      }),
    },
  );
  const enqueueRaw = await enqueueRes.text();
  let enqueueJson: FluxApiEnqueueResponse = {};
  try {
    enqueueJson = enqueueRaw ? JSON.parse(enqueueRaw) : {};
  } catch {
    /* leave empty */
  }
  if (!enqueueRes.ok || enqueueJson.code !== 200) {
    const msg = enqueueJson.msg || enqueueRaw.slice(0, 300) || enqueueRes.statusText;
    throw new Error(`FluxAPI enqueue ${enqueueRes.status}: ${msg}`);
  }
  const taskId = enqueueJson.data?.taskId;
  if (!taskId) {
    throw new Error("FluxAPI enqueue response had no taskId");
  }

  // Poll for completion. flux-kontext-pro typically finishes in ~10–30s;
  // give it up to ~3 minutes before we give up.
  const POLL_INTERVAL_MS = 3000;
  const MAX_POLLS = 60; // 60 × 3s = 180s
  let resultUrl: string | undefined;
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(
      `https://api.fluxapi.ai/api/v1/flux/kontext/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const pollRaw = await pollRes.text();
    let pollJson: FluxApiRecordResponse = {};
    try {
      pollJson = pollRaw ? JSON.parse(pollRaw) : {};
    } catch {
      /* keep empty */
    }
    if (!pollRes.ok) {
      throw new Error(
        `FluxAPI poll ${pollRes.status}: ${pollJson.msg || pollRaw.slice(0, 200)}`,
      );
    }
    const flag = pollJson.data?.successFlag;
    if (flag === 1) {
      resultUrl = pollJson.data?.response?.resultImageUrl;
      break;
    }
    if (flag === 2 || flag === 3) {
      const parts: string[] = [`successFlag=${flag}`];
      if (pollJson.data?.errorCode != null)
        parts.push(`errorCode=${pollJson.data.errorCode}`);
      if (pollJson.data?.errorMessage)
        parts.push(`errorMessage="${pollJson.data.errorMessage}"`);
      // Include the upstream response body — fluxapi sometimes returns useful
      // hints (content-policy, model-not-available) outside the documented
      // shape, and we'd otherwise have nothing to debug from.
      parts.push(`raw=${pollRaw.slice(0, 300)}`);
      throw new Error(`FluxAPI generation failed: ${parts.join(" · ")}`);
    }
    // flag === 0 or undefined → still generating, keep polling.
  }
  if (!resultUrl) {
    throw new Error(
      `FluxAPI timed out after ${(POLL_INTERVAL_MS * MAX_POLLS) / 1000}s without a result image`,
    );
  }

  // Download the (signed, 14-day) URL and persist locally so Webflow has a
  // stable path after the upstream URL expires.
  const imgRes = await fetch(resultUrl);
  if (!imgRes.ok) {
    throw new Error(`FluxAPI image download ${imgRes.status}`);
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  // resultImageUrl from fluxapi is always jpeg/png — sniff via URL extension.
  const lower = resultUrl.toLowerCase();
  const ext = lower.includes(".png")
    ? "png"
    : lower.includes(".webp")
      ? "webp"
      : "jpg";
  ensureBannersDir();
  const id = `${Date.now().toString(36)}-${nanoid(8)}`;
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(BANNERS_DIR, filename), buf);

  return {
    url: `/banners/${filename}`,
    alt: `${input.brand} — ${input.title}`,
  };
}

// ─── pexels ─────────────────────────────────────────────────────────────────

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    landscape: string;
  };
}

interface PexelsResponse {
  photos: PexelsPhoto[];
  total_results?: number;
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "and",
  "or",
  "for",
  "with",
  "to",
  "in",
  "on",
  "of",
  "at",
  "by",
  "from",
  "your",
  "you",
  "how",
  "why",
  "what",
  "when",
  "guide",
  "complete",
  "ultimate",
]);

/**
 * Build a Pexels search query from the blog inputs. Prefers primary_keyword
 * (cleanest); otherwise extracts up to 4 content-bearing words from the
 * title. Fully specific titles like "Predictive Maintenance in Cement
 * Plants" yield queries like "predictive maintenance cement plants" which
 * Pexels handles well.
 */
function buildPexelsQuery(input: GenerateBannerInput): string {
  if (input.primary_keyword && input.primary_keyword.trim()) {
    return input.primary_keyword.trim();
  }
  const tokens = input.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 4);
  return tokens.join(" ") || "industry technology";
}

/**
 * Search Pexels for a landscape stock photo matching the post topic,
 * download the chosen image, save it to public/banners/, and return its
 * site-relative URL. Picks one of the top 5 results at random so successive
 * blogs on similar topics don't end up with identical hero images.
 *
 * Pexels license requires photographer attribution; we encode it into the
 * alt text. If you want a visible credit on the post, render the photog
 * name there too.
 */
async function pexelsBanner(input: GenerateBannerInput): Promise<Banner> {
  const settings = getSettings();
  const key = settings.pexels_api_key;
  if (!key) throw new Error("Pexels API key not configured");

  const query = buildPexelsQuery(input);
  const searchUrl =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=15&orientation=landscape&size=large`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: key },
  });
  if (!searchRes.ok) {
    const txt = await searchRes.text();
    throw new Error(`Pexels ${searchRes.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await searchRes.json()) as PexelsResponse;
  const photos = data.photos ?? [];
  if (photos.length === 0) {
    throw new Error(`Pexels returned no results for "${query}"`);
  }

  const pool = photos.slice(0, Math.min(5, photos.length));
  const photo = pool[Math.floor(Math.random() * pool.length)];

  // Prefer large2x (~2000px wide, sharp on retina); fall back through sizes.
  const imageUrl = photo.src.large2x || photo.src.large || photo.src.original;
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Pexels image download ${imgRes.status}`);
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());

  ensureBannersDir();
  const id = `${Date.now().toString(36)}-${nanoid(8)}`;
  const filename = `${id}.jpg`;
  fs.writeFileSync(path.join(BANNERS_DIR, filename), buf);

  const altBase = photo.alt?.trim() || input.title;
  return {
    url: `/banners/${filename}`,
    alt: `${altBase} (Photo by ${photo.photographer} on Pexels)`,
  };
}

// ─── inline body images via Pexels (hybrid mode) ────────────────────────────
//
// The hero banner uses whatever `image_provider` is configured (placeholder /
// gemini / pexels). INLINE body images always come from Pexels, gated by
// `inline_images_max`. The LLM is told to emit `[[image: short query]]`
// placeholders during body generation; this resolver walks them, fetches
// real photos, and splices markdown image syntax back in.

const INLINE_PLACEHOLDER_RE = /\[\[image:\s*([^\]]+?)\s*]]/gi;

export interface InlineImageResult {
  body: string;
  resolved: number;
  skipped: number;
  attributions: string[];
}

async function pexelsInlineImage(
  query: string,
): Promise<{ url: string; alt: string; photographer: string } | null> {
  const settings = getSettings();
  const key = settings.pexels_api_key;
  if (!key) throw new Error("Pexels API key not configured");
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=8&orientation=landscape&size=medium`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = (await res.json()) as PexelsResponse;
  if (!data.photos?.length) return null;
  const pool = data.photos.slice(0, Math.min(3, data.photos.length));
  const photo = pool[Math.floor(Math.random() * pool.length)];
  const src = photo.src.large || photo.src.medium || photo.src.original;
  const img = await fetch(src);
  if (!img.ok) return null;
  const buf = Buffer.from(await img.arrayBuffer());
  ensureBannersDir();
  const id = `inline-${Date.now().toString(36)}-${nanoid(6)}`;
  const filename = `${id}.jpg`;
  fs.writeFileSync(path.join(BANNERS_DIR, filename), buf);
  const alt =
    (photo.alt?.trim() || query) +
    ` (Photo by ${photo.photographer} on Pexels)`;
  return { url: `/banners/${filename}`, alt, photographer: photo.photographer };
}

/**
 * Walk `[[image: short query]]` placeholders in the markdown body. For each:
 *   - if we're at the cap → drop the placeholder cleanly
 *   - else hit Pexels, save the image, replace placeholder with a markdown
 *     image surrounded by blank lines so marked renders it as a block
 *
 * Always returns a usable body — never throws. If Pexels isn't configured
 * or fails, all placeholders are stripped so the post stays clean.
 */
export async function resolveInlineImages(
  body: string,
  max: number,
): Promise<InlineImageResult> {
  const stripAll = () => ({
    body: body.replace(INLINE_PLACEHOLDER_RE, ""),
    resolved: 0,
    skipped: 0,
    attributions: [] as string[],
  });
  if (max <= 0) return stripAll();
  const settings = getSettings();
  if (!settings.pexels_api_key) return stripAll();

  const matches = Array.from(body.matchAll(INLINE_PLACEHOLDER_RE));
  if (matches.length === 0)
    return { body, resolved: 0, skipped: 0, attributions: [] };

  let resolved = 0;
  let skipped = 0;
  const attributions: string[] = [];
  const replacements: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    if (resolved >= max) {
      replacements.push("");
      skipped++;
      continue;
    }
    const query = matches[i][1].trim();
    try {
      const img = await pexelsInlineImage(query);
      if (!img) {
        replacements.push("");
        skipped++;
        continue;
      }
      replacements.push(`\n\n![${img.alt}](${img.url})\n\n`);
      attributions.push(`Photo by ${img.photographer} on Pexels`);
      resolved++;
    } catch {
      replacements.push("");
      skipped++;
    }
  }
  let idx = 0;
  const out = body.replace(INLINE_PLACEHOLDER_RE, () => replacements[idx++] ?? "");
  return { body: out, resolved, skipped, attributions };
}

// ─── public entrypoint ──────────────────────────────────────────────────────

/**
 * Generate a banner based on the configured provider. Never throws on
 * provider failure — falls back to the placeholder SVG so the pipeline keeps
 * moving. The failure is logged.
 */
export async function generateBanner(input: GenerateBannerInput): Promise<Banner> {
  const settings = getSettings();
  const provider = settings.image_provider;
  // Surface the literal prompt every AI provider receives so admins can tune
  // the buildImagePrompt template by reading Activity Log entries side-by-
  // side with the produced banners. Skipped for placeholder/pexels (neither
  // uses the prompt — pexels has its own keyword query builder).
  const aiPrompt =
    provider === "placeholder" || provider === "pexels"
      ? null
      : buildImagePrompt(input);

  const handle = async (
    name: string,
    runner: () => Promise<Banner>,
  ): Promise<Banner | null> => {
    try {
      const out = await runner();
      logEvent("image.generate.ok", `${name} → ${out.url}`, {
        payload: { provider: name, prompt: aiPrompt, file: out.url },
      });

      // Composite the title onto the banner for every provider except the
      // agentic chain (which has already done it with optimized line breaks)
      // and pexels/placeholder (stock photos / colored gradients work better
      // without baked-in titles). Failure here is non-fatal — we still ship
      // the bare background.
      const overlayCandidates = new Set([
        "openai",
        "gemini",
        "fal",
        "fluxapi",
      ]);
      if (
        settings.banner_title_overlay !== false &&
        overlayCandidates.has(name) &&
        out.url.startsWith("/banners/")
      ) {
        try {
          await applyTitleOverlay(bannerUrlToPath(out.url), {
            brand: input.brand,
            title: input.title,
          });
          logEvent("image.overlay.ok", `${name} → ${out.url}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logEvent("image.overlay.fail", `${name} → ${msg}`);
        }
      }

      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent("image.generate.fail", `${name} → fallback: ${msg}`, {
        payload: { provider: name, prompt: aiPrompt, error: msg },
      });
      return null;
    }
  };

  if (provider === "openai") {
    const out = await handle("openai", () => openaiBanner(input));
    if (out) return out;
  }

  if (provider === "openai-agentic") {
    const out = await handle("openai-agentic", () =>
      openaiAgenticBanner(input),
    );
    if (out) return out;
  }

  if (provider === "gemini") {
    const out = await handle("gemini", () => geminiBanner(input));
    if (out) return out;
  }

  if (provider === "fal") {
    const out = await handle("fal", () => falBanner(input));
    if (out) return out;
  }

  if (provider === "fluxapi") {
    const out = await handle("fluxapi", () => fluxapiBanner(input));
    if (out) return out;
  }

  if (provider === "pexels") {
    const out = await handle("pexels", () => pexelsBanner(input));
    if (out) return out;
  }

  return {
    url: placeholderSvgDataUrl(input),
    alt: `${input.brand} — ${input.title}`,
  };
}

/**
 * Convert a site-relative banner URL to an absolute one using
 * `public_base_url`. Returns the input unchanged if it's already absolute
 * (http:, https:, data:). Returns null if the URL is relative and no base
 * is configured — caller should treat that as "skip image".
 */
export function absolutizeBannerUrl(banner: string | null): string | null {
  if (!banner) return null;
  if (/^(https?:|data:)/i.test(banner)) return banner;
  const base = getSettings().public_base_url.replace(/\/$/, "");
  if (!base) return null;
  return banner.startsWith("/") ? `${base}${banner}` : `${base}/${banner}`;
}
