import { Blog } from "./types";
import { getSettings } from "./settings";
import { absolutizeBannerUrl } from "./images";

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

function authorLd(authorName: string | null) {
  const s = getSettings();
  const name = authorName?.trim() || s.brand_name;
  return { "@type": "Person", name };
}

export function blogPostingLd(blog: Blog) {
  const url = siteBlogUrl(blog.slug);
  const image =
    absolutizeBannerUrl(blog.banner_url) ||
    (blog.banner_url?.startsWith("http") ? blog.banner_url : undefined);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: blog.meta_title || blog.title,
    description: blog.meta_desc,
    image: image ? [image] : undefined,
    datePublished: blog.published_at ?? undefined,
    dateModified: blog.updated_at,
    author: authorLd(blog.author),
    publisher: publisherLd(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords:
      [blog.primary_keyword, ...blog.secondary_keywords, ...blog.keywords]
        .filter(Boolean)
        .join(", ") || undefined,
    inLanguage: "en-US",
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
      acceptedAnswer: { "@type": "Answer", text: i.a },
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
  return {
    blogPosting: compact(blogPostingLd(blog)),
    faqPage: faq ? compact(faq) : null,
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
