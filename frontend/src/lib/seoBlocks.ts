import { findRelatedPosts } from "./internalLinks";
import { getRequest } from "./requests";
import { getSettings } from "./settings";
import { AggregateRating, Blog, BlogRequest } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function siteBlogUrl(slug: string): string {
  const base = (getSettings().site_url || "").replace(/\/$/, "");
  return base ? `${base}/blog/${slug}` : `/blog/${slug}`;
}

function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, "") // strip any inline tags
    .replace(/&[a-z]+;/g, " ") // strip html entities
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
}

/**
 * Walk the body HTML, append/replace `id="…"` on every <h2>/<h3>, and
 * return the (potentially mutated) body plus a flat list of headings for
 * the TOC. Idempotent — re-running on already-anchored HTML is fine.
 */
function extractAndAnchorHeadings(html: string): {
  html: string;
  headings: Heading[];
} {
  const headings: Heading[] = [];
  const used = new Set<string>();
  const out = html.replace(
    /<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag, attrs, inner) => {
      const level = tag.toLowerCase() === "h2" ? 2 : 3;
      const text = String(inner).replace(/<[^>]+>/g, "").trim();
      if (!text) return _match;
      let id = "";
      const existing = /\bid\s*=\s*"([^"]+)"/i.exec(attrs);
      if (existing) {
        id = existing[1];
      } else {
        id = slugifyHeading(text) || `section-${headings.length + 1}`;
        // de-dupe collisions
        let candidate = id;
        let n = 2;
        while (used.has(candidate)) candidate = `${id}-${n++}`;
        id = candidate;
      }
      used.add(id);
      headings.push({ level: level as 2 | 3, text, id });
      const cleanedAttrs = existing
        ? attrs
        : `${attrs ? attrs.trimEnd() + " " : " "}id="${id}"`;
      return `<${tag}${cleanedAttrs}>${inner}</${tag}>`;
    },
  );
  return { html: out, headings };
}

function renderTocHtml(headings: Heading[]): string {
  if (headings.length < 3) return ""; // not worth showing with <3 entries
  const items = headings
    .map((h) => {
      const cls = h.level === 3 ? "toc-item toc-item--sub" : "toc-item";
      return `<li class="${cls}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`;
    })
    .join("\n");
  return `<nav class="toc-card" aria-label="Table of contents">
  <p class="toc-card__title">In this article</p>
  <ol class="toc-card__list">
${items}
  </ol>
</nav>`;
}

/**
 * Inject TOC + heading anchors into the body HTML. Returns the body
 * unchanged when:
 *   - settings.toc_enabled is false
 *   - fewer than 3 headings (TOC adds no value)
 *   - no first H2 found to anchor against
 */
export function injectTableOfContents(bodyHtml: string): string {
  const s = getSettings();
  if (!s.toc_enabled) return bodyHtml;
  const { html, headings } = extractAndAnchorHeadings(bodyHtml);
  const toc = renderTocHtml(headings);
  if (!toc) return html;
  // Insert TOC directly before the first H2. We want it AFTER the Quick
  // Answer block so the reader sees a one-line summary before the index.
  const firstH2Idx = html.search(/<h2\b/i);
  if (firstH2Idx < 0) return html;
  return html.slice(0, firstH2Idx) + toc + "\n\n" + html.slice(firstH2Idx);
}

// ─── Mid-content + final CTA cards ──────────────────────────────────────

function renderCtaCard(opts: {
  variant: "mid" | "final";
  headline: string;
  body: string;
  buttonLabel: string;
  url: string;
}): string {
  if (!opts.url.trim()) return "";
  const headline = escapeHtml(opts.headline.trim());
  const body = escapeHtml(opts.body.trim());
  const label = escapeHtml(opts.buttonLabel.trim() || "Learn more");
  const href = escapeHtml(opts.url.trim());
  const cls = opts.variant === "final" ? "cta-banner" : "cta-card";
  return `<aside class="${cls}" role="complementary">
  <div class="${cls}__inner">
    <p class="${cls}__headline"><strong>${headline}</strong></p>
    ${body ? `<p class="${cls}__body">${body}</p>` : ""}
    <p class="${cls}__action"><a class="${cls}__button" href="${href}" rel="noopener">${label} &rarr;</a></p>
  </div>
</aside>`;
}

/**
 * Inject the mid-content CTA card after the H2 boundary closest to the
 * halfway point of the body. Falls back to "after the first H2" when
 * there are only 1–2 sections. Returns body unchanged when disabled or
 * URL is empty.
 */
export function injectMidContentCta(bodyHtml: string): string {
  const s = getSettings();
  if (!s.mid_cta_enabled) return bodyHtml;
  const card = renderCtaCard({
    variant: "mid",
    headline: s.mid_cta_headline,
    body: s.mid_cta_body,
    buttonLabel: s.mid_cta_button_label,
    url: s.mid_cta_url,
  });
  if (!card) return bodyHtml;

  // Find every </h2> position. Pick the one nearest the 50% mark of the
  // body. Inserting after a heading-close keeps the card between sections
  // rather than splitting a paragraph.
  const closes: number[] = [];
  const re = /<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyHtml)) !== null) {
    closes.push(m.index + m[0].length);
  }
  if (closes.length === 0) {
    // No H2 at all → append at the very end of body.
    return bodyHtml + "\n\n" + card;
  }
  const midpoint = bodyHtml.length / 2;
  let bestIdx = closes[0];
  let bestDist = Math.abs(closes[0] - midpoint);
  for (const idx of closes) {
    const d = Math.abs(idx - midpoint);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = idx;
    }
  }
  return bodyHtml.slice(0, bestIdx) + "\n\n" + card + "\n\n" + bodyHtml.slice(bestIdx);
}

/**
 * Returns the final CTA banner HTML to append before FAQ / sources.
 * Empty string when disabled or URL is empty.
 */
export function renderFinalCtaHtml(): string {
  const s = getSettings();
  if (!s.final_cta_enabled) return "";
  return renderCtaCard({
    variant: "final",
    headline: s.final_cta_headline,
    body: s.final_cta_body,
    buttonLabel: s.final_cta_button_label,
    url: s.final_cta_url,
  });
}

/**
 * Rewrite every external `<a>` in the HTML to open in a new tab. An
 * external link is any `http(s)://` href whose host differs from the
 * configured `site_url` host. Internal links — relative paths
 * (`/blog/...`), in-page anchors (`#some-id`), and absolute URLs that
 * resolve to the same host as the site — are left as same-tab links.
 *
 * Anchors that already carry a `target=` attribute (e.g. the author-bio
 * profile link, the Sources list) are skipped so we don't duplicate.
 */
export function externalizeLinks(html: string): string {
  const s = getSettings();
  let siteHost = "";
  try {
    if (s.site_url) siteHost = new URL(s.site_url).host.toLowerCase();
  } catch {
    /* invalid site_url → treat every absolute URL as external */
  }
  return html.replace(
    /<a\s+([^>]*?)>/gi,
    (full, attrs: string) => {
      if (/\btarget\s*=/i.test(attrs)) return full;
      const hrefMatch = /\bhref\s*=\s*"([^"]+)"/i.exec(attrs);
      if (!hrefMatch) return full;
      const href = hrefMatch[1];
      if (!/^https?:\/\//i.test(href)) return full;
      try {
        const host = new URL(href).host.toLowerCase();
        if (siteHost && host === siteHost) return full;
      } catch {
        return full;
      }
      return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
    },
  );
}

/**
 * Apply every body-decoration block (TOC + mid-CTA + final-CTA + related
 * + author bio) to an already-marked HTML body, in the same order as the
 * Webflow publisher. Used by both the publish path and the admin Preview
 * tab so what authors see in the editor matches what readers see live.
 *
 * FAQ + Sources are intentionally NOT included here — they're rendered
 * by the publisher in dedicated sections (and conditionally for FAQ when
 * the active Webflow collection has its own faq_html field).
 */
export function decorateBlogBodyHtml(
  bodyHtml: string,
  blog: Blog,
): string {
  let html = injectTableOfContents(bodyHtml);
  html = injectMidContentCta(html);
  const parts: string[] = [html];
  const finalCta = renderFinalCtaHtml();
  if (finalCta) parts.push(finalCta);
  const related = renderRelatedArticlesHtml(blog);
  if (related) parts.push(related);
  const bio = renderAuthorBioHtml(blog.request_id);
  if (bio) parts.push(bio);
  // Rewrite external `<a>` tags to open in a new tab. Internal links
  // (TOC anchors, related-articles, same-host absolute URLs) keep their
  // default same-tab behaviour.
  return externalizeLinks(parts.join("\n\n"));
}

/**
 * Resolve the effective author bio fields by layering a per-request
 * override on top of the global Settings defaults. Any field the
 * request leaves blank falls through to Settings.
 */
export function resolveAuthorBio(
  override?: Pick<
    BlogRequest,
    | "author_bio_name"
    | "author_bio_title"
    | "author_bio_text"
    | "author_bio_image_url"
    | "author_bio_url"
  > | null,
): {
  name: string;
  title: string;
  text: string;
  image: string;
  url: string;
} {
  const s = getSettings();
  const pick = (
    requestVal: string | null | undefined,
    settingsVal: string | undefined,
  ): string => {
    const r = (requestVal ?? "").trim();
    if (r) return r;
    return (settingsVal ?? "").trim();
  };
  return {
    name: pick(override?.author_bio_name, s.author_bio_name),
    title: pick(override?.author_bio_title, s.author_bio_title),
    text: pick(override?.author_bio_text, s.author_bio_text),
    image: pick(override?.author_bio_image_url, s.author_bio_image_url),
    url: pick(override?.author_bio_url, s.author_bio_url),
  };
}

/**
 * Render the configured author bio as a small E-E-A-T block placed near
 * the end of the body. Returns an empty string when the bio is not
 * configured (any of name/title/text empty → skipped). When `requestId`
 * is supplied, per-request overrides from the blog_request row take
 * precedence over the global Settings defaults on a field-by-field basis.
 */
export function renderAuthorBioHtml(requestId?: string | null): string {
  const override = requestId ? getRequest(requestId) : null;
  const bio = resolveAuthorBio(override);
  const name = bio.name;
  const text = bio.text;
  if (!name || !text) return "";

  const title = bio.title;
  const img = bio.image;
  const url = bio.url;

  const avatar = img
    ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(name)}" class="author-bio__avatar" width="64" height="64" />`
    : "";

  const heading = url
    ? `<a href="${escapeHtml(url)}" rel="author noopener" target="_blank">${escapeHtml(name)}</a>`
    : escapeHtml(name);

  const titleLine = title
    ? `<p class="author-bio__title">${escapeHtml(title)}</p>`
    : "";

  // text supports light HTML — strip the most dangerous tags but keep
  // simple inline markup (<a>, <strong>, <em>, <br>).
  const safeText = text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  return `<section class="author-bio" itemscope itemtype="https://schema.org/Person">
  ${avatar}
  <div class="author-bio__body">
    <p class="author-bio__name"><strong itemprop="name">${heading}</strong></p>
    ${titleLine}
    <p class="author-bio__text" itemprop="description">${safeText}</p>
  </div>
</section>`;
}

/**
 * Render a "Related articles" list of up to N most thematically-related
 * published posts. Empty string when none score above zero or the block
 * is disabled in settings.
 */
export function renderRelatedArticlesHtml(blog: Blog): string {
  const s = getSettings();
  if (!s.related_articles_enabled) return "";
  const limit = Math.max(1, Math.min(10, s.related_articles_count || 4));
  const terms = [
    blog.primary_keyword || "",
    ...blog.secondary_keywords,
    blog.title || "",
  ];
  const related = findRelatedPosts(terms, blog.id, limit);
  if (related.length === 0) return "";

  const items = related
    .map(
      (p) =>
        `<li><a href="${escapeHtml(siteBlogUrl(p.slug))}">${escapeHtml(p.title)}</a></li>`,
    )
    .join("\n");

  return `<section class="related-articles">
  <h2>Related articles</h2>
  <ul>
${items}
  </ul>
</section>`;
}

// ─── AggregateRating: detection + builder ────────────────────────────────

const REVIEW_TITLE_RE =
  /\b(vs\.?|versus|review(?:s|ed)?|best\b|top\s*\d+|compare(?:d|s)?|comparison|ranked|alternatives?|rating)\b/i;

/**
 * Returns true when the title reads like a review / comparison / ranking
 * post and is therefore a candidate for AggregateRating schema.
 */
export function looksLikeReviewContent(title: string): boolean {
  if (!title) return false;
  return REVIEW_TITLE_RE.test(title);
}

/**
 * Build an AggregateRating from the configured defaults. Returns null
 * when the rating numbers are out of range or auto-attach is off.
 */
export function defaultAggregateRating(): AggregateRating | null {
  const s = getSettings();
  if (!s.auto_aggregate_rating) return null;
  const value = Number(s.default_rating_value);
  const count = Number(s.default_rating_count);
  if (!Number.isFinite(value) || value <= 0 || value > 5) return null;
  if (!Number.isFinite(count) || count <= 0) return null;
  return {
    ratingValue: Math.round(value * 10) / 10,
    ratingCount: Math.round(count),
    bestRating: 5,
    worstRating: 1,
  };
}
