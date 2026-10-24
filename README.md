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
| `npm test` | test Vitest (65 test: normalizzazione OSM, analisi percorso, AI/fallback, API e routing) |
| `npm run typecheck` | solo type-check |
| `npm run fetch:osm` | riscarica lo snapshot OSM da Overpass (una richiesta, con mirror di riserva) |

Lint: non configurato (scelta per ridurre le dipendenze); il type-check è in modalità `strict`.

## Configurazione (`.env`)

Le chiavi sono lette **solo dal server**: non hanno prefisso `VITE_` e non finiscono nel bundle.

| Variabile | Servizio | Senza valore |
|---|---|---|
| `ORS_API_KEY` (facoltativa, gratuita) | [OpenRouteService](https://openrouteservice.org/dev/#/signup), profilo `wheelchair`: considera anche cordoli, pendenze e larghezze | si usa Valhalla, profilo `wheelchair`, gratuito e senza chiave |
| `GEMINI_API_KEY`, `GEMMA_MODEL` | Gemma via [Google AI Studio](https://aistudio.google.com/apikey) (default `gemma-3-27b-it`) | classificazione a parole chiave, **dichiarata come "non AI"** |
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
- **Percorso**: partenza/destinazione da ricerca indirizzi (Nominatim, limitata a Pisa, 1 richiesta/s, nessun autocompletamento come da policy), click sulla mappa o posizione GPS.
- **Analisi del percorso** con tre livelli di affidabilità sempre visibili: *calcolato* ✓ · *confrontato con OSM e segnalazioni* ✓ · *verificato sul posto* ✕. Elenca ostacoli noti, possibili criticità, segnalazioni utenti, attraversamenti senza dati sul cordolo, elementi favorevoli, e la copertura dei dati su superficie/pendenza/larghezza.
- **Ostacoli OSM** normalizzati (`server/osm.ts`) con fonte, tipo, posizione e certezza:
  - *ostacolo noto*: `highway=steps`, `kerb=raised`/`kerb:height>3cm`, `wheelchair=no`, `width<0,9 m`, tornelli…
  - *possibile criticità*: `surface=sett/cobblestone/gravel…`, `smoothness=bad…`, `incline` > 6% o non numerico, `width<1,2 m`, dissuasori/cancelli, `wheelchair=limited`, scale con rampa
  - *elemento favorevole*: `kerb=lowered/flush`, `wheelchair=yes`
  - *dato incompleto*: attraversamenti senza `kerb`, vie con sola superficie regolare (usate per la copertura)
  - l'accessibilità dei **luoghi** (negozi, edifici con `wheelchair=*`) è un livello separato e non conta come ostacolo sul percorso.
- **Segnalazioni**: posizione esplicita sulla mappa (o GPS), descrizione libera, categoria facoltativa. Stato iniziale sempre `unverified`. Validazione lato server (coordinate a Pisa, 10–1000 caratteri, categoria valida) e blocco del doppio invio (stesso testo e punto entro 2 minuti).
- **Interpretazione**: Gemma restituisce JSON validato (`server/ai.ts`): categoria, ostacolo, sintesi, gravità (solo se esplicita), informazioni mancanti. Il campo di verifica proposto dal modello viene ignorato. Se l'AI non è configurata, non risponde o risponde male, si usa il fallback a regole e l'interfaccia lo dice.
- **Stati** *Non verificata / Verificata / Risolta*: badge con icona, testo e bordo (tratteggiato = non verificata). Il cambio stato è un'azione moderatore separata, protetta da `ADMIN_TOKEN`.

## Architettura

```
shared/types.ts        tipi condivisi (feature OSM, segnalazioni, percorsi) + limiti geografici
server/osm.ts          query Overpass + normalizzazione/classificazione tag
server/routing.ts      ORS wheelchair → Valhalla wheelchair → OSRM pedonale dichiarato
server/ai.ts           Gemma (Google AI Studio / Ollama) + validazione + fallback a regole
server/reports.ts      store segnalazioni su file JSON (scritture atomiche e serializzate)
server/api.ts          handler /api/* (usato da Vite in dev e da server/index.ts in produzione)
server/data/           osm-pisa.json (snapshot OSM reale), reports.json (creato a runtime, ignorato da git)
src/lib/analysis.ts    confronto percorso ↔ ostacoli/segnalazioni, copertura dati
src/components/        mappa, pannelli percorso/segnalazione/dettaglio, livelli
tests/                 Vitest
```

API: `GET /api/status`, `GET /api/osm`, `GET|POST /api/reports`, `PATCH /api/reports/:id` (header `x-admin-token`), `POST /api/route`, `GET /api/geocode?q=`.

## Dati

- **OpenStreetMap** (© OpenStreetMap contributors, ODbL) via Overpass: snapshot del 24/10/2026 in `server/data/osm-pisa.json`, area 43.712–43.724 N, 10.393–10.410 E. 1158 feature: 55 ostacoli noti, 398 possibili criticità, 105 elementi favorevoli, 600 dati descrittivi. Nessun dato dimostrativo inventato.
- Lo snapshot evita interrogazioni ripetute a Overpass e rende la demo indipendente dalla sua disponibilità.

## Script per la demo (≈ 3 minuti)

1. Apri l'app: mappa della zona universitaria con ostacoli reali OSM (quadrati = ostacoli noti, rombi = possibili criticità, cerchi = elementi favorevoli). Apri *Legenda e livelli*.
2. *Percorso* → cerca "Piazza dei Cavalieri" come partenza, poi *Scegli sulla mappa* per la destinazione oltre l'Arno → *Calcola percorso*.
3. Mostra distanza e durata (profilo sedia a rotelle), la scala di affidabilità, la copertura dati e gli elenchi; clicca un elemento per vederne i tag OSM e la fonte. Fai notare che il router non conosce i cordoli: per questo l'app elenca gli attraversamenti senza dati.
4. *+ Segnala ostacolo* → tocca un punto → scrivi "In Via Roma c'è un gradino troppo alto e non riesco a passare con la sedia a rotelle." → *Invia*.
5. Mostra l'interpretazione strutturata (Gemma o regole, dichiarato) e il segnaposto con "?" = non verificata. Ricalcola il percorso vicino: la segnalazione compare tra le criticità.
6. *Azioni moderatore* (codice in `.env`) → *Verificata*: il badge cambia.

## Limiti noti

- Valhalla (default) non considera l'altezza dei cordoli e il suo controllo di pendenza è disattivato nel codice attuale; le scale sono fortemente penalizzate ma non escluse. Verificato dal vivo: su 4 scale reali della zona che il percorso a piedi attraversa, il profilo wheelchair ne evita 3 (la quarta è l'unico collegamento e viene segnalata).
- L'istanza pubblica FOSSGIS è gratuita ma a uso moderato, senza garanzie di disponibilità: per un servizio reale va ospitata in proprio (Valhalla e ORS sono open source).
- L'integrazione ORS è coperta da test con risposte simulate ma **non è stata provata contro il servizio reale** (nessuna chiave disponibile); idem per Gemma (Google AI Studio e Ollama).
- Le segnalazioni non influenzano il calcolo del percorso, solo l'analisi.
- Persistenza su file JSON: adatta a un singolo server di demo, non a più istanze. Nessuna autenticazione utente né rate limiting.
- La copertura considera anche la superficie delle carreggiate, che non descrive sempre il marciapiede.
- La corrispondenza percorso ↔ ostacolo è geometrica (5 m per i nodi, sovrapposizione ≥ 15 m per le vie, 15 m per le segnalazioni): può includere elementi su un marciapiede parallelo molto vicino.
- I marker OSM non sono nell'ordine di tabulazione (sarebbero centinaia): da tastiera si usano gli elenchi del pannello percorso. Le segnalazioni utenti sono raggiungibili da tastiera.
- Dati PEBA del Comune e Wheelmap non integrati.
