import Groq from "groq-sdk";
import { getSettings } from "./settings";

function client(): Groq {
  const settings = getSettings();
  if (!settings.groq_api_key) {
    throw new Error(
      "Groq API key not configured. Add it under Settings before generating.",
    );
  }
  return new Groq({ apiKey: settings.groq_api_key });
}

/** Call Groq expecting a strict JSON object back. Throws if parsing fails. */
export async function llmJson<T>(args: {
  system: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const settings = getSettings();
  const groq = client();
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
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse Groq JSON output: ${msg}\nRaw: ${raw.slice(0, 500)}`);
  }
}

/**
 * Like `llmJson`, but validates the response with a caller-supplied validator
 * and retries up to `maxRetries` times on failure. On retry, we append the
 * previous response + the validation error to the prompt so the model can
 * self-correct. After exhausting retries the last validation error is thrown.
 */
export async function llmJsonValidated<T>(args: {
  system: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Throws on invalid, returns typed value on success. */
  validate: (raw: unknown) => T;
  /** Default 2 — matches the "max 2 retries" rule in the SEO spec. */
  maxRetries?: number;
}): Promise<T> {
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
      // JSON parse failures: also worth a retry — feed the error back.
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

/** Call Groq for plain text — no JSON constraints. Used for long-form markdown. */
export async function llmText(args: {
  system: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const settings = getSettings();
  const groq = client();
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
  return raw.trim();
}
