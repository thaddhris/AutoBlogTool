import Groq from "groq-sdk";
import { getSettings } from "./settings";

// ─── Provider dispatch ─────────────────────────────────────────────────────
//
// Both writer providers expose two operations:
//   - dispatchJson(): chat completion constrained to return JSON
//   - dispatchText(): chat completion returning free-form text/markdown
//
// `llmJson`, `llmJsonValidated`, and `llmText` are thin wrappers that look
// up the active provider from settings and dispatch.

interface ProviderArgs {
  system: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// ─── Groq ──────────────────────────────────────────────────────────────────

function groqClient(): Groq {
  const settings = getSettings();
  if (!settings.groq_api_key) {
    throw new Error(
      "Groq API key not configured. Add it under Settings before generating.",
    );
  }
  return new Groq({ apiKey: settings.groq_api_key });
}

async function groqJson(args: ProviderArgs): Promise<string> {
  const settings = getSettings();
  const groq = groqClient();
  const completion = await groq.chat.completions.create({
    model: args.model ?? settings.groq_model,
    temperature: args.temperature ?? 0.5,
    max_tokens: args.maxTokens ?? 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.prompt },
    ],
  });
  const raw = completion.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("Groq returned an empty response");
  return raw;
}

async function groqText(args: ProviderArgs): Promise<string> {
  const settings = getSettings();
  const groq = groqClient();
  const completion = await groq.chat.completions.create({
    model: args.model ?? settings.groq_model,
    temperature: args.temperature ?? 0.5,
    max_tokens: args.maxTokens ?? 6000,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.prompt },
    ],
  });
  const raw = completion.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("Groq returned an empty response");
  return raw;
}

// ─── Gemini (REST) ─────────────────────────────────────────────────────────
//
// We talk to the Generative Language API directly (same pattern as the image
// generator in `images.ts`) instead of pulling in `@google/generative-ai`,
// because the REST surface is small and we already format prompts ourselves.

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

async function geminiCall(
  args: ProviderArgs & { jsonMode: boolean },
): Promise<string> {
  const settings = getSettings();
  if (!settings.gemini_api_key) {
    throw new Error(
      "Gemini API key not configured. Add it under Settings before generating.",
    );
  }
  const model = args.model || settings.gemini_text_model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  // Gemini lacks a "system" role — fold the system instruction into the
  // dedicated `systemInstruction` field.
  //
  // Two important gotchas for Gemini 2.5 models:
  //  1. Chain-of-thought tokens count against `maxOutputTokens`. For JSON
  //     mode we set `thinkingBudget: 0` so all the budget goes to actual
  //     output — saves an order of magnitude of tokens and fixes truncated
  //     JSON errors.
  //  2. Default cap of 4096 still sometimes truncates large schemas. Bump
  //     to 8192 for JSON; long-form markdown gets 8192 too.
  const isGemini25 = /^gemini-2\.5/.test(model);
  const generationConfig: Record<string, unknown> = {
    temperature: args.temperature ?? 0.5,
    maxOutputTokens: args.maxTokens ?? 8192,
  };
  if (args.jsonMode) {
    generationConfig.responseMimeType = "application/json";
    if (isGemini25) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
  }

  const body: Record<string, unknown> = {
    systemInstruction: { role: "system", parts: [{ text: args.system }] },
    contents: [{ role: "user", parts: [{ text: args.prompt }] }],
    generationConfig,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.gemini_api_key,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed: GeminiResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as GeminiResponse) : {};
  } catch {
    /* leave parsed empty */
  }
  if (!res.ok) {
    const msg = parsed.error?.message || raw.slice(0, 300) || res.statusText;
    throw new Error(`Gemini ${res.status}: ${msg}`);
  }
  if (parsed.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini blocked the request: ${parsed.promptFeedback.blockReason}`,
    );
  }
  const candidate = parsed.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  // MAX_TOKENS means the response was cut off mid-flight — the JSON is
  // guaranteed invalid in that case. Surface a clearer error than the
  // downstream "unterminated string" parse failure.
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error(
      `Gemini hit its output token limit before finishing${
        args.jsonMode ? " — JSON was truncated" : ""
      }. Raise maxTokens, switch to gemini-2.5-pro (larger context), or shorten the prompt.`,
    );
  }
  if (!text) {
    const reason = candidate?.finishReason || "no text in response";
    throw new Error(`Gemini returned an empty response (${reason})`);
  }
  return text;
}

// ─── Dispatch helpers ──────────────────────────────────────────────────────

function activeProvider(): "groq" | "gemini" {
  return getSettings().writer_provider;
}

async function dispatchJson(args: ProviderArgs): Promise<string> {
  return activeProvider() === "gemini"
    ? geminiCall({ ...args, jsonMode: true })
    : groqJson(args);
}

async function dispatchText(args: ProviderArgs): Promise<string> {
  return activeProvider() === "gemini"
    ? geminiCall({ ...args, jsonMode: false })
    : groqText(args);
}

function providerLabel(): string {
  return activeProvider() === "gemini" ? "Gemini" : "Groq";
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Call the active writer model expecting a strict JSON object back. */
export async function llmJson<T>(args: ProviderArgs): Promise<T> {
  const raw = await dispatchJson(args);
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to parse ${providerLabel()} JSON output: ${msg}\nRaw: ${raw.slice(0, 500)}`,
    );
  }
}

/**
 * Like `llmJson`, but validates the response with a caller-supplied validator
 * and retries up to `maxRetries` times on failure. On retry, we append the
 * previous response + the validation error to the prompt so the model can
 * self-correct. After exhausting retries the last validation error is thrown.
 */
export async function llmJsonValidated<T>(
  args: ProviderArgs & {
    validate: (raw: unknown) => T;
    maxRetries?: number;
  },
): Promise<T> {
  const max = args.maxRetries ?? 2;
  let lastErr: unknown;
  let prompt = args.prompt;
  for (let attempt = 0; attempt <= max; attempt++) {
    let raw: unknown;
    try {
      raw = await llmJson<unknown>({
        system: args.system,
        prompt,
        model: args.model,
        temperature: args.temperature,
        maxTokens: args.maxTokens,
      });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      prompt = `${args.prompt}\n\n# Previous attempt failed\n${msg}\nProduce only valid JSON exactly matching the schema above. No prose.`;
      continue;
    }
    try {
      return args.validate(raw);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      prompt = `${args.prompt}\n\n# Previous attempt failed validation\n${msg}\nPrevious output:\n${JSON.stringify(raw).slice(0, 1500)}\nFix every field flagged above and re-emit valid JSON only.`;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? "llmJsonValidated exhausted retries"));
}

/** Call the active writer model for plain text — no JSON constraints. Used for long-form markdown. */
export async function llmText(args: ProviderArgs): Promise<string> {
  return (await dispatchText(args)).trim();
}
