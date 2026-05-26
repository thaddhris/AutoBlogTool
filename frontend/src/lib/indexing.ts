import crypto from "crypto";
import { logEvent } from "./db";
import { getSettings } from "./settings";

// ─── Google Indexing API ────────────────────────────────────────────────
//
// The Indexing API is officially scoped to "JobPosting" and "BroadcastEvent"
// but Google still accepts URL submissions for other content types and
// uses them as a crawl signal. Setting up:
//   1. Create a service account in Google Cloud Console.
//   2. Grant it the "owner" role on the Search Console property.
//   3. Enable the Indexing API in Cloud Console.
//   4. Paste the full JSON key into Settings → SEO Intelligence.

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function parseServiceAccount(json: string): ServiceAccountKey | null {
  const trimmed = json.trim();
  if (!trimmed) return null;
  try {
    const v = JSON.parse(trimmed);
    if (
      v &&
      typeof v === "object" &&
      typeof v.client_email === "string" &&
      typeof v.private_key === "string"
    ) {
      return v as ServiceAccountKey;
    }
    return null;
  } catch {
    return null;
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Build a self-signed JWT for the service account and exchange it for an
 * access token at oauth2.googleapis.com/token. Returns null on failure
 * (caller logs + skips the ping — never throws so a publish never fails
 * because of indexing flakiness).
 */
async function getGoogleAccessToken(
  sa: ServiceAccountKey,
): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const encHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const encClaims = base64UrlEncode(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${encHeader}.${encClaims}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = signer.sign(sa.private_key);
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });
    const body = (await res.json()) as { access_token?: string };
    if (!res.ok || !body.access_token) return null;
    return body.access_token;
  } catch {
    return null;
  }
}

async function pingGoogleIndexing(url: string): Promise<{
  ok: boolean;
  status?: number;
  detail?: string;
}> {
  const s = getSettings();
  if (!s.google_indexing_enabled) return { ok: false, detail: "disabled" };
  const sa = parseServiceAccount(s.google_indexing_service_account_json);
  if (!sa) return { ok: false, detail: "service account not configured" };

  const token = await getGoogleAccessToken(sa);
  if (!token) return { ok: false, detail: "failed to mint access token" };

  try {
    const res = await fetch(
      "https://indexing.googleapis.com/v3/urlNotifications:publish",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, type: "URL_UPDATED" }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        detail: detail.slice(0, 200) || res.statusText,
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// ─── IndexNow (Bing, Yandex, Seznam, Naver, Yep) ───────────────────────
//
// One-time setup:
//   1. Generate a key (8–128 chars hex/UUID; we use a random 32-char one).
//   2. Upload `<key>.txt` to your site root containing just the key.
//   3. Paste the key into Settings → SEO Intelligence.
// The ping is a simple GET; participating engines verify ownership by
// re-fetching the key file from your site root.

async function pingIndexNow(url: string): Promise<{
  ok: boolean;
  status?: number;
  detail?: string;
}> {
  const s = getSettings();
  if (!s.indexnow_enabled) return { ok: false, detail: "disabled" };
  const key = (s.indexnow_key || "").trim();
  if (!key) return { ok: false, detail: "no key" };

  // Derive the host from the URL so IndexNow can locate the key file at
  // `https://<host>/<key>.txt`. Falls back to the URL host on parse error.
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return { ok: false, detail: "invalid url" };
  }

  const endpoint =
    `https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}` +
    `&key=${encodeURIComponent(key)}` +
    `&keyLocation=${encodeURIComponent(`https://${host}/${key}.txt`)}`;

  try {
    const res = await fetch(endpoint, { method: "GET" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        detail: detail.slice(0, 200) || res.statusText,
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Submit a freshly-published URL to every configured indexing endpoint.
 * Never throws — failures are logged and skipped so they can't break the
 * publish pipeline.
 */
export async function submitForIndexing(opts: {
  url: string;
  blogId: string;
  requestId: string;
}): Promise<void> {
  const s = getSettings();
  // Resolve the public URL — if Webflow returned an API URL but we have
  // a site_url + slug, we'd prefer the canonical /blog/<slug> path. For
  // now we use whatever the caller passes; the publisher computes a
  // canonical URL via published_url in its own logic. Indexing endpoints
  // accept both, but for ranking signal we want the canonical public URL.
  const publicUrl = opts.url;

  if (s.google_indexing_enabled) {
    const result = await pingGoogleIndexing(publicUrl);
    if (result.ok) {
      logEvent("indexing.google.ok", publicUrl, {
        blogId: opts.blogId,
        requestId: opts.requestId,
      });
    } else {
      logEvent(
        "indexing.google.fail",
        `${result.detail ?? "unknown"}${result.status ? ` (HTTP ${result.status})` : ""}`,
        { blogId: opts.blogId, requestId: opts.requestId },
      );
    }
  }

  if (s.indexnow_enabled) {
    const result = await pingIndexNow(publicUrl);
    if (result.ok) {
      logEvent("indexing.indexnow.ok", publicUrl, {
        blogId: opts.blogId,
        requestId: opts.requestId,
      });
    } else {
      logEvent(
        "indexing.indexnow.fail",
        `${result.detail ?? "unknown"}${result.status ? ` (HTTP ${result.status})` : ""}`,
        { blogId: opts.blogId, requestId: opts.requestId },
      );
    }
  }
}

/**
 * Generate a 32-char hex key suitable for IndexNow. Exposed so the
 * Settings UI can offer a "Generate" button.
 */
export function generateIndexNowKey(): string {
  return crypto.randomBytes(16).toString("hex");
}
