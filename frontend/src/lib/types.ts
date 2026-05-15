export type ResourceType = "pdf" | "docx" | "url" | "note" | "doc";

export type ResourceStatus = "pending" | "processing" | "ready" | "error";

export interface Resource {
  id: string;
  request_id: string;
  name: string;
  type: ResourceType;
  source: string;
  content: string;
  status: ResourceStatus;
  error: string | null;
  created_at: string;
}

// Stages of a blog request as it flows through the queue.
//  - pending:   waiting in queue, not yet picked
//  - processing: AI is actively generating
//  - draft:      generated, awaiting review (publish_mode=review) or scheduling
//  - scheduled:  has scheduled_at in the future
//  - published:  successfully published
//  - failed:     generation or publish errored out
export type RequestStatus =
  | "pending"
  | "processing"
  | "draft"
  | "scheduled"
  | "published"
  | "failed";

export interface BlogRequest {
  id: string;
  label: string;
  topic: string;
  keywords: string[];
  instructions: string;
  priority: number;
  status: RequestStatus;
  blog_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type BlogStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export interface Blog {
  id: string;
  request_id: string;
  title: string;
  slug: string;
  excerpt: string;
  content_md: string;
  meta_title: string;
  meta_desc: string;
  keywords: string[];
  tags: string[];
  faq: { q: string; a: string }[];
  schema_json: string;
  banner_url: string | null;
  banner_alt: string | null;
  status: BlogStatus;
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
}

export type PublishMode = "draft" | "scheduled" | "auto";

export interface Settings {
  groq_api_key: string;
  groq_model: string;
  brand_name: string;
  brand_tone: string;
  cron_secret: string;
  batch_size: number;
  publish_interval_hours: number;
  publish_mode: PublishMode;
  default_publisher: "markdown";
  words_target: number;
  image_provider: "placeholder";
}

export const DEFAULT_SETTINGS: Settings = {
  groq_api_key: "",
  groq_model: "llama-3.3-70b-versatile",
  brand_name: "Faclon Labs",
  brand_tone:
    "Authoritative, technical-but-accessible, focused on industrial AI / IoT outcomes for plant operations leaders. Avoid hype; emphasize concrete value and ROI.",
  cron_secret: "",
  batch_size: 5,
  publish_interval_hours: 24,
  publish_mode: "auto",
  default_publisher: "markdown",
  words_target: 1200,
  image_provider: "placeholder",
};
