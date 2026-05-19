import { getSettings } from "@/lib/settings";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = getSettings();
  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Connect your accounts, control how blogs are written, and pick where
          they get published.
        </p>
      </div>
      <SettingsForm
        initial={{
          ...s,
          // Never send raw secrets to the client.
          groq_api_key: s.groq_api_key
            ? "•••••••••" + s.groq_api_key.slice(-4)
            : "",
          webflow_token: s.webflow_token
            ? "•••••••••" + s.webflow_token.slice(-4)
            : "",
          gemini_api_key: s.gemini_api_key
            ? "•••••••••" + s.gemini_api_key.slice(-4)
            : "",
          pexels_api_key: s.pexels_api_key
            ? "•••••••••" + s.pexels_api_key.slice(-4)
            : "",
          fal_api_key: s.fal_api_key
            ? "•••••••••" + s.fal_api_key.slice(-4)
            : "",
          fluxapi_api_key: s.fluxapi_api_key
            ? "•••••••••" + s.fluxapi_api_key.slice(-4)
            : "",
        }}
        hasGroqKey={Boolean(s.groq_api_key)}
        hasWebflowToken={Boolean(s.webflow_token)}
        hasGeminiKey={Boolean(s.gemini_api_key)}
        hasPexelsKey={Boolean(s.pexels_api_key)}
        hasFalKey={Boolean(s.fal_api_key)}
        hasFluxapiKey={Boolean(s.fluxapi_api_key)}
      />
    </div>
  );
}
