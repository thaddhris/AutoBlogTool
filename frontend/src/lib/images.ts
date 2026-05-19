import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { getSettings } from "./settings";
import { logEvent } from "./db";

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
  const desc = input.description ? ` Context: ${input.description}.` : "";
  return [
    `Editorial cover image for a B2B industrial AI / IIoT blog titled "${input.title}".`,
    desc,
    "Clean, minimalist, modern tech aesthetic.",
    "Abstract industrial imagery — sensors, machinery silhouettes, data flows, factories — never literal stock photos.",
    "No text or words in the image.",
    "16:9 widescreen composition. High contrast, suitable as a 1200x630 hero banner.",
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

  if (provider === "gemini") {
    try {
      return await geminiBanner(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent("image.generate.fail", `gemini → fallback: ${msg}`);
    }
  }

  if (provider === "fal") {
    try {
      return await falBanner(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent("image.generate.fail", `fal → fallback: ${msg}`);
    }
  }

  if (provider === "fluxapi") {
    try {
      return await fluxapiBanner(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent("image.generate.fail", `fluxapi → fallback: ${msg}`);
    }
  }

  if (provider === "pexels") {
    try {
      return await pexelsBanner(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent("image.generate.fail", `pexels → fallback: ${msg}`);
    }
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
