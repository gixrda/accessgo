# AccessGo · Pisa — public cloud edition

Italian accessible-navigation prototype. This edition retains the mobile layout, route-adjacent obstacle filter, full-map toggle, honest OSM attributes and explicit address search from local branch `codex/mobile-first-round` (source commit `f0828a2`). The published source is captured from Site commit `6047df2fe500511074c966b40663c6ebed8d9a59` (version 2). This `cloud/` directory is a separate runnable app; the repository-root Node/Vite app retains the team's newer work. See [SOURCE.md](SOURCE.md) for the handoff and integration boundary.

Live site: **https://accessogo.xyxzwb.chatgpt.site/**

## Included mobile fixes

- Keyboard layout follows Safari visual viewport height and panning, with a **Fine** button to dismiss the keyboard.
- Input stays inside the scrollable form; map and panel size recover after keyboard dismissal. Pinch zoom is retained.
- Route-adjacent obstacles are shown by default; the complete-area toggle remains available.
- Explicit Pisa address search, mobile panels, draft persistence and stale-request cancellation are included.
- 115 automated tests passed for this snapshot. Desktop viewport and keyboard-event simulations passed; actual iPhone Safari keyboard animation still needs device validation.

## Hosting

- React / Leaflet frontend, Vinext API routes, Cloudflare Workers through Sites.
- Public map, search and routing. Submitting a public report requires ChatGPT sign-in; no account is needed to browse or plan a route.
- Reports are stored in Cloudflare D1. New reports are always unverified. A secret moderator token is required to change status; moderation stays disabled until configured.
- No local `.env`, existing report database, API key or GitHub credential is copied to the cloud.
- Real OSM snapshot: 1,158 roads and facilities, acquired 2026-10-24. The coverage boundary is shown on the map. Missing accessibility tags never mean verified safe.
- External routing is Valhalla wheelchair by default. OpenRouteService can be enabled with a server secret. A pedestrian fallback is explicitly labelled; routes are not field-verified.
- AI defaults to honest rule-based interpretation. Configure a real Gemma API key to use Gemma; no claim of AI analysis is made without a model call.

## Search service limits

The retained Nominatim provider is suitable for a small demonstration, not unlimited traffic. Its [official usage policy](https://operations.osmfoundation.org/policies/nominatim/) limits the whole application to at most one request per second, requires attribution and an identifiable User-Agent, and forbids autocomplete and systematic queries. AccessGo uses explicit searches, a shared D1 cache and a conservative database lease. Busy requests receive a retry message. Set `NOMINATIM_SEARCH_URL` to a compatible provider when usage grows.

## Local development (Node 24 LTS recommended)

Run these commands from the repository checkout. The root app and this app have separate dependencies.

```sh
cd cloud
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_useful_guardian.sql
npm run dev -- --port 5180
```

Apply the committed migration above once to a fresh local database. Run `npm run db:generate` only after changing `db/schema.ts`; then use the new migration filename. Apply each migration only once to a local database. Local D1 and cloud D1 are separate. The development starter simulates sign-in on loopback; hosted sign-in is handled by Sites, never by that simulator.

```sh
npm run typecheck
npm test
npm run build
```

GitHub pushes do not deploy this app automatically. The existing Sites project remains the publishing authority. Its publishing workflow builds, packages, uploads source and applies cloud database migrations. Do not upload a static `dist/client` folder alone: it would omit routing, search and persistence. `.openai/hosting.json` retains the exact Site identity for future updates; it is not a deployment credential. Publish through the existing Site source checkout (where this app is the Git root), after reconciling the changes from `cloud/`. This nested directory is a collaboration snapshot, not a second Site or an automatic GitHub deployment.

## Optional server secrets

See `.env.example` for names only. Set values through Sites environment settings: `ORS_API_KEY`, `GEMINI_API_KEY`, `GEMMA_MODEL`, `ADMIN_TOKEN`, `NOMINATIM_SEARCH_URL`. Never add keys to `VITE_` variables or client code. No paid API is required for the current fallback configuration.

## Product limits

This is a hackathon prototype, not guaranteed safe navigation. OSM coverage and community reports may be incomplete or outdated. External map tiles, search and route providers can be temporarily unavailable. This release adds no ElevenLabs or spoken navigation. User reports are public: submit obstacles, not personal or confidential information.
