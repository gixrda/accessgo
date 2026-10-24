# AccessGo · Pisa — public cloud edition

Italian accessible-navigation prototype. This edition retains the mobile layout, route-adjacent obstacle filter, full-map toggle, honest OSM attributes and explicit address search from local branch `codex/mobile-first-round` (source commit `f0828a2`). It is hosted separately; collaboration changes are kept on a feature branch under `cloud/` in the team repository.

## Hosting

- React / Leaflet frontend, Vinext API routes, Cloudflare Workers through Sites.
- Public map, search and routing. Submitting a public report requires ChatGPT sign-in; no account is needed to browse or plan a route.
- Reports are stored in Cloudflare D1. New reports are always unverified. A secret moderator token is required to change status; moderation stays disabled until configured.
- No local `.env`, existing report database, API key or GitHub credential is copied to the cloud.
- Real OSM snapshot: 1,158 roads and facilities, acquired 2026-10-24. The coverage boundary is shown on the map. Missing accessibility tags never mean verified safe.
- External routing is Valhalla wheelchair by default. OpenRouteService can be enabled with a server secret. Public wheelchair requests fail closed when wheelchair routing is unavailable; ordinary walking is only a separately labelled comparison. Routes are not field-verified.
- AI defaults to honest rule-based interpretation. Configure a real Gemma API key to use Gemma; no claim of AI analysis is made without a model call.

## Obstacle-aware routing (v7)

The server reads its OSM snapshot and current report store for every wheelchair request. Explicit path `wheelchair=no`, steps, and raised kerbs participate in avoidance; accessible wheelchair/ramp tags exempt steps/kerbs. OSM tags are mapped evidence, not on-site verification. Community reports participate only when a moderator has set `verified` and the author manually chose `steps` or `obstructed_sidewalk`. Unverified/resolved reports and AI severity never create routing exclusions. Other reports remain visible risk information. Moderation remains disabled unless an admin secret is configured.

When the initial route intersects these blockers, AccessGo submits actual Valhalla `exclude_polygons` (or ORS `avoid_polygons`) and rechecks the full returned geometry against all blockers. At most two detours are requested. Every original stop is checked too, including stops the provider snapped away from a blocker. Exclusion zones are conservative spatial approximations: 7 m for OSM and 10 m for reports, with 2 m extra provider padding; nearby parallel paths or different levels can be overexcluded. This is not a sidewalk-level topology or entrance-accessibility guarantee.

Unresolved blockers, ignored exclusions, failed detours, or unavailable report checks disable voice guidance. Such routes are red/dashed and inspection-only; a failure to find an alternative does not prove no physical alternative exists. Risk status appears before route statistics, and a new route resets the panel scroll to it. Data coverage is explicitly not a safety score. No obstacle data is written during route calculation.

Validation: 515 automated tests passed, including real SQLite report-status reads, exclusion payloads, ignored exclusions, new blockers on detours, no-route responses, snapped stops, and blocked voice controls. Live Valhalla with the real OSM snapshot returned a 1,452.232 m detour avoiding six mapped kerb records for `[43.7163,10.397] → [43.7225,10.397]`; a second request correctly surfaced `NoRoute` after exclusions. Local browser flow **Piazza Dante → Torre di Pisa** returned about 800 m / 12 min and avoided one mapped obstacle. These validate software/provider behavior, not real-world traversability. Physical iPhone walking and wheelchair-user field trials remain outstanding.

## Search service limits

The retained Nominatim provider is suitable for a small demonstration, not unlimited traffic. Its [official usage policy](https://operations.osmfoundation.org/policies/nominatim/) limits the whole application to at most one request per second, requires attribution and an identifiable User-Agent, and forbids autocomplete and systematic queries. AccessGo uses explicit searches, a shared D1 cache and a conservative database lease. Busy requests receive a retry message. Set `NOMINATIM_SEARCH_URL` to a compatible provider when usage grows.

## Local development (Node 24 recommended)

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_useful_guardian.sql
npm run dev -- --port 5180
```

Use the committed migration above for a fresh local database. Run `npm run db:generate` only after a schema change, then apply the resulting migration. Apply each migration only once to a local database. Local D1 and cloud D1 are separate. The development starter simulates sign-in on loopback; hosted sign-in is handled by Sites, never by that simulator.

```sh
npm run typecheck
npm test
npm run build
```

The Sites publishing workflow builds, packages, uploads source and applies cloud database migrations. Do not upload a static `dist/client` folder alone: it would omit routing, search and persistence. `.openai/hosting.json` retains the exact Site identity for future updates.

## Optional server secrets

See `.env.example` for names only. Set values through Sites environment settings: `ORS_API_KEY`, `GEMINI_API_KEY`, `GEMMA_MODEL`, `ADMIN_TOKEN`, `NOMINATIM_SEARCH_URL`, `ELEVENLABS_API_KEY`, and optionally `ELEVENLABS_VOICE_ID` / `ELEVENLABS_TTS_MODEL`. Never add keys to `VITE_` variables or client code. The map and rule-based analysis do not require a paid API. Optional ElevenLabs voice requests consume the configured account’s credits.

### Configurare e verificare Gemma

Per le prove locali usa **Node 24** e crea `.dev.vars` nella radice del progetto: il file è ignorato da Git. Inserisci `GEMINI_API_KEY` con la tua chiave Google AI Studio; `GEMMA_MODEL` è facoltativo e il modello predefinito è `gemma-4-26b-a4b-it`. Non condividere il file o la chiave. Per il sito pubblico configura gli stessi valori nelle impostazioni server di Sites: il file locale non configura automaticamente il sito pubblicato.

Con le credenziali configurate, avvia una verifica reale dell'API:

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

## Navigation voice assistant and clearer map (version 6)

The map now opens with a unified **Dove vuoi andare?** search field and a visible **Parla** microphone at the top. On phones, the map occupies the main screen and the route/report sheet opens when needed. Layers start collapsed; the route-only obstacle filter remains the default. Manual fields are grouped under **Scegli i punti manualmente** instead of repeating large dictation controls.

- Enter a place name or address to search directly without depending on Gemma. Common Pisa landmark aliases in Italian, English and Chinese are translated into search terms, never invented coordinates. Search remains limited to the Pisa service area and depends on OpenStreetMap coverage.
- Speak a complete request through **Parla**, then explicitly press **Trascrivi audio**. ElevenLabs Scribe v2 uses automatic language detection. Gemma extracts the requested names and their roles; it never supplies coordinates, turns or safety claims. Examples: `Vorrei andare alla Torre di Pisa` or `Da Pisa Centrale alla Torre di Pisa passando per Piazza dei Cavalieri`.
- Select a real search result for each point, in order. If the origin was omitted, press **Usa la mia posizione** explicitly or enter an address. **Conferma e calcola percorso** replaces the entire itinerary atomically, including intermediate stops. Location, searching and interpretation do not publish reports.
- Ambiguous alternatives and unsupported constraints ask for clarification. If Gemma fails, conservative rules may propose simple places, clearly labelled as fallback; arbitrary place/address searches can still run directly. The caller sees the actual engine for each request.
- `/api/route-intent` accepts only a bounded text request and has no report writes, location calls or coordinate inference. Model requests share the existing five-second analysis quota; direct place searches use the geocoder's separate shared cache and provider lease. Raw audio, transcripts and route-intent results are not stored in the AccessGo database. Provider processing and retention terms still apply.

Search improvements retain the global Nominatim request limit, add bounded cooldown waiting and allow clearly labelled real local OSM matches during provider failures. `Polo F` resolves to the **Polo Fibonacci area**, not a claimed building entrance. Numbered addresses never silently become an approximate point on the street. Campus naming is grounded in [UniPi's Polo Fibonacci guide](https://di.unipi.it/orientarsi-al-polo-fibonacci/).

Planning location requests try high accuracy first and retry ordinary browser positioning only after timeout/unavailability. Permission denial never triggers another request. A location more than 100 m but at most 1 km uncertain needs explicit confirmation; poorer, stale or out-of-area results are rejected with manual alternatives. Safari must still have location permission; the app cannot enable OS permissions. Live turn-by-turn guidance keeps its separate stricter GPS checks.

## Product limits

**Version 6 validation, 2026-10-24:** TypeScript, production build and **493 automated tests passed**. A real local Worker roundtrip generated a 31,390-byte ElevenLabs MP3 for `Vorrei andare alla Torre di Pisa`, transcribed it with Scribe v2 in automatic-language mode, then returned a Gemma route intent for Torre di Pisa. The stored report list was unchanged. Real Italian requests with an explicit origin and intermediate stop retained the intended endpoint roles; alternatives produced `unclear`. A direct Chinese Gemma call succeeded, while two earlier Worker Chinese calls used the correctly labelled fallback; the transient cause was not determined. Seven real OSM searches covered Italian/English/Chinese landmarks, the station and Polo F. The 390 × 844 browser flow confirmed real candidates and calculated a 620 m route with 8 maneuvers. Physical iPhone capture, permissions and walking GPS are still unverified.


**Version 5 validation, 2026-10-24:** TypeScript checking, the production build and **356 automated tests passed**. Real local Worker calls to Gemma returned the expected `no_obstacle`, `unclear` and `uneven_surface` categories for synthetic absence, ambiguity and negation/pothole descriptions. All three results identified `engine: gemma` and `published: false`; the report list was unchanged. These checks cover the new categories and integration, not general AI accuracy.

A real three-point Valhalla request returned a complete itinerary of approximately **1,210 metres**, with **76 geometry coordinates and 17 maneuvers**. A separate browser check at **390 × 844** completed a three-point route and displayed **1.2 km and 15 instructions**. This verifies route retrieval and the narrow-screen flow; it does not verify physical accessibility or walking GPS behavior.

The ElevenLabs implementation and its automated tests passed, including upload validation, explicit provider attribution, bounded timeouts, shared quotas and no audio/transcript persistence. A real local Worker roundtrip succeeded after credential and permission configuration: TTS returned HTTP 200 with a 33,897-byte MP3 for `Tra cento metri, gira a destra.`; Scribe v2 returned HTTP 200 and `Tra 100 metri gira a destra`. This uses synthetic audio and verifies server integration only; it does not test a physical microphone or walking navigation. The server handles invalid credentials and missing permissions with a safe configuration message, without exposing upstream details.

**Historical version 4 validation:** TypeScript, the production build and **238 automated tests** passed for the earlier analysis-preview release. A real local Worker request to `/api/analyze` returned `engine: gemma`, the expected pothole category and `published: false` in about 8 seconds. The local report list remained empty after previews. Regression tests cover anonymous access, unchanged stored reports, no preview-content persistence, shared rate limiting, editing/cancellation, honest fallback and independent authenticated publication.

This integration check also found and fixed a Worker incompatibility: `fetch` must use `redirect: 'manual'`, with redirects rejected explicitly, rather than the unsupported `redirect: 'error'`. Earlier Node-only Gemma tests did not exercise that runtime. The earlier three synthetic direct Google API tests passed in approximately 9–16 seconds; these small checks are not an accuracy benchmark. Provider failures remain possible and are reported as fallback, not as successful Gemma analysis.

This is a hackathon prototype, not guaranteed safe navigation. OSM coverage and community reports may be incomplete or outdated. External map tiles, search and route providers can be temporarily unavailable. Voice guidance works only in the foreground, requires the page and screen to stay active, and has no automatic rerouting. Real iPhone microphone capture, audio permissions/playback and walking GPS behavior remain unverified on a physical device. User reports are public: submit obstacles, not personal or confidential information.

## Nuove categorie di interpretazione

L’anteprima distingue **Nessun ostacolo segnalato** (`no_obstacle`) da **Descrizione da chiarire** (`unclear`). La prima descrive soltanto ciò che è scritto: non certifica una strada accessibile e non risolve automaticamente segnalazioni precedenti. Non può essere pubblicata come ostacolo. Una descrizione incerta richiede chiarimenti o una categoria scelta esplicitamente prima della pubblicazione. **Altro ostacolo** rimane per un problema identificato ma diverso dalle categorie note. I rapporti già salvati restano compatibili.

## Percorsi con più tappe

In **Percorso**, imposta partenza e destinazione e premi **+ Aggiungi tappa**. Sono consentiti fino a tre punti intermedi (cinque punti totali); ogni tappa si cerca oppure si seleziona sulla mappa. I pulsanti **Prima**, **Dopo**, **Elimina tappa** modificano l’ordine. Il pulsante di inversione inverte l’intero itinerario. Non viene ottimizzato automaticamente l’ordine delle tappe.

Tutti i punti devono essere completi e nell’area Pisa prima del calcolo. Il servizio riceve l’intero ordine; una risposta con un tratto mancante non diventa un itinerario parziale. La mappa, il confronto e il filtro ostacoli usano l’intero percorso. Modificare un punto cancella il percorso e le indicazioni precedenti.

## Voce con ElevenLabs

La trascrizione e la sintesi vocale usano **ElevenLabs**, con chiave soltanto nel Worker. Per lo sviluppo locale inserisci `ELEVENLABS_API_KEY` in `.dev.vars`, che è ignorato da Git. Per la versione ospitata configura lo stesso segreto in Sites e ridistribuisci la versione. Non mettere la chiave in variabili `VITE_`, sorgenti client o parametri URL.

- **Dettatura delle segnalazioni**: registra una breve frase in italiano e conferma la trascrizione. L’audio viene inviato al backend AccessGo e poi a ElevenLabs Scribe v2; il testo riconosciuto rimane modificabile, senza analisi o pubblicazione automatica. La voce nella ricerca di navigazione usa invece il flusso di proposta e conferma descritto sopra. Registrazione limitata a 30 secondi e upload a 2 MiB. Annullamento, cambio del testo o uscita dal pannello scartano le risposte obsolete e rilasciano il microfono.
- **Guida vocale**: ElevenLabs Flash v2.5 legge le indicazioni italiane effettivamente restituite dal routing. La voce predefinita è la voce standard documentata George; `ELEVENLABS_VOICE_ID` permette una voce disponibile nel proprio account. Non vengono inventate svolte da Gemma.
- **GPS**: la guida parte solo con un’azione esplicita e autorizzazione della posizione. Gli avvisi usano la distanza lungo la geometria del percorso, con un anticipo approssimativo vicino a 100 metri. GPS impreciso, posizione obsoleta o uscita dal percorso sospendono le istruzioni. Non è disponibile un ricalcolo automatico e occorre tenere pagina e schermo attivi.
- **Anteprima**: i pulsanti di prova/ascolto permettono di sentire le indicazioni senza avviare il GPS. Una prova audio non dimostra il funzionamento durante una passeggiata reale.

Le API voce sono `/api/voice/status`, `/api/voice/transcribe` e `/api/voice/speak`. Gli errori di configurazione, autorizzazione, quota, formato audio o rete sono mostrati esplicitamente; non vengono presentati come un successo ElevenLabs. AccessGo non salva audio o trascrizioni nel database. ElevenLabs riceve i contenuti per elaborarli e applica le proprie condizioni di conservazione. Sono presenti limiti condivisi per contenere richieste ripetute e consumo crediti; non sono adatti a traffico pubblico illimitato.

Riferimenti tecnici: [ElevenLabs STT](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [ElevenLabs TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [Valhalla directions](https://valhalla.github.io/valhalla/api/route/api-reference/).

Source and deployment history: [SOURCE.md](SOURCE.md). The root app and this cloud edition remain separate.
