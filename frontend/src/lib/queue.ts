import { logEvent } from "./db";
import { getSettings } from "./settings";
import { pickPending, updateRequest } from "./requests";
import { dueScheduled, updateBlog, getBlogByRequest } from "./blogs";
import { generateBlogForRequest } from "./pipeline";
import { publishBlog } from "./publish";

export interface ProcessResult {
  picked: number;
  generated: number;
  scheduled: number;
  published: number;
  errors: { id: string; error: string }[];
}

/**
 * One cron tick:
 *   1. Pick the top N pending requests and generate drafts.
 *   2. Based on publish_mode, schedule them out at interval steps OR
 *      publish immediately (auto).
 *   3. Then publish any already-scheduled blogs whose scheduled_at has passed.
 */
export async function processQueue(): Promise<ProcessResult> {
  const settings = getSettings();
  const batch = Math.max(1, settings.batch_size || 5);
  const interval = Math.max(0, settings.publish_interval_hours || 0);
  const mode = settings.publish_mode;

  const out: ProcessResult = {
    picked: 0,
    generated: 0,
    scheduled: 0,
    published: 0,
    errors: [],
  };

  // Step 1+2 — generate drafts from pending queue
  const pending = pickPending(batch);
  out.picked = pending.length;
  logEvent("queue.tick.start", `picked ${pending.length} of ${batch}`);

  for (let i = 0; i < pending.length; i++) {
    const req = pending[i];
    try {
      const blog = await generateBlogForRequest(req.id);
      out.generated++;

      if (mode === "draft") {
        // leave as draft; admin will move it manually
        continue;
      }

      if (mode === "auto") {
        await publishBlog(blog.id);
        out.published++;
        continue;
      }

      // mode === "scheduled" — stagger over interval (i*interval hours from now,
      // or all at once if interval is 0).
      const when = new Date();
      when.setHours(when.getHours() + interval * i);
      updateBlog(blog.id, {
        status: "scheduled",
        scheduled_at: when.toISOString(),
      });
      updateRequest(req.id, { status: "scheduled" });
      out.scheduled++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push({ id: req.id, error: msg });
    }
  }

  // Step 3 — drain due scheduled blogs
  const due = dueScheduled();
  for (const blog of due) {
    try {
      await publishBlog(blog.id);
      out.published++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push({ id: blog.id, error: msg });
    }
  }

  // Step 4 — also auto-publish stale drafts that have a scheduled_at? Not yet.
  // The spec says "drafts should automatically move toward publishing unless
  // manually edited" — interpret this as: a draft created in mode=auto already
  // got published above; a draft created in mode=draft is paused intentionally.

  logEvent(
    "queue.tick.done",
    `generated=${out.generated} scheduled=${out.scheduled} published=${out.published} errors=${out.errors.length}`,
  );
  return out;
}

/** Move a draft into the queue for the next cron tick. */
export function moveDraftToScheduled(
  blogId: string,
  scheduledAt: Date,
): void {
  updateBlog(blogId, {
    status: "scheduled",
    scheduled_at: scheduledAt.toISOString(),
  });
  const blog = getBlogByRequest(blogId);
  if (blog) updateRequest(blog.request_id, { status: "scheduled" });
}
