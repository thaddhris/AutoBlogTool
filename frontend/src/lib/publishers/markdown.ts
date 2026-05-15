import path from "node:path";
import fs from "node:fs";
import { Blog } from "../types";

const OUT_DIR = path.join(process.cwd(), ".published");

export interface PublishResult {
  url: string;
}

export async function publish(blog: Blog): Promise<PublishResult> {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${blog.slug}.md`);
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(blog.title)}`,
    `slug: ${blog.slug}`,
    `excerpt: ${JSON.stringify(blog.excerpt)}`,
    `meta_title: ${JSON.stringify(blog.meta_title)}`,
    `meta_desc: ${JSON.stringify(blog.meta_desc)}`,
    `keywords: ${JSON.stringify(blog.keywords)}`,
    `tags: ${JSON.stringify(blog.tags)}`,
    `published_at: ${new Date().toISOString()}`,
    "---",
    "",
  ].join("\n");
  fs.writeFileSync(file, frontmatter + blog.content_md, "utf8");
  return { url: `/published/${blog.slug}.md` };
}
