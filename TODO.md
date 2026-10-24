# TODO — AccessGo

Stato al 24/10/2026. Per riprendere: `npm install && npm run dev`, poi `npm test`.

## Fatto (verificato con test e/o browser)

- [x] Setup Vite + React 19 + TS 7, backend Node senza dipendenze (TS nativo)
- [x] Mappa Leaflet di Pisa, attribuzione OSM, layout responsive (sidebar desktop / pannello inferiore mobile)
- [x] Snapshot OSM reale zona universitaria + script `npm run fetch:osm` (mirror di riserva)
- [x] Normalizzazione OSM con certezza (noto / possibile / favorevole / incompleto) e scope percorso/luogo
- [x] Partenza/destinazione: mappa, ricerca Nominatim, GPS (permesso negato gestito)
- [x] Routing per sedia a rotelle gratuito: ORS (chiave facoltativa) → Valhalla FOSSGIS (senza chiave) → OSRM pedonale dichiarato
- [x] Analisi percorso: ostacoli, segnalazioni vicine, attraversamenti senza dati, copertura
- [x] Confronto a piedi / sedia a rotelle (stesso motore Valhalla), ostacoli evitati e aggiunti
- [x] Segnalazioni: validazione, anti doppio invio, stato iniziale `unverified`, persistenza JSON
- [x] Interpretazione Gemma (Google AI Studio / Ollama) con validazione + fallback a regole dichiarato
- [x] Stati verificata/risolta con codice moderatore
- [x] 71 test Vitest, type-check, build, E2E manuale con Playwright (desktop 1440×900, mobile 390×844), nessun errore JS in console

## Da fare

- [ ] Provare ORS con una chiave reale (`ORS_API_KEY`) e confrontare con Valhalla
- [ ] Passare a ORS i vincoli `profile_params.restrictions` (cordolo, pendenza, larghezza) dopo averli provati con una chiave reale
- [ ] Profili utente (sedia manuale/elettrica, deambulatore) con parametri di routing diversi
- [ ] Provare Gemma reale (`GEMINI_API_KEY` o Ollama) su 10–20 segnalazioni di esempio
- [ ] Usare le segnalazioni verificate per evitare tratti nel routing (ORS `options.avoid_polygons`)
- [ ] Passare a Supabase/Postgres se servono più istanze o utenti reali
- [ ] Clustering marker a zoom bassi (oggi ~370 marker DOM)
- [ ] Integrare Wheelmap per l'accessibilità delle destinazioni; valutare dati PEBA
- [ ] ESLint (non configurato)

## Decisioni tecniche

- **API dentro Vite in dev** (`vite.config.ts`): un solo processo per la demo; in produzione `server/index.ts` usa lo stesso handler.
- **Snapshot OSM nel repo** invece di Overpass a runtime: rispetta i limiti del servizio e rende la demo affidabile.
- **Valhalla come default gratuito**: profilo `wheelchair` senza chiave; `step_penalty` al massimo (43200 s) perché per Valhalla le scale sono solo penalizzate.
- **Durata nascosta nel fallback**: la durata OSRM è a passo pedonale, non rappresentativa per una sedia a rotelle.
- **ORS 404 ≠ guasto**: se ORS non trova un percorso per sedia a rotelle non lo sostituiamo con uno pedonale; per altri errori sì, con avviso.
- **Gemma senza system prompt**: via Gemini API Gemma non supporta istruzioni di sistema; le regole stanno nel messaggio e l'output è validato.
- **Categoria utente > categoria AI**; il testo originale è sempre conservato.
