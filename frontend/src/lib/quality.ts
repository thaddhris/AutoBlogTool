import { db } from "./db";
import { Blog, QualityWarning } from "./types";

// ─── word/sentence/syllable counters ────────────────────────────────────────

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → keep label
    .replace(/[#>*_~]+/g, " ") // markdown punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function words(s: string): string[] {
  return s.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
}

function sentences(s: string): string[] {
  return s.split(/[.!?]+\s+/).filter((p) => p.trim().length > 0);
}

// Syllable approximation (en-US). Good enough for Flesch-Kincaid signal —
// not a phonetic dictionary.
function syllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const m = word.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

export function wordCount(md: string): number {
  return words(stripMarkdown(md)).length;
}

/**
 * Flesch–Kincaid Reading Ease. Higher = easier.
 *   90–100 very easy (5th grade)   60–70 plain English (8–9th grade)
 *   50–60 fairly difficult (10–12) 0–30 very difficult (college / academic)
 * Returns null if too short to score.
 */
export function fleschReadingEase(md: string): number | null {
  const text = stripMarkdown(md);
  const ws = words(text);
  const ss = sentences(text);
  if (ws.length < 30 || ss.length < 2) return null;
  const syl = ws.reduce((acc, w) => acc + syllables(w), 0);
  const ASL = ws.length / ss.length; // avg sentence length
  const ASW = syl / ws.length; // avg syllables per word
  const score = 206.835 - 1.015 * ASL - 84.6 * ASW;
  return Math.round(score * 10) / 10;
}

/**
 * Density = (occurrences of primary_keyword as a phrase) / (total words).
 * Phrase match is case-insensitive, with word-boundary trimming. If no
 * primary keyword, returns null.
 */
export function keywordDensity(
  md: string,
  primaryKeyword: string | null,
): number | null {
  if (!primaryKeyword || !primaryKeyword.trim()) return null;
  const text = stripMarkdown(md).toLowerCase();
  const kw = primaryKeyword.trim().toLowerCase();
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "g");
  const matches = text.match(re) ?? [];
  const total = words(text).length;
  if (total === 0) return null;
  return Math.round((matches.length / total) * 10000) / 10000;
}

// ─── uniqueness (Jaccard on word shingles) ──────────────────────────────────

function shingles(md: string, n = 3): Set<string> {
  const ws = words(stripMarkdown(md));
  const out = new Set<string>();
  for (let i = 0; i <= ws.length - n; i++) {
    out.add(ws.slice(i, i + n).join(" "));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Highest Jaccard similarity (on 3-word shingles) between this draft and
 * any other blog row. Higher = more similar. Spec asks for "lower is
 * better"; we return the **max** similarity found so admins can flag
 * potential duplication directly.
 *
 * Marked simple/local so an embedding-based version can swap in later.
 */
export function uniquenessSimilarity(
  md: string,
  excludeBlogId: string | null,
): number {
  const target = shingles(md);
  if (target.size === 0) return 0;

  type Row = { id: string; content_md: string };
  const rows = db()
    .prepare<[], Row>(
      `SELECT id, content_md FROM blogs WHERE content_md != ''`,
    )
    .all();

  let max = 0;
  for (const r of rows) {
    if (excludeBlogId && r.id === excludeBlogId) continue;
    const other = shingles(r.content_md);
    const sim = jaccard(target, other);
    if (sim > max) max = sim;
  }
  return Math.round(max * 10000) / 10000;
}

// ─── fact-claim regex ────────────────────────────────────────────────────────

const CLAIM_RE =
  /[^.!?\n]*(?:\b\d{4}\b|\b\d+(?:\.\d+)?\s?%|\b\d+(?:,\d{3})+\b|\b\d+x\b|\$\d|[A-Z][a-z]+\s\d{4})[^.!?\n]*[.!?]/g;

export function detectClaims(md: string): string[] {
  const text = stripMarkdown(md);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(CLAIM_RE)) {
    const s = m[0].trim();
    if (s && !seen.has(s) && s.length < 400) {
      seen.add(s);
      out.push(s);
    }
    if (out.length >= 25) break;
  }
  return out;
}

// ─── thresholds + final QC entrypoint ────────────────────────────────────────

const READABILITY_MIN = 50;
const READABILITY_MAX = 75;
const DENSITY_MIN = 0.005; // 0.5%
const DENSITY_MAX = 0.02; // 2%
const UNIQUENESS_MAX = 0.85;

export interface QcResult {
  readability_score: number | null;
  keyword_density: number | null;
  uniqueness_score: number | null;
  word_count: number;
  claims_to_verify: string[];
  warnings: QualityWarning[];
}

export function runQualityChecks(args: {
  content_md: string;
  primary_keyword: string | null;
  title_tag: string | null;
  meta_description: string | null;
  blog_id: string | null;
}): QcResult {
  const warnings: QualityWarning[] = [];
  const readability = fleschReadingEase(args.content_md);
  if (readability !== null && (readability < READABILITY_MIN || readability > READABILITY_MAX)) {
    warnings.push({
      kind: "readability",
      message: `Flesch reading ease ${readability} is outside the 50–75 target range.`,
      value: readability,
    });
  }
  const density = keywordDensity(args.content_md, args.primary_keyword);
  if (density !== null && (density < DENSITY_MIN || density > DENSITY_MAX)) {
    warnings.push({
      kind: "keyword_density",
      message: `Primary keyword density ${(density * 100).toFixed(2)}% is outside the 0.5%–2% target.`,
      value: density,
    });
  }
  const uniqueness = uniquenessSimilarity(args.content_md, args.blog_id);
  if (uniqueness > UNIQUENESS_MAX) {
    warnings.push({
      kind: "uniqueness",
      message: `Body is ${(uniqueness * 100).toFixed(1)}% similar to an existing post (threshold 85%).`,
      value: uniqueness,
    });
  }
  if (args.title_tag && (args.title_tag.length < 30 || args.title_tag.length > 60)) {
    warnings.push({
      kind: "title_tag_length",
      message: `Title tag is ${args.title_tag.length} chars (target 50–60).`,
      value: args.title_tag.length,
    });
  }
  if (
    args.meta_description &&
    (args.meta_description.length < 120 || args.meta_description.length > 165)
  ) {
    warnings.push({
      kind: "meta_description_length",
      message: `Meta description is ${args.meta_description.length} chars (target 150–160).`,
      value: args.meta_description.length,
    });
  }
  return {
    readability_score: readability,
    keyword_density: density,
    uniqueness_score: uniqueness,
    word_count: wordCount(args.content_md),
    claims_to_verify: detectClaims(args.content_md),
    warnings,
  };
}

export function scoreExistingBlog(blog: Blog): QcResult {
  return runQualityChecks({
    content_md: blog.content_md,
    primary_keyword: blog.primary_keyword,
    title_tag: blog.meta_title,
    meta_description: blog.meta_desc,
    blog_id: blog.id,
  });
}
