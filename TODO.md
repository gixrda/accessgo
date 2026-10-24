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
- [x] Routing sicuro: 3 alternative classificate con trace_attributes, scarto strade principali senza marciapiede e scale, messaggio di percorso non verificabile
- [x] Ostacoli lungo il percorso in ordine di percorrenza, numerati sulla mappa; link demo `?from=&to=`
- [x] Segnalazioni: validazione, anti doppio invio, stato iniziale `unverified`, persistenza JSON
- [x] Assistente segnalazioni Gemma 4 (provato dal vivo): foto, domanda mirata, bozza lato server, fallback a regole dichiarato
- [x] Stati verificata/risolta con codice moderatore
- [x] 93 test Vitest, type-check, build, E2E manuale con Playwright (desktop 1440×900, mobile 390×844), nessun errore JS in console

## Da fare

- [ ] Provare ORS con una chiave reale (`ORS_API_KEY`) e confrontare con Valhalla
- [ ] Passare a ORS i vincoli `profile_params.restrictions` (cordolo, pendenza, larghezza) dopo averli provati con una chiave reale
- [ ] Profili utente (sedia manuale/elettrica, deambulatore) con parametri di routing diversi
- [ ] Provare Gemma su 10–20 segnalazioni reali e misurare la qualità delle domande
- [ ] Alternative ORS (`alternative_routes`) e verifica dei tratti anche con ORS
- [ ] Verificare sul posto i 5 percorsi demo (README)
- [ ] Usare le segnalazioni verificate per evitare tratti nel routing (ORS `options.avoid_polygons`)
- [ ] Passare a Supabase/Postgres se servono più istanze o utenti reali
- [ ] Clustering marker a zoom bassi (oggi ~370 marker DOM)
- [ ] Integrare Wheelmap per l'accessibilità delle destinazioni; valutare dati PEBA
- [ ] ESLint (non configurato)

## Decisioni tecniche

- **API dentro Vite in dev** (`vite.config.ts`): un solo processo per la demo; in produzione `server/index.ts` usa lo stesso handler.
- **Snapshot OSM nel repo** invece di Overpass a runtime: rispetta i limiti del servizio e rende la demo affidabile.
- **Valhalla come default gratuito**: profilo `wheelchair` senza chiave; `step_penalty` al massimo (43200 s) perché per Valhalla le scale sono solo penalizzate.
- **Sicurezza dei tratti verificata lato server** con `trace_attributes` (vale per qualsiasi router): mai "sicuro", solo "verificabile nei dati".
- **Durata nascosta nel fallback**: la durata OSRM è a passo pedonale, non rappresentativa per una sedia a rotelle.
- **ORS 404 ≠ guasto**: se ORS non trova un percorso per sedia a rotelle non lo sostituiamo con uno pedonale; per altri errori sì, con avviso.
- **Gemma senza system prompt**: via Gemini API Gemma non supporta istruzioni di sistema; le regole stanno nel messaggio e l'output è validato.
- **Categoria utente > categoria AI**; il testo originale è sempre conservato.
