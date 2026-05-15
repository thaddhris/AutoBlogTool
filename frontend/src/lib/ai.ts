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
