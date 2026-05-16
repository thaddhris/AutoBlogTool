import { logEvent } from "./db";
import { getSettings } from "./settings";
import { pickPending, updateRequest } from "./requests";
import { dueDrafts, updateBlog, getBlogByRequest } from "./blogs";
import { generateBlogForRequest } from "./pipeline";
import { publishBlog } from "./publish";

export interface QueueTickResult {
  picked: number;
  generated: number;
  held: number;
  errors: { id: string; error: string }[];
}

export interface PublishTickResult {
  due: number;
  published: number;
  errors: { id: string; error: string }[];
}

/**
 * QUEUE TICK — called by n8n (or any external scheduler) on its own cadence
 * (e.g. every 5–15 min).
 *
 * Pure intake: pick the highest-priority pending requests and generate drafts.
 * Each draft is stamped with `scheduled_at = now + draft_hold_hours` if mode
 * is `auto` (so the draft will be picked up by the publish tick when its hold
 * expires) or left without a timer if mode is `manual`.
 *
 * This function NEVER publishes. Publishing is the publish tick's job.
 */
export async function processQueue(): Promise<QueueTickResult> {
  const settings = getSettings();
  const batch = Math.max(1, settings.batch_size || 5);
  const hold = Math.max(0, settings.draft_hold_hours ?? 24);
  const mode = settings.publish_mode;

  const out: QueueTickResult = {
    picked: 0,
    generated: 0,
    held: 0,
    errors: [],
  };

  const pending = pickPending(batch);
  out.picked = pending.length;
  logEvent("queue.tick.start", `picked ${pending.length} of ${batch}`);

  for (const req of pending) {
    try {
      const blog = await generateBlogForRequest(req.id);
      out.generated++;

      if (mode === "auto") {
        const when = new Date(Date.now() + hold * 60 * 60 * 1000);
        updateBlog(blog.id, { scheduled_at: when.toISOString() });
        out.held++;
      }
      // mode === "manual" — leave draft with no scheduled_at; admin must act.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push({ id: req.id, error: msg });
    }
  }

  logEvent(
    "queue.tick.done",
    `generated=${out.generated} held=${out.held} errors=${out.errors.length}`,
  );
  return out;
}

/**
 * PUBLISH TICK — called by n8n on a faster cadence (e.g. every 1–5 min).
 *
 * Finds any draft whose `scheduled_at` is in the past and publishes it. This
 * is what makes the "draft hold" timer actually trigger an auto-publish.
 */
export async function drainExpiredDrafts(): Promise<PublishTickResult> {
  const out: PublishTickResult = { due: 0, published: 0, errors: [] };
  const due = dueDrafts();
  out.due = due.length;
  logEvent("publish.tick.start", `due ${due.length}`);

  for (const blog of due) {
    try {
      await publishBlog(blog.id);
      out.published++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push({ id: blog.id, error: msg });
    }
  }
  logEvent(
    "publish.tick.done",
    `published=${out.published} errors=${out.errors.length}`,
  );
  return out;
}

/**
 * Admin action: pin a specific auto-publish time on a draft. The publish tick
 * picks it up when the time arrives. Status stays 'draft' throughout.
 */
export function setDraftHold(blogId: string, scheduledAt: Date | null): void {
  updateBlog(blogId, {
    scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
  });
  const blog = getBlogByRequest(blogId);
  if (blog) {
    // Request status mirrors the blog stage for the dashboard.
    updateRequest(blog.request_id, { status: "draft" });
  }
}
