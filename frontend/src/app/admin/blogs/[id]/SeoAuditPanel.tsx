"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import {
  Blog,
  LlmSeoAspectKey,
  LlmSeoAudit,
  SeoAspect,
  SeoAspectKey,
  SeoAudit,
} from "@/lib/types";
import ClientTime from "@/components/ClientTime";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CircleCheck,
  CircleDot,
  Search,
  Bot,
} from "lucide-react";

// Plain-English labels for the traditional rubric.
const ASPECT_LABELS: Record<SeoAspectKey, string> = {
  keyword_optimization: "Keyword optimization",
  metadata: "Metadata (title / description)",
  heading_structure: "Heading structure",
  readability: "Readability",
  internal_linking: "Internal linking",
  schema_markup: "Schema markup",
  alt_text: "Image alt text",
  content_structure: "Content structure",
};

const LLM_ASPECT_LABELS: Record<LlmSeoAspectKey, string> = {
  semantic_clarity: "Semantic clarity",
  ai_readability: "AI readability",
  retrieval_friendliness: "Retrieval-friendliness",
  chunk_quality: "Chunk quality",
  answerability: "Answerability",
  citation_potential: "Citation potential",
  contextual_completeness: "Contextual completeness",
  embedding_optimization: "Embedding optimization",
  topic_coverage: "Topic coverage & depth",
};

const APPLIABLE_LABELS: Record<string, string> = {
  title_tag: "title tag",
  meta_description: "meta description",
  excerpt: "excerpt",
  tldr: "TL;DR",
  faq: "FAQ items",
};

function scoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 75) return "green";
  if (score >= 50) return "amber";
  return "red";
}

function ScoreRing({
  score,
  flavor = "traditional",
  size = "md",
}: {
  score: number;
  flavor?: "traditional" | "llm";
  size?: "sm" | "md";
}) {
  const tone = scoreTone(score);
  const palette =
    flavor === "llm"
      ? {
          green: { stroke: "stroke-teal-500", text: "text-teal-700" },
          amber: { stroke: "stroke-violet-500", text: "text-violet-700" },
          red: { stroke: "stroke-rose-500", text: "text-rose-700" },
        }
      : {
          green: { stroke: "stroke-green-500", text: "text-green-700" },
          amber: { stroke: "stroke-amber-500", text: "text-amber-700" },
          red: { stroke: "stroke-red-500", text: "text-red-700" },
        };
  const colors = palette[tone];
  const r = 28;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const box = size === "sm" ? "w-12 h-12" : "w-20 h-20";
  const txt = size === "sm" ? "text-sm" : "text-lg";
  return (
    <div className={`relative ${box} shrink-0`}>
      <svg viewBox="0 0 72 72" className={`${box} -rotate-90`}>
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          className="stroke-zinc-200"
          strokeWidth="6"
        />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          className={colors.stroke}
          strokeWidth="6"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center font-semibold ${txt} ${colors.text}`}
      >
        {Math.round(score)}
      </div>
    </div>
  );
}

function AspectRow({ label, aspect }: { label: string; aspect: SeoAspect }) {
  const tone = scoreTone(aspect.score);
  const barColor =
    tone === "green"
      ? "bg-green-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <details className="text-sm group">
      <summary className="cursor-pointer flex items-center gap-2 py-1.5">
        <span className="flex-1 text-zinc-700">{label}</span>
        <div className="w-20 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
          <div
            className={`h-full ${barColor}`}
            style={{ width: `${aspect.score}%` }}
          />
        </div>
        <span className="font-mono text-xs text-zinc-700 w-8 text-right">
          {Math.round(aspect.score)}
        </span>
      </summary>
      <ul className="mt-1 mb-2 ml-7 list-disc text-xs text-zinc-600 space-y-1">
        {aspect.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </details>
  );
}

function priorityIcon(priority: "high" | "medium" | "low") {
  if (priority === "high")
    return <AlertTriangle size={12} className="text-red-600 mt-0.5 shrink-0" />;
  if (priority === "medium")
    return <CircleDot size={12} className="text-amber-600 mt-0.5 shrink-0" />;
  return <CircleCheck size={12} className="text-zinc-400 mt-0.5 shrink-0" />;
}

export default function SeoAuditPanel({ blog }: { blog: Blog }) {
  const router = useRouter();
  const [audit, setAudit] = useState<SeoAudit | null>(blog.seo_audit);
  const [llmAudit, setLlmAudit] = useState<LlmSeoAudit | null>(
    blog.llm_seo_audit,
  );
  const [auditing, setAuditing] = useState<"both" | "traditional" | "llm" | null>(
    null,
  );
  const [applying, setApplying] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"traditional" | "llm">(
    "traditional",
  );

  const tradStale =
    audit !== null && audit.blog_updated_at_at_audit !== blog.updated_at;
  const llmStale =
    llmAudit !== null && llmAudit.blog_updated_at_at_audit !== blog.updated_at;

  async function runAudit(type: "both" | "traditional" | "llm") {
    setAuditing(type);
    try {
      const qs = type === "both" ? "" : `?type=${type}`;
      const res = await fetch(`/api/blogs/${blog.id}/seo-audit${qs}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Audit failed");
      if (json.blog?.seo_audit !== undefined && type !== "llm") {
        setAudit(json.blog.seo_audit);
      }
      if (json.blog?.llm_seo_audit !== undefined && type !== "traditional") {
        setLlmAudit(json.blog.llm_seo_audit);
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAuditing(null);
    }
  }

  async function applyField(field: string) {
    setApplying(field);
    try {
      const res = await fetch(`/api/blogs/${blog.id}/seo-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: [field] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Apply failed");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(null);
    }
  }

  async function applyAllRewrites() {
    if (!audit) return;
    const fields = Object.keys(audit.rewrites).filter(
      (k) => audit.rewrites[k as keyof typeof audit.rewrites] !== undefined,
    );
    if (fields.length === 0) return;
    if (
      !confirm(
        `Apply ${fields.length} rewrite${fields.length === 1 ? "" : "s"}?\n\n${fields.map((f) => APPLIABLE_LABELS[f] ?? f).join(", ")}`,
      )
    )
      return;
    setApplying("__all");
    try {
      const res = await fetch(`/api/blogs/${blog.id}/seo-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Apply failed");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(null);
    }
  }

  // ── Empty state — neither audit has been run ────────────────────────────
  if (!audit && !llmAudit) {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
          SEO analysis
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          We run two audits side-by-side: traditional Google-style SEO and
          AI-search readability (how well LLM-driven retrievers, RAG pipelines,
          and answer engines can use this post).
        </p>
        <Button
          onClick={() => runAudit("both")}
          disabled={auditing !== null}
        >
          <Sparkles size={14} />{" "}
          {auditing === "both" ? "Running both audits…" : "Run SEO analysis"}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            SEO analysis
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Two views: how Google sees this post, and how an LLM sees it.
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => runAudit("both")}
          disabled={auditing !== null}
          title="Re-run both audits on the current draft"
          className="whitespace-nowrap shrink-0"
        >
          <RefreshCw size={12} />{" "}
          {auditing === "both" ? "…" : "Re-run"}
        </Button>
      </div>

      {/* Dual score header — stack vertically so titles & dates have room
          to breathe inside the narrow sidebar column. */}
      <div className="flex flex-col gap-2 mb-4">
        <ScoreCard
          flavor="traditional"
          audit={audit}
          stale={tradStale}
          busy={auditing === "traditional" || auditing === "both"}
          onRun={() => runAudit("traditional")}
        />
        <ScoreCard
          flavor="llm"
          audit={llmAudit}
          stale={llmStale}
          busy={auditing === "llm" || auditing === "both"}
          onRun={() => runAudit("llm")}
        />
      </div>

      {/* Tab switcher — only show tabs whose audit exists. */}
      <div className="flex gap-1 border-b border-zinc-200 mb-3">
        {audit && (
          <TabButton
            active={activeTab === "traditional"}
            onClick={() => setActiveTab("traditional")}
            icon={<Search size={12} />}
            label="Traditional SEO"
            score={audit.overall_score}
          />
        )}
        {llmAudit && (
          <TabButton
            active={activeTab === "llm"}
            onClick={() => setActiveTab("llm")}
            icon={<Bot size={12} />}
            label="AI / LLM SEO"
            score={llmAudit.overall_score}
          />
        )}
      </div>

      {activeTab === "traditional" && audit && (
        <TraditionalDetails
          audit={audit}
          applying={applying}
          onApply={applyField}
          onApplyAll={applyAllRewrites}
        />
      )}

      {activeTab === "llm" && llmAudit && <LlmDetails audit={llmAudit} />}
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  score,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  score: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
        active
          ? "border-zinc-800 text-zinc-900 font-medium"
          : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="font-mono text-[10px] text-zinc-400">
        {Math.round(score)}
      </span>
    </button>
  );
}

function ScoreCard({
  flavor,
  audit,
  stale,
  busy,
  onRun,
}: {
  flavor: "traditional" | "llm";
  audit: { overall_score: number; generated_at: string } | null;
  stale: boolean;
  busy: boolean;
  onRun: () => void;
}) {
  const title =
    flavor === "traditional" ? "Traditional SEO" : "AI / LLM SEO";
  const subtitle =
    flavor === "traditional"
      ? "How search engines rank this post."
      : "How LLM-driven search and RAG see this post.";
  const Icon = flavor === "traditional" ? Search : Bot;
  const accentBg =
    flavor === "traditional" ? "bg-zinc-50" : "bg-violet-50/50";

  if (!audit) {
    return (
      <div
        className={`rounded-md border border-zinc-200 ${accentBg} p-2.5 flex items-center gap-3`}
      >
        <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 shrink-0">
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-zinc-700 truncate">
            {title}
          </div>
          <div className="text-[11px] text-zinc-500 truncate">{subtitle}</div>
        </div>
        <Button
          variant="secondary"
          onClick={onRun}
          disabled={busy}
          className="text-xs shrink-0 px-2 py-1"
        >
          <Sparkles size={12} /> {busy ? "…" : "Run"}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border border-zinc-200 ${accentBg} p-2.5 flex items-center gap-3`}
    >
      <ScoreRing score={audit.overall_score} flavor={flavor} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-700">
          <Icon size={12} className="shrink-0" />
          <span className="truncate">{title}</span>
          {stale && (
            <span
              className="text-[10px] text-amber-700 shrink-0"
              title="The post was edited after this audit ran"
            >
              · stale
            </span>
          )}
        </div>
        <div className="text-[10px] text-zinc-400 truncate">
          <ClientTime at={audit.generated_at} />
        </div>
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={busy}
        className="text-[10px] uppercase tracking-wide text-violet-700 hover:text-violet-900 underline disabled:opacity-50 shrink-0"
      >
        {busy ? "…" : "re-run"}
      </button>
    </div>
  );
}

function TraditionalDetails({
  audit,
  applying,
  onApply,
  onApplyAll,
}: {
  audit: SeoAudit;
  applying: string | null;
  onApply: (field: string) => void;
  onApplyAll: () => void;
}) {
  const appliableRewrites = Object.entries(audit.rewrites).filter(
    ([, v]) =>
      v !== undefined && (typeof v !== "object" || Object.keys(v).length > 0),
  );
  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-xs text-zinc-600">
        {audit.overall_score >= 75
          ? "Strong shape. A few tweaks would push it to exceptional."
          : audit.overall_score >= 50
            ? "Workable, but several aspects need attention before publish."
            : "Significant gaps. Address the high-priority recommendations first."}
      </div>

      <div className="border-t border-zinc-100 pt-3 mb-3">
        {(Object.keys(audit.aspects) as SeoAspectKey[]).map((k) => (
          <AspectRow key={k} label={ASPECT_LABELS[k]} aspect={audit.aspects[k]} />
        ))}
      </div>

      {audit.recommendations.length > 0 && (
        <div className="border-t border-zinc-100 pt-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
            Recommendations
          </div>
          <ul className="space-y-2">
            {audit.recommendations.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-zinc-700"
              >
                {priorityIcon(r.priority)}
                <div className="flex-1">
                  <span>{r.action}</span>
                  {r.field && audit.rewrites[r.field] && (
                    <button
                      type="button"
                      onClick={() => onApply(r.field as string)}
                      disabled={applying !== null}
                      className="ml-2 text-[10px] uppercase tracking-wide text-violet-700 hover:text-violet-900 underline disabled:opacity-50"
                    >
                      {applying === r.field ? "applying…" : "apply"}
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-zinc-400 uppercase">
                  {ASPECT_LABELS[r.aspect] ?? r.aspect.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {appliableRewrites.length > 0 && (
        <div className="border-t border-zinc-100 pt-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              Auto-apply suggestions
            </div>
            <button
              type="button"
              onClick={onApplyAll}
              disabled={applying !== null}
              className="text-[11px] text-violet-700 hover:text-violet-900 underline disabled:opacity-50"
            >
              {applying === "__all" ? "Applying all…" : "Apply all"}
            </button>
          </div>
          <ul className="space-y-2">
            {appliableRewrites.map(([field, value]) => (
              <li key={field} className="text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-zinc-500 uppercase tracking-wide text-[10px]">
                    {APPLIABLE_LABELS[field] ?? field}
                  </span>
                  <button
                    type="button"
                    onClick={() => onApply(field)}
                    disabled={applying !== null}
                    className="text-[11px] text-violet-700 hover:text-violet-900 underline disabled:opacity-50"
                  >
                    {applying === field ? "applying…" : "apply"}
                  </button>
                </div>
                {field === "faq" && Array.isArray(value) ? (
                  <div className="text-zinc-700 space-y-1.5 mt-1">
                    {(value as { q: string; a: string }[]).map((f, i) => (
                      <div
                        key={i}
                        className="pl-2 border-l-2 border-zinc-200"
                      >
                        <div className="font-medium">{f.q}</div>
                        <div className="text-zinc-600">{f.a}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-zinc-700 italic">
                    &ldquo;{String(value)}&rdquo;
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Badge tone="green">
        {appliableRewrites.length} auto-fixable ·{" "}
        {audit.recommendations.length} total recommendations
      </Badge>
    </>
  );
}

function LlmDetails({ audit }: { audit: LlmSeoAudit }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-3 text-xs text-zinc-600">
        {audit.overall_score >= 75
          ? "Reads cleanly for AI retrievers. Chunks stand alone, claims are grounded."
          : audit.overall_score >= 50
            ? "Passable, but LLMs may struggle with cross-references or thin context. See below."
            : "AI-search systems will have trouble with this. Address high-priority items first."}
      </div>

      <div className="border-t border-zinc-100 pt-3 mb-3">
        {(Object.keys(audit.aspects) as LlmSeoAspectKey[]).map((k) => (
          <AspectRow
            key={k}
            label={LLM_ASPECT_LABELS[k]}
            aspect={audit.aspects[k]}
          />
        ))}
      </div>

      {audit.recommendations.length > 0 && (
        <div className="border-t border-zinc-100 pt-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
            Recommendations
          </div>
          <ul className="space-y-2">
            {audit.recommendations.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-zinc-700"
              >
                {priorityIcon(r.priority)}
                <div className="flex-1">{r.action}</div>
                <span className="text-[10px] text-zinc-400 uppercase">
                  {LLM_ASPECT_LABELS[r.aspect] ?? r.aspect.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Badge tone="violet">
        {audit.recommendations.length} recommendation
        {audit.recommendations.length === 1 ? "" : "s"}
      </Badge>
    </>
  );
}
