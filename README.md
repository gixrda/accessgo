# AccessGo — MVP

Web app che aiuta le persone con disabilità motorie a orientarsi a Pisa (zona universitaria): calcola un percorso, lo confronta con i dati di accessibilità di OpenStreetMap e con le segnalazioni degli utenti, e dice chiaramente **cosa si sa, cosa è solo probabile e cosa manca**.

> L'assenza di dati sugli ostacoli non significa che un percorso sia accessibile. AccessGo non dichiara mai "accessibile" un tratto senza dati, e nessun percorso è verificato sul posto.

## Avvio rapido

Requisiti: **Node.js ≥ 23.6** (il backend è TypeScript eseguito nativamente da Node, senza build). Testato con Node 26.

```bash
npm install
cp .env.example .env      # opzionale: senza chiavi il routing per sedia a rotelle funziona già (Valhalla, gratuito)
npm run dev               # http://localhost:5173  (frontend + API nello stesso processo)
```

Produzione / demo offline dal build:

```bash
npm run build
npm start                 # http://localhost:8787
```

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Vite + API (`/api/*` montate come middleware) |
| `npm run build` | type-check (`tsc -b`) + build frontend in `dist/` |
| `npm start` | server Node: API + `dist/` |
| `npm test` | test Vitest (93 test: normalizzazione OSM, analisi e confronto percorsi, routing sicuro, assistente AI/fallback, API) |
| `npm run typecheck` | solo type-check |
| `npm run fetch:osm` | riscarica lo snapshot OSM da Overpass (una richiesta, con mirror di riserva) |

Lint: non configurato (scelta per ridurre le dipendenze); il type-check è in modalità `strict`.

## Configurazione (`.env`)

Le chiavi sono lette **solo dal server**: non hanno prefisso `VITE_` e non finiscono nel bundle.

| Variabile | Servizio | Senza valore |
|---|---|---|
| `ORS_API_KEY` (facoltativa, gratuita) | [OpenRouteService](https://openrouteservice.org/dev/#/signup), profilo `wheelchair`: considera anche cordoli, pendenze e larghezze | si usa Valhalla, profilo `wheelchair`, gratuito e senza chiave |
| `GEMINI_API_KEY`, `GEMMA_MODEL` | Gemma 4 via [Google AI Studio](https://aistudio.google.com/apikey) (default `gemma-4-26b-a4b-it`; disponibile anche `gemma-4-31b-it`) | classificazione e domanda a regole, **dichiarate come "non AI"** |
| `OLLAMA_URL`, `OLLAMA_MODEL` | Gemma in locale con Ollama (es. `ollama pull gemma3`, `OLLAMA_URL=http://localhost:11434`, `OLLAMA_MODEL=gemma3`). Ha priorità su Google | come sopra |
| `ADMIN_TOKEN` | codice per l'azione moderatore (cambio stato) | cambio stato disabilitato |
| `PORT` | porta di `npm start` (default 8787) | — |

Lo stato dei servizi è visibile nella barra in alto (desktop) e in ogni risultato.

## Funzionalità

- **Mappa** (Leaflet + tile OpenStreetMap, attribuzione inclusa) centrata sulla zona universitaria; il riquadro tratteggiato indica l'area con dati OSM caricati.
- **Routing per sedia a rotelle, gratuito** (`server/routing.ts`), in cascata:
  1. **OpenRouteService** `wheelchair`, se è configurata la chiave gratuita;
  2. **Valhalla** `pedestrian` con `type: wheelchair` sull'istanza pubblica FOSSGIS (nessuna chiave): 4 km/h, solo fondi compatti o migliori, scale con penalità massima (usate solo se non c'è alternativa, e in quel caso segnalate come ostacolo noto). **Non conosce l'altezza dei cordoli**: l'interfaccia lo dice e mostra gli attraversamenti senza dati;
  3. solo se nessuno dei due risponde: percorso pedonale OSRM, **dichiarato come non calcolato per sedia a rotelle** e senza durata.
  Se il servizio per sedia a rotelle risponde "nessun percorso", AccessGo non lo sostituisce con un percorso pedonale.
- **Routing sicuro** (`server/safety.ts`, lato server): Valhalla calcola fino a 3 alternative; ognuna viene classificata tratto per tratto con `trace_attributes` (tipo d'uso, classe stradale, marciapiede da OSM):
  - *pedonale*: footway, pedonale, path, attraversamenti, `living_street`, ciclabili; *con marciapiede*: strade con `sidewalk=left/right/both`;
  - *carreggiata senza marciapiede mappato*: strade residenziali/di servizio senza marciapiede noto → **non verificabile**;
  - *strada principale senza marciapiede* (terziaria o superiore) o **scale** (profilo sedia a rotelle) → alternativa **scartata**.
  Si sceglie l'alternativa con meno carreggiata, accettando al massimo 2 m di deviazione per ogni metro evitato, e l'interfaccia spiega perché. Se resta carreggiata: *"Non è stato possibile trovare un percorso sufficientemente verificabile. Controlla la mappa prima di proseguire."* con i tratti elencati e evidenziati (alone ambra tratteggiato). Se tutte le alternative vanno scartate, nessun itinerario viene proposto (errore esplicito). I divieti di accesso (`foot=no`, `access=no`, autostrade) sono applicati dal router (profilo pedonale di Valhalla), non da un controllo nostro. Ignorati: il primo/ultimo tratto < 20 m (collegamento del punto cliccato alla rete) e frammenti < 3 m (rumore dell'aggancio).
- **Ostacoli lungo il percorso**: ostacoli noti OSM e segnalazioni utenti in ordine di percorrenza con la distanza dalla partenza, numerati anche sulla mappa.
- **Confronto a piedi / sedia a rotelle**: lo stesso motore (Valhalla) calcola anche il percorso pedonale standard; tabella con distanza, ostacoli noti e possibili criticità di entrambi, ostacoli evitati e ostacoli presenti solo sul percorso per sedia a rotelle. Linea continua blu = sedia a rotelle, linea a puntini grigia = a piedi (disattivabile).
- **Percorso**: partenza/destinazione da ricerca indirizzi (Nominatim, limitata a Pisa, 1 richiesta/s, nessun autocompletamento come da policy), click sulla mappa o posizione GPS.
- **Analisi del percorso** con tre livelli di affidabilità sempre visibili: *calcolato* ✓ · *confrontato con OSM e segnalazioni* ✓ · *verificato sul posto* ✕. Elenca ostacoli noti, possibili criticità, segnalazioni utenti, attraversamenti senza dati sul cordolo, elementi favorevoli, e la copertura dei dati su superficie/pendenza/larghezza.
- **Ostacoli OSM** normalizzati (`server/osm.ts`) con fonte, tipo, posizione e certezza:
  - *ostacolo noto*: `highway=steps`, `kerb=raised`/`kerb:height>3cm`, `wheelchair=no`, `width<0,9 m`, tornelli…
  - *possibile criticità*: `surface=sett/cobblestone/gravel…`, `smoothness=bad…`, `incline` > 6% o non numerico, `width<1,2 m`, dissuasori/cancelli, `wheelchair=limited`, scale con rampa
  - *elemento favorevole*: `kerb=lowered/flush`, `wheelchair=yes`
  - *dato incompleto*: attraversamenti senza `kerb`, vie con sola superficie regolare (usate per la copertura)
  - l'accessibilità dei **luoghi** (negozi, edifici con `wheelchair=*`) è un livello separato e non conta come ostacolo sul percorso.
- **Segnalazioni**: posizione esplicita sulla mappa (o GPS), descrizione libera, categoria facoltativa. Stato iniziale sempre `unverified`. Validazione lato server (coordinate a Pisa, 10–1000 caratteri, categoria valida) e blocco del doppio invio (stesso testo e punto entro 2 minuti).
- **Assistente segnalazioni con Gemma 4** (`server/ai.ts`): testo + foto facoltativa → *Analizza* → categoria, ostacolo, sintesi, gravità (solo se esplicita), informazioni mancanti, **cosa mostra la foto** (anche se non corrisponde al testo) e **una domanda mirata** con risposte a scelta. La risposta è salvata come dato di chi segnala, separata dall'AI. Output JSON validato; il campo di verifica proposto dal modello è ignorato. La bozza resta sul server: l'interpretazione salvata è quella mostrata. Foto: ridimensionata nel browser (lato max 1280 px, JPEG), senza metadati EXIF/GPS, max 1,5 MB; se il modello la rifiuta si riprova col solo testo e lo si dichiara. Senza AI: classificazione e domanda a regole, dichiarate.
- **Stati** *Non verificata / Verificata / Risolta*: badge con icona, testo e bordo (tratteggiato = non verificata). Il cambio stato è un'azione moderatore separata, protetta da `ADMIN_TOKEN`.

## Architettura

```
shared/types.ts        tipi condivisi (feature OSM, segnalazioni, percorsi) + limiti geografici
server/osm.ts          query Overpass + normalizzazione/classificazione tag
server/routing.ts      ORS wheelchair → Valhalla wheelchair (3 alternative) → OSRM pedonale dichiarato
server/safety.ts       classificazione dei tratti (trace_attributes) e scelta dell'alternativa più verificabile
server/ai.ts           Gemma (Google AI Studio / Ollama) + validazione + fallback a regole
server/reports.ts      store segnalazioni su file JSON (scritture atomiche e serializzate)
server/api.ts          handler /api/* (usato da Vite in dev e da server/index.ts in produzione)
server/data/           osm-pisa.json (snapshot OSM reale); reports.json e photos/ creati a runtime, ignorati da git
src/lib/analysis.ts    confronto percorso ↔ ostacoli/segnalazioni, copertura dati
src/components/        mappa, pannelli percorso/segnalazione/dettaglio, livelli
tests/                 Vitest
```

API: `GET /api/status`, `GET /api/osm`, `GET|POST /api/reports`, `POST /api/reports/draft` (analisi), `GET /api/reports/:id/photo`, `PATCH /api/reports/:id` (header `x-admin-token`), `POST /api/route` (`profile`: `wheelchair` predefinito o `foot` per il confronto), `GET /api/geocode?q=`.

## Dati

- **OpenStreetMap** (© OpenStreetMap contributors, ODbL) via Overpass: snapshot del 24/10/2026 in `server/data/osm-pisa.json`, area 43.712–43.724 N, 10.393–10.410 E. 1158 feature: 55 ostacoli noti, 398 possibili criticità, 105 elementi favorevoli, 600 dati descrittivi. Nessun dato dimostrativo inventato.
- Lo snapshot evita interrogazioni ripetute a Overpass e rende la demo indipendente dalla sua disponibilità.

## Percorsi per la demo

Link con partenza e destinazione precompilate (`?from=lat,lng&to=lat,lng`, poi *Calcola percorso*). Verificati dal vivo il 24/10/2026; gli ostacoli sono quelli mappati in OpenStreetMap, **non verificati sul posto**: controllateli prima della demo.

| # | Scenario | Link | Cosa mostra |
|---|---|---|---|
| 1 | Via Roma (Via Trento → Via Derna) | [/?from=43.71696,10.39513&to=43.71856,10.39513](http://localhost:5173/?from=43.71696,10.39513&to=43.71856,10.39513) | percorso tutto pedonale **ma con 3 cordoli rialzati** che il router non conosce |
| 2 | Lungarno Mediceo | [/?from=43.715316,10.406241&to=43.716072,10.406693](http://localhost:5173/?from=43.715316,10.406241&to=43.716072,10.406693) | il percorso a piedi (140 m) usa **una scala**, quello per sedia a rotelle la evita (290 m) ma passa da 1 cordolo rialzato e 80 m di carreggiata |
| 3 | Via Santa Maria | [/?from=43.71823,10.39744&to=43.71983,10.39744](http://localhost:5173/?from=43.71823,10.39744&to=43.71983,10.39744) | 1 cordolo rialzato + **210 m in carreggiata senza marciapiede**: messaggio "percorso non sufficientemente verificabile" |
| 4 | Via del Galloro → Lungarno Pacinotti | [/?from=43.71400,10.39565&to=43.71560,10.39565](http://localhost:5173/?from=43.71400,10.39565&to=43.71560,10.39565) | **3 cordoli rialzati** + 60 m di carreggiata |
| 5 | Piazza Sant'Antonio | [/?from=43.71243,10.39733&to=43.71243,10.39953](http://localhost:5173/?from=43.71243,10.39733&to=43.71243,10.39953) | **alternativa più sicura scelta**: +190 m per evitare 120 m di carreggiata in Via Manzoni, e così evita anche **2 cordoli rialzati** del percorso a piedi |

## Script per la demo (≈ 3 minuti)

1. Apri il link 5: l'app spiega perché ha scelto un percorso più lungo (meno carreggiata) e il confronto mostra i 2 cordoli evitati.
2. Apri il link 3: nessuna alternativa verificabile → messaggio esplicito, tratti in carreggiata evidenziati in ambra.
3. Apri il link 1: percorso pedonale ma con 3 cordoli rialzati numerati in ordine di percorrenza. Clicca un ostacolo per vederne i tag OSM.
4. *+ Segnala ostacolo* → tocca un punto → scrivi "All'ingresso ci sono solo scale, non trovo una rampa" → aggiungi una foto → *Analizza con Gemma*: sintesi, descrizione della foto e domanda mirata → rispondi → *Invia*.
5. Il segnaposto con "?" = non verificata. *Azioni moderatore* (codice in `.env`) → *Verificata*.

## Limiti noti

- Valhalla (default) non considera l'altezza dei cordoli e il suo controllo di pendenza è disattivato nel codice attuale; le scale sono fortemente penalizzate ma non escluse. Verificato dal vivo: su 4 scale reali della zona che il percorso a piedi attraversa, il profilo wheelchair ne evita 3 (la quarta è l'unico collegamento e viene segnalata).
- L'istanza pubblica FOSSGIS è gratuita ma a uso moderato, senza garanzie di disponibilità: per un servizio reale va ospitata in proprio (Valhalla e ORS sono open source).
- L'integrazione ORS è coperta da test con risposte simulate ma **non è stata provata contro il servizio reale** (nessuna chiave disponibile); idem per Ollama. Gemma 4 via Google AI Studio è stata provata dal vivo (testo e foto, ~5 s per analisi); `gemma-4-31b-it` era sovraccarico (503) al momento della prova. Limiti del piano gratuito non documentati per Gemma.
- **Routing sicuro**: dipende dalla mappatura OSM dei marciapiedi. Molte vie del centro non hanno `sidewalk` mappato: risultano "carreggiata senza marciapiede" anche se il marciapiede esiste (o, al contrario, un marciapiede mappato può essere stretto o occupato). La classificazione usa l'aggancio della geometria alla rete (`walk_or_snap`), che può sbagliare su tratti molto vicini. Le soglie (20 m, 3 m, 2 m di deviazione per metro, terziarie = strade principali) sono scelte per la demo. Con ORS si valuta un solo percorso (le alternative ORS non sono implementate).
- Le segnalazioni non influenzano il calcolo del percorso, solo l'analisi e l'elenco degli ostacoli.
- Persistenza su file JSON: adatta a un singolo server di demo, non a più istanze. Nessuna autenticazione utente né rate limiting.
- La copertura considera anche la superficie delle carreggiate, che non descrive sempre il marciapiede.
- La corrispondenza percorso ↔ ostacolo è geometrica (5 m per i nodi, sovrapposizione ≥ 15 m per le vie, 15 m per le segnalazioni): può includere elementi su un marciapiede parallelo molto vicino.
- I marker OSM non sono nell'ordine di tabulazione (sarebbero centinaia): da tastiera si usano gli elenchi del pannello percorso. Le segnalazioni utenti sono raggiungibili da tastiera.
- Dati PEBA del Comune e Wheelmap non integrati.
