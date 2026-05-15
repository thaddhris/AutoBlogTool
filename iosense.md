# AutoBlog — IOsense / Faclon Platform Integration Notes

## v1 status
- **IOsense SDK integration:** deferred. Per spec, v1 uses **Groq** as the AI provider, dummy banner placeholders, and a markdown publisher. No IOsense login or device/insight pulls yet.
- **Auth:** none. Admin pages are open at `/admin`.

## API functionIDs called
*(None yet — no IOsense SDK calls in v1.)*

## When IOsense gets wired in (v2 hooks)
Suggested call sites and resource IDs to log here when integrated:

| Hook | IOsense functionID | Purpose |
|---|---|---|
| Login screen → session | `userLogin` | Gate admin via Faclon SSO; store accessToken in session |
| Knowledge base: device list | `findUserDevices` | Let admins attach plant devices as a "resource" on a request |
| Knowledge base: device data | `getWidgetData` | Pull recent telemetry/aggregates as factual snippets for the writer |
| Knowledge base: insights | `getInsights` (bruce) | Customer-specific facts as RAG context |
| Knowledge base: assets / enms / events | TBD | Optional broader corpus per request |

## Where to plug it in
- `src/lib/ingest.ts` — add a new `ResourceType` (e.g. `iosense_device`, `iosense_insight`) and an `extractFromIOsense(...)` branch that calls the SDK and chunks the result.
- `src/lib/types.ts` — extend `ResourceType` union to include the new IOsense types.
- `src/app/api/requests/[id]/resources/route.ts` — accept the new payload shape.
- `src/lib/ai.ts` — Groq client today; if/when IOsense provides its own LLM proxy, swap inside this module without touching the pipeline.

## How to log calls in this file
When IOsense calls are added, append a row:

```
- 2026-MM-DD · userLogin · /admin/login → session token stored
- 2026-MM-DD · findUserDevices · resource attach flow on request {id}
```

Keep entries terse — this is the live API call log, not architecture docs.
