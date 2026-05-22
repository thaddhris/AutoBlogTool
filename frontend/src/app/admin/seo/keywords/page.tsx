import { getSettings } from "@/lib/settings";
import KeywordsView from "./KeywordsView";
import { COMMON_LANGUAGES, COMMON_LOCATIONS } from "@/lib/dataforseo";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const s = getSettings();
  const credsReady = Boolean(
    (s.dataforseo_login || "").trim() &&
      (s.dataforseo_password || "").trim(),
  );
  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Keyword opportunities
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Enter one or more seed terms and we&apos;ll pull related keywords
          from DataForSEO with monthly volume, keyword difficulty, intent,
          and CPC. Promising ones convert to a Blog Request with one click.
        </p>
      </div>
      <KeywordsView
        credsReady={credsReady}
        defaultLocationCode={s.dataforseo_location_code || 2840}
        defaultLanguageCode={s.dataforseo_language_code || "en"}
        defaultMinVolume={s.dataforseo_min_search_volume ?? 100}
        defaultMaxKd={s.dataforseo_max_keyword_difficulty ?? 60}
        locationOptions={COMMON_LOCATIONS}
        languageOptions={COMMON_LANGUAGES}
      />
    </div>
  );
}
