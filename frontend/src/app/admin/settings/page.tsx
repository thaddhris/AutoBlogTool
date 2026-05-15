import { getSettings } from "@/lib/settings";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = getSettings();
  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Configure API keys, queue size, cron, and brand voice. Stored locally
          in SQLite — v1 only.
        </p>
      </div>
      <SettingsForm
        initial={{
          ...settings,
          // never send the raw key into client component; mask it
          groq_api_key: settings.groq_api_key ? "•••••••••" + settings.groq_api_key.slice(-4) : "",
        }}
        hasGroqKey={Boolean(settings.groq_api_key)}
      />
    </div>
  );
}
