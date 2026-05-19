import { LlmSeoAudit, SeoAudit } from "@/lib/types";

function toneClasses(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function aiToneClasses(score: number): string {
  // Same thresholds, different hue so the AI pill is visually distinct from
  // the traditional one when both render side by side.
  if (score >= 75) return "bg-teal-100 text-teal-800";
  if (score >= 50) return "bg-violet-100 text-violet-800";
  return "bg-rose-100 text-rose-800";
}

function sizeClassFor(size: "xs" | "sm" | "md"): string {
  return size === "md"
    ? "text-sm px-2 py-0.5"
    : size === "sm"
      ? "text-xs px-2 py-0.5"
      : "text-[10px] px-1.5 py-0.5";
}

/**
 * Compact traditional-SEO score pill. Used on dashboard kanban cards, list
 * tables, and the blog detail header — same look everywhere. Renders nothing
 * when `audit` is null so callers can drop it in unconditionally.
 */
export function SeoScorePill({
  audit,
  size = "sm",
  showLabel = false,
}: {
  audit: SeoAudit | null;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  if (!audit) return null;
  const rounded = Math.round(audit.overall_score);
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold rounded ${sizeClassFor(size)} ${toneClasses(rounded)}`}
      title={`Traditional SEO: ${rounded}/100 · ${audit.recommendations.length} recommendations`}
    >
      {showLabel && <span className="font-normal opacity-70">SEO</span>}
      {rounded}
    </span>
  );
}

/**
 * Compact LLM/AI-crawlability score pill. Same shape as `SeoScorePill` but a
 * different colour family so a reader can tell them apart at a glance when
 * both render side by side.
 */
export function LlmSeoScorePill({
  audit,
  size = "sm",
  showLabel = false,
}: {
  audit: LlmSeoAudit | null;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  if (!audit) return null;
  const rounded = Math.round(audit.overall_score);
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold rounded ${sizeClassFor(size)} ${aiToneClasses(rounded)}`}
      title={`AI / LLM SEO: ${rounded}/100 · ${audit.recommendations.length} recommendations`}
    >
      {showLabel && <span className="font-normal opacity-70">AI</span>}
      {rounded}
    </span>
  );
}

/**
 * Placeholder for blogs that haven't been audited yet. Used in places where
 * we want admins to know an audit is missing rather than render nothing.
 */
export function SeoScoreEmpty({
  size = "sm",
}: {
  size?: "xs" | "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex items-center font-mono rounded bg-zinc-100 text-zinc-500 ${sizeClassFor(size)}`}
      title="No SEO audit yet — run one from the blog editor"
    >
      —
    </span>
  );
}
