import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// ─── Title overlay compositor ──────────────────────────────────────────────
//
// Takes the AI-generated background image on disk, paints a glassmorphism
// panel on the right side of the canvas, layers the brand name + post title
// on top, and overwrites the file in place. Pure server-side — no client
// rendering involved, the resulting PNG is what gets uploaded to Webflow.
//
// Layout: full-bleed background + linear gradient darkening the right ~55%
// of the image + a rounded "glass" panel sitting in that darkened band.
// Title sits centered vertically inside the panel; brand name is small,
// uppercase, kerned, just above it. Both rendered as actual SVG <text>
// elements so they're crisp at any DPI sharp resolves to.

export interface OverlayInput {
  brand: string;
  title: string;
  /** Optional pre-computed line breaks (from the content-agent). If absent
   *  we run a simple word-wrap based on character count. */
  lineBreaks?: string[];
}

/**
 * Word-wrap into lines whose char count stays under the cap. Keeps single
 * words intact even when they exceed the cap (we'd rather let a single
 * outlier word overflow than break it mid-character — the font fitter below
 * will catch overflows by shrinking the font instead).
 */
function wrapByChars(title: string, maxCharsPerLine: number): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) {
      current = w;
      continue;
    }
    if ((current + " " + w).length <= maxCharsPerLine) {
      current += " " + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Pick a font size + line breakdown so the wrapped title fits inside the
 * given usable width and a target line cap. Iteratively tries a sequence
 * of font sizes from largest to smallest, picking the first that fits
 * within `maxLines` lines AND keeps the longest line under `usableWidth`
 * pixels (estimated via avg glyph width).
 *
 * Inter Bold has an average glyph width of ~0.55× the font size for the
 * Latin alphabet in mixed case. We use 0.58 to leave a small safety margin
 * for wider-than-average titles.
 */
function fitTitle(
  title: string,
  usableWidth: number,
  baseSize: number,
  maxLines = 4,
): { lines: string[]; fontSize: number } {
  const charRatio = 0.58;
  const sizesToTry = [
    baseSize * 1.05,
    baseSize,
    baseSize * 0.9,
    baseSize * 0.8,
    baseSize * 0.72,
    baseSize * 0.64,
    baseSize * 0.56,
    baseSize * 0.5,
  ];
  for (const size of sizesToTry) {
    const charWidth = size * charRatio;
    const maxChars = Math.max(8, Math.floor(usableWidth / charWidth));
    const lines = wrapByChars(title, maxChars);
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
    if (lines.length <= maxLines && longest * charWidth <= usableWidth) {
      return { lines, fontSize: Math.round(size) };
    }
  }
  // Smallest size still couldn't fit cleanly — accept whatever it produced
  // at the smallest tried size; the SVG textLength fallback below will
  // squeeze any lone overflow lines so nothing actually paints past the
  // panel edge.
  const size = sizesToTry[sizesToTry.length - 1];
  const charWidth = size * charRatio;
  const maxChars = Math.max(8, Math.floor(usableWidth / charWidth));
  return { lines: wrapByChars(title, maxChars), fontSize: Math.round(size) };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Returns the SVG overlay sized to (width × height) to be composited onto
 * the background. All coordinates are derived from the canvas size so the
 * same code works whether the image is 1536×1024 (gpt-image-1) or
 * 1792×1024 (dall-e-3) or anything else 16:9-ish.
 */
function buildOverlaySvg(
  width: number,
  height: number,
  input: OverlayInput,
): string {
  // Panel sits in the right-hand portion of the canvas with breathing room.
  const panelMargin = Math.round(width * 0.04);
  const panelWidth = Math.round(width * 0.46);
  const panelX = width - panelWidth - panelMargin;
  const panelY = Math.round(height * 0.12);
  const panelHeight = height - panelY - Math.round(height * 0.12);
  const panelRadius = 28;

  // Type sizing scales with canvas height so it stays balanced across sizes.
  const brandSize = Math.round(height * 0.022);
  const baseTitleSize = Math.round(height * 0.075);

  // Padding inside the glass panel — usable horizontal width is what we
  // measure against when picking the font size.
  const horizontalPadding = Math.round(panelWidth * 0.08);
  const usableWidth = panelWidth - horizontalPadding * 2;

  // Honor the content-agent's suggested line breaks when present, otherwise
  // run the fitter. If the agent's breaks have any line that's too wide for
  // the panel, fall through to the fitter so we don't overflow.
  let lines: string[];
  let titleSize: number;
  const agentBreaks =
    input.lineBreaks && input.lineBreaks.length
      ? input.lineBreaks.slice(0, 5)
      : null;
  const charRatio = 0.58;
  const agentLongestChars = agentBreaks
    ? agentBreaks.reduce((m, l) => Math.max(m, l.length), 0)
    : 0;
  const agentMaxFontForFit = agentBreaks
    ? Math.floor(usableWidth / (agentLongestChars * charRatio))
    : 0;
  if (agentBreaks && agentMaxFontForFit >= baseTitleSize * 0.55) {
    lines = agentBreaks;
    titleSize = Math.min(baseTitleSize, agentMaxFontForFit);
  } else {
    const fit = fitTitle(input.title, usableWidth, baseTitleSize, 4);
    lines = fit.lines;
    titleSize = fit.fontSize;
  }

  const lineHeight = Math.round(titleSize * 1.12);

  // Block of title text sits centered vertically inside the panel, brand
  // line just above it (so the brand and title together look like one
  // composition unit).
  const titleBlockHeight = lines.length * lineHeight;
  const compositionHeight = brandSize + 28 + titleBlockHeight;
  const compositionTop =
    panelY + Math.round((panelHeight - compositionHeight) / 2);

  const brandX = panelX + horizontalPadding;
  const brandY = compositionTop + brandSize;

  const titleX = brandX;
  const firstTitleBaseline = brandY + 28 + titleSize;

  // Belt-and-braces: if a line's estimated rendered width still exceeds the
  // usable panel width (e.g. an extra-wide all-caps word), use SVG's
  // textLength + lengthAdjust to squeeze it horizontally. lengthAdjust
  // "spacingAndGlyphs" subtly tightens letter spacing AND glyphs. The
  // visual cost is small; the alternative is a line that paints past the
  // panel edge.
  const titleTspans = lines
    .map((line, i) => {
      const estWidth = line.length * titleSize * charRatio;
      const squeeze =
        estWidth > usableWidth
          ? ` textLength="${usableWidth}" lengthAdjust="spacingAndGlyphs"`
          : "";
      return `<tspan x="${titleX}" y="${firstTitleBaseline + i * lineHeight}"${squeeze}>${escapeXml(line)}</tspan>`;
    })
    .join("");

  // Gradient + panel + text. The Gaussian blur filter on the panel softens
  // the underlying image where it shows through, faking a true backdrop-
  // filter that SVG doesn't support natively.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="darken" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(5,12,24,0)"/>
      <stop offset="45%" stop-color="rgba(5,12,24,0.25)"/>
      <stop offset="100%" stop-color="rgba(5,12,24,0.78)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#darken)"/>
  <rect
    x="${panelX}" y="${panelY}" rx="${panelRadius}" ry="${panelRadius}"
    width="${panelWidth}" height="${panelHeight}"
    fill="rgba(15, 25, 45, 0.45)"
    stroke="rgba(255,255,255,0.22)" stroke-width="1.25"
  />
  <text
    x="${brandX}" y="${brandY}"
    font-family="Inter, system-ui, sans-serif"
    font-size="${brandSize}" font-weight="600" letter-spacing="3"
    fill="rgba(255,255,255,0.78)"
  >${escapeXml(input.brand.toUpperCase())}</text>
  <text
    font-family="Inter, system-ui, sans-serif"
    font-size="${titleSize}" font-weight="700"
    fill="#ffffff" style="paint-order: stroke; stroke: rgba(0,0,0,0.35); stroke-width: 1.5;"
  >${titleTspans}</text>
</svg>`;
}

/**
 * Reads the banner file at `bannerPath`, paints the overlay on top, and
 * overwrites it in place. Throws if sharp can't read the source — caller
 * should catch and log so a broken overlay doesn't take down the whole
 * post.
 */
export async function applyTitleOverlay(
  bannerAbsPath: string,
  input: OverlayInput,
): Promise<void> {
  const buf = fs.readFileSync(bannerAbsPath);
  const meta = await sharp(buf).metadata();
  const width = meta.width ?? 1536;
  const height = meta.height ?? 1024;
  const svg = buildOverlaySvg(width, height, input);
  const composited = await sharp(buf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
  fs.writeFileSync(bannerAbsPath, composited);
}

/** Turn a site-relative banner URL (`/banners/<id>.png`) into a disk path. */
export function bannerUrlToPath(url: string): string {
  const file = url.replace(/^\/+/, "");
  return path.join(process.cwd(), "public", file);
}
