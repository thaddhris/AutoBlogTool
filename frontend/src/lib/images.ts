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
