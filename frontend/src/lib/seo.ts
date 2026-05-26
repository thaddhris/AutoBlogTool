import { Blog } from "./types";
import { getSettings } from "./settings";
import { absolutizeBannerUrl } from "./images";
import { resolveAuthorBio } from "./seoBlocks";
import { getRequest } from "./requests";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Produce a kebab-case, keyword-led slug capped at 5 words. Falls back to
 * the title-derived slug if the keyword is empty.
 */
export function keywordSlug(title: string, primaryKeyword: string | null): string {
  const kw = (primaryKeyword ?? "").trim();
  const base = kw || title;
  const words = slugify(base).split("-").filter(Boolean).slice(0, 5);
  return words.join("-") || slugify(title);
}

// ─── JSON-LD ────────────────────────────────────────────────────────────────

function siteBlogUrl(slug: string): string {
  const base = (getSettings().site_url || "").replace(/\/$/, "");
  return base ? `${base}/blog/${slug}` : `/blog/${slug}`;
}

function organizationLd() {
  const s = getSettings();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s.brand_name,
    url: s.site_url || undefined,
  };
}

function publisherLd() {
  const s = getSettings();
  return {
    "@type": "Organization",
    name: s.brand_name,
  };
}

function authorLd(authorName: string | null, requestId: string | null) {
  const s = getSettings();
  // Prefer the configured E-E-A-T author bio when present so the
  // BlogPosting Person carries real credential signals (name, title,
  // image, sameAs). Per-request overrides on the blog_request row take
  // precedence over the global Settings defaults on a field-by-field
  // basis so admins can attribute a single post to a different SME.
  const override = requestId ? getRequest(requestId) : null;
  const bio = resolveAuthorBio(override);
  if (bio.name) {
    const person: Record<string, unknown> = {
      "@type": "Person",
      name: bio.name,
    };
    if (bio.title) person.jobTitle = bio.title;
    if (bio.image) person.image = bio.image;
    if (bio.url) {
      person.url = bio.url;
      person.sameAs = [bio.url];
    }
    return person;
  }
  const name = authorName?.trim() || s.brand_name;
  return { "@type": "Person", name };
}

export function blogPostingLd(blog: Blog) {
  const url = siteBlogUrl(blog.slug);
  const image =
    absolutizeBannerUrl(blog.banner_url) ||
    (blog.banner_url?.startsWith("http") ? blog.banner_url : undefined);
  const aggregateRating = blog.aggregate_rating
    ? {
        "@type": "AggregateRating",
        ratingValue: blog.aggregate_rating.ratingValue,
        ratingCount: blog.aggregate_rating.ratingCount,
        bestRating: blog.aggregate_rating.bestRating ?? 5,
        worstRating: blog.aggregate_rating.worstRating ?? 1,
      }
    : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: blog.meta_title || blog.title,
    description: blog.meta_desc,
    image: image ? [image] : undefined,
    datePublished: blog.published_at ?? undefined,
    dateModified: blog.updated_at,
    author: authorLd(blog.author, blog.request_id ?? null),
    publisher: publisherLd(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords:
      [blog.primary_keyword, ...blog.secondary_keywords, ...blog.keywords]
        .filter(Boolean)
        .join(", ") || undefined,
    inLanguage: "en-US",
    // ── AEO: SpeakableSpecification ──
    // Tells voice assistants (Google Assistant, Siri-via-Schema, etc.) which
    // parts of the page they can read aloud. We point at:
    //   • h1                — the title
    //   • .quick-answer     — the 40-60 word self-contained answer block
    //                         the body now opens with (also doubles as
    //                         featured-snippet bait for Google).
    //   • .key-takeaways    — the closing bullet list, useful for
    //                         summarisation by AI search engines.
    // Selectors are CSS, not XPath, because every modern voice agent
    // implements the CSS form and it survives Webflow's sanitisation.
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", ".quick-answer", ".key-takeaways"],
    },
    // ── AEO: explicit "isAccessibleForFree" + license signals so AI search
    // engines know the content can be cited freely. ──
    isAccessibleForFree: true,
    isFamilyFriendly: true,
    // ── Rich-snippet rating (only for review/comparison content) ──
    aggregateRating,
  };
}

/**
 * Returns true when the post's title or primary keyword matches one of
 * the configured product/feature-page signals — used to decide whether
 * the BlogPosting JSON-LD should be accompanied by a SoftwareApplication
 * object (rich-snippet eligibility for product carousels).
 */
export function looksLikeProductPage(blog: Blog): boolean {
  const s = getSettings();
  if (!s.software_application_enabled) return false;
  const signals = (s.software_application_keywords || [])
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (signals.length === 0) return false;
  const haystack = `${blog.title || ""} ${blog.primary_keyword || ""}`.toLowerCase();
  return signals.some((sig) => haystack.includes(sig));
}

/**
 * Build a SoftwareApplication JSON-LD object for product / feature
 * posts. Returns null when the post isn't flagged as a product page or
 * required settings are missing.
 */
export function softwareApplicationLd(blog: Blog) {
  if (!looksLikeProductPage(blog)) return null;
  const s = getSettings();
  const url = siteBlogUrl(blog.slug);
  const image =
    absolutizeBannerUrl(blog.banner_url) ||
    (blog.banner_url?.startsWith("http") ? blog.banner_url : undefined);
  const aggregateRating = blog.aggregate_rating
    ? {
        "@type": "AggregateRating",
        ratingValue: blog.aggregate_rating.ratingValue,
        ratingCount: blog.aggregate_rating.ratingCount,
        bestRating: blog.aggregate_rating.bestRating ?? 5,
        worstRating: blog.aggregate_rating.worstRating ?? 1,
      }
    : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: blog.h1 || blog.title,
    description: blog.meta_desc,
    applicationCategory: s.software_application_category || "BusinessApplication",
    operatingSystem: s.software_application_operating_system || "Web",
    url,
    image: image ? [image] : undefined,
    publisher: publisherLd(),
    inLanguage: "en-US",
    aggregateRating,
    // Schema.org requires `offers` for "Software product" rich results.
    // We always emit a no-price Offer pointing at the canonical URL so
    // Google can still surface the product carousel — admins who want a
    // priced Offer can replace this via the schema-edit panel later.
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "USD",
      price: "0",
      availability: "https://schema.org/InStock",
    },
  };
}

export function faqPageLd(items: { q: string; a: string }[]) {
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: i.a,
        // Marking each Answer as inLanguage en-US + the same accessibility
        // signals as the parent BlogPosting helps Perplexity / ChatGPT
        // citation rates. They preferentially cite Answers with full
        // structured metadata over plain prose.
        inLanguage: "en-US",
      },
    })),
  };
}

export function breadcrumbLd(blog: Blog) {
  const base = (getSettings().site_url || "").replace(/\/$/, "");
  const items = [
    { name: "Home", url: base || "/" },
    { name: "Blog", url: base ? `${base}/blog` : "/blog" },
    { name: blog.title, url: siteBlogUrl(blog.slug) },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Drop undefined / empty arrays so JSON-LD output is compact and valid. */
function compact<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(compact).filter((v) => v !== undefined) as unknown as T;
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      const c = compact(v);
      if (c !== undefined) out[k] = c;
    }
    return out as T;
  }
  return obj;
}

/**
 * Build the three JSON-LD docs for a blog (BlogPosting + FAQPage +
 * BreadcrumbList) and return them as ready-to-inject <script> tags. Designed
 * to be appended to the body HTML so Webflow's rich-text field carries them
 * through to the rendered page <body>.
 */
export function jsonLdScriptBlock(blog: Blog): string {
  const blocks: unknown[] = [compact(blogPostingLd(blog))];
  const faq = faqPageLd(blog.faq);
  if (faq) blocks.push(compact(faq));
  const app = softwareApplicationLd(blog);
  if (app) blocks.push(compact(app));
  blocks.push(compact(breadcrumbLd(blog)));
  return blocks
    .map(
      (b) =>
        `<script type="application/ld+json">${JSON.stringify(b)}</script>`,
    )
    .join("\n");
}

/** Same as above but returns a structured object (no script tags). Useful
 *  when the publisher writes to a dedicated Webflow field. */
export function jsonLdObjects(blog: Blog) {
  const faq = faqPageLd(blog.faq);
  const app = softwareApplicationLd(blog);
  return {
    blogPosting: compact(blogPostingLd(blog)),
    faqPage: faq ? compact(faq) : null,
    softwareApplication: app ? compact(app) : null,
    breadcrumb: compact(breadcrumbLd(blog)),
    organization: compact(organizationLd()),
  };
}

// ─── legacy helpers kept for back-compat with older code paths ──────────────

export function blogJsonLd(opts: {
  title: string;
  description: string;
  url: string;
  brand: string;
  publishedAt?: string | null;
  image?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: opts.title,
    description: opts.description,
    image: opts.image ? [opts.image] : undefined,
    datePublished: opts.publishedAt ?? undefined,
    author: { "@type": "Organization", name: opts.brand },
    publisher: { "@type": "Organization", name: opts.brand },
    mainEntityOfPage: opts.url,
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return faqPageLd(items);
}
