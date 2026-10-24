# AccessGo · Pisa — public cloud edition

Italian accessible-navigation prototype. This edition retains the mobile layout, route-adjacent obstacle filter, full-map toggle, honest OSM attributes and explicit address search from local branch `codex/mobile-first-round` (source commit `f0828a2`). This source snapshot is captured from Site commit `0f54c63995506c389856a220c3f738c65061d86f` (version 4), adding an analysis-only Gemma preview that does not create public reports, plus a fix for Gemma requests in the Worker runtime. This `cloud/` directory is a separate runnable app; the repository-root Node/Vite app retains the team's newer work and is unchanged by this update. See [SOURCE.md](SOURCE.md) for the handoff and integration boundary.

Live site: **https://accessogo.xyxzwb.chatgpt.site/**

## Included mobile fixes

- Keyboard layout follows Safari visual viewport height and panning, with a **Fine** button to dismiss the keyboard.
- Input stays inside the scrollable form; map and panel size recover after keyboard dismissal. Pinch zoom is retained.
- Route-adjacent obstacles are shown by default; the complete-area toggle remains available.
- Explicit Pisa address search, mobile panels, draft persistence and stale-request cancellation are included.
- The earlier version 2 passed 115 automated tests, including desktop viewport and keyboard-event simulations. Current version 4 validation is listed below; actual iPhone Safari keyboard animation still needs device validation.

## Hosting

- React / Leaflet frontend, Vinext API routes, Cloudflare Workers through Sites.
- Public map, search, routing and analysis-only AI previews. Submitting a public report requires ChatGPT sign-in; no account is needed to browse, plan a route or preview an interpretation.
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

### Configurare e verificare Gemma

Per le prove locali usa **Node 24** e crea `cloud/.dev.vars`: il file è ignorato da Git. Inserisci `GEMINI_API_KEY` con la tua chiave Google AI Studio; `GEMMA_MODEL` è facoltativo e il modello predefinito è `gemma-4-26b-a4b-it`. Non condividere il file o la chiave. Per il sito pubblico configura gli stessi valori nelle impostazioni server di Sites: il file locale non configura automaticamente il sito pubblicato.

Con le credenziali configurate, avvia una verifica reale dell'API dalla directory `cloud/`:

```sh
npm run check:gemma
```

Il comando invia **tre descrizioni sintetiche** in italiano e inglese, comprese una negazione e una segnalazione di gradino. Mostra modello, motore effettivamente usato, categoria e tempo di risposta; non stampa la chiave e **non crea segnalazioni pubbliche**. Termina con esito non riuscito se manca la configurazione, una chiamata usa il fallback o la categoria non corrisponde a quella attesa. Questi tre casi verificano l'integrazione, non misurano l'accuratezza generale del modello.

Ogni interpretazione ha un budget complessivo di **25 secondi**, con al massimo **un nuovo tentativo** per errori transitori, entro lo stesso budget. Chiave assente, timeout, limiti del servizio o risposta non valida attivano regole locali, indicate esplicitamente come `fallback`: la disponibilità della chiave non dimostra che una chiamata sia riuscita.

Le risposte sono controllate per formato, citazioni presenti nel testo e numeri supportati dalla descrizione. Questi controlli riducono alcune invenzioni, ma **non garantiscono la correttezza semantica né verificano l'accessibilità reale**. La posizione resta scelta sulla mappa e le nuove segnalazioni restano non verificate. È possibile scegliere manualmente la categoria nel modulo.

### Provare l'AI senza pubblicare

In **Segnala**, scrivi una descrizione e premi **Analizza senza pubblicare**. Non servono account, coordinate o una categoria manuale. Il risultato è un'**Anteprima · non pubblicata** e indica il motore effettivamente usato: Gemma oppure regole locali in caso di fallback. Puoi usare descrizioni sintetiche per una dimostrazione, per esempio `Non ci sono gradini. Il problema è una buca profonda.`

L'endpoint dedicato `POST /api/analyze` invia solo la descrizione al servizio AI. AccessGo non salva il testo o il risultato nel database, non crea una segnalazione e non aggiunge marker sulla mappa. L'anteprima resta nella pagina e viene scartata quando modifichi il testo o lasci il pannello. Il servizio AI esterno riceve il testo per elaborarlo; non inserire informazioni riservate.

La prova usa un intervallo globale minimo di 5 secondi fra richieste, applicato atomicamente nel database esistente. Viene conservato solo un timestamp tecnico in `provider_limits`, senza testi, risultati, coordinate o identificativi dei visitatori. Richieste troppo ravvicinate ricevono HTTP 429; nessun dato di prova entra in `reports` o nella cache degli indirizzi.

**Invia segnalazione** rimane un'azione distinta: richiede accesso e un punto sulla mappa, ricalcola l'interpretazione e pubblica una nuova segnalazione non verificata. Non premere questo pulsante per pubblicare esempi inventati. La prova non è una bozza persistente di pubblicazione.

## Product limits

Version 4 validation on 2026-10-24 in the Site source checkout: TypeScript, production build and **238 automated tests passed**. A real local Worker request to `POST /api/analyze` returned `engine: gemma`, `uneven_surface` and `published: false` in about 8 seconds. The preview was also checked in the browser at 390 × 844: a real Gemma result appeared after one earlier transient fallback. The local report list contained zero reports before and after the previews. Tests cover anonymous access, unchanged stored reports, no preview-content persistence, shared rate limiting, editing/cancellation, truthful fallback and separate authenticated publication. Sites version 4 was then deployed successfully. A browser check on the public site at 390 × 844, without sign-in or a map point, returned a real Gemma preview for `Non ci sono gradini. Il problema è una buca profonda.`, classified as `Superficie irregolare` with obstacle `buca profonda` and the label `Anteprima · non pubblicata`. This limited integration check does not guarantee provider availability or general model accuracy.

These checks found and fixed a Worker incompatibility: `fetch` now uses `redirect: 'manual'` and explicitly rejects 3xx responses. The previous `redirect: 'error'` setting was unsupported in the Worker runtime. Version 3's direct Node Gemma smoke tests did not exercise that runtime, so they were insufficient to prove that hosted requests worked. The three earlier direct API cases returned the expected categories in approximately 9–16 seconds; those historical connectivity checks are separate from the new local Worker/browser validation and are not an accuracy benchmark. Provider failures remain possible and are labelled as fallback.

Historical counts remain distinct: cloud version 2 passed 115 tests; cloud version 3 passed 203 tests; the repository-root app passed 93 tests at the original handoff. The root app was not changed or retested in this round. Details are recorded in [SOURCE.md](SOURCE.md).

This is a hackathon prototype, not guaranteed safe navigation. OSM coverage and community reports may be incomplete or outdated. External map tiles, search and route providers can be temporarily unavailable. This release adds no ElevenLabs or spoken navigation. User reports are public: submit obstacles, not personal or confidential information.
