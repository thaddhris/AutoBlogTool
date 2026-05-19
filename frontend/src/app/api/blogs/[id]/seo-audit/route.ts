import { NextRequest } from "next/server";
import { getBlog, updateBlog } from "@/lib/blogs";
import { auditLlmSeo, auditTraditionalSeo } from "@/lib/seoAudit";
import { logEvent } from "@/lib/db";

/**
 * Run both SEO audits on a blog (traditional + LLM/AI-crawlability).
 *
 * Query string:
 *   ?type=traditional → only run the traditional auditor
 *   ?type=llm         → only run the LLM-SEO auditor
 *   (omitted)         → run both in parallel
 *
 * Results are cached on `blogs.seo_audit_json` and `blogs.llm_seo_audit_json`
 * so the editor doesn't re-burn tokens on every page load.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const blog = getBlog(id);
  if (!blog) return Response.json({ error: "Blog not found" }, { status: 404 });

  const type = new URL(req.url).searchParams.get("type"); // null | "traditional" | "llm"
  const runTraditional = type !== "llm";
  const runLlm = type !== "traditional";

  try {
    const [traditional, llm] = await Promise.all([
      runTraditional ? auditTraditionalSeo(blog) : Promise.resolve(null),
      runLlm ? auditLlmSeo(blog) : Promise.resolve(null),
    ]);

    const patch: Parameters<typeof updateBlog>[1] = {};
    if (traditional) patch.seo_audit = traditional;
    if (llm) patch.llm_seo_audit = llm;
    const updated = updateBlog(id, patch);

    logEvent(
      "seo.audit.ok",
      `${blog.title}` +
        (traditional ? ` trad=${traditional.overall_score}` : "") +
        (llm ? ` llm=${llm.overall_score}` : ""),
      {
        blogId: id,
        payload: {
          traditional_score: traditional?.overall_score ?? null,
          llm_score: llm?.overall_score ?? null,
          traditional_recommendations: traditional?.recommendations.length ?? 0,
          llm_recommendations: llm?.recommendations.length ?? 0,
        },
      },
    );

    return Response.json({ blog: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent("seo.audit.fail", msg, { blogId: id });
    return Response.json({ error: msg }, { status: 500 });
  }
}
