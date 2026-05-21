import { NextRequest } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { fetchWebflowCollectionMapping } from "@/lib/webflowSchema";

/**
 * Refresh the cached field mapping for a Webflow collection.
 *
 *   POST /api/webflow/fetch-fields
 *   { "collectionId": "68a6d2bc7a6ac4518f825282" }    // optional — defaults to webflow_collection_id
 *
 * The server reads the token from settings (never accepts one over the wire
 * so a leaked browser tab can't exfiltrate it), calls Webflow's
 * `GET /v2/collections/{id}`, builds the field-by-field mapping with smart
 * defaults, and persists it under `settings.webflow_field_mappings[collectionId]`.
 *
 * On success the response includes the saved mapping so the client can
 * re-render the settings UI without an extra round-trip.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const settings = getSettings();
  const token = settings.webflow_token;
  const collectionId =
    typeof body.collectionId === "string" && body.collectionId.trim()
      ? body.collectionId.trim()
      : settings.webflow_collection_id;

  if (!token) {
    return Response.json(
      { error: "Webflow token is not configured. Save it in Settings first." },
      { status: 400 },
    );
  }
  if (!collectionId) {
    return Response.json(
      { error: "No collection ID provided and none saved in settings." },
      { status: 400 },
    );
  }

  try {
    const previous = settings.webflow_field_mappings?.[collectionId] ?? null;
    const mapping = await fetchWebflowCollectionMapping(
      token,
      collectionId,
      previous,
    );
    const nextMappings = {
      ...(settings.webflow_field_mappings ?? {}),
      [collectionId]: mapping,
    };
    saveSettings({ webflow_field_mappings: nextMappings });
    return Response.json({
      collectionId,
      mapping,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}
