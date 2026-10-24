# Provenienza e integrazione

Questa cartella contiene il sorgente della versione pubblica AccessGo v2 del 24 ottobre 2026, pubblicata su https://accessogo.xyxzwb.chatgpt.site/.

- Commit sorgente Sites: `6047df2fe500511074c966b40663c6ebed8d9a59`.
- Base delle migliorie mobile/ricerca: `f0828a2` del ramo locale `codex/mobile-first-round`.
- Base GitHub conservata nella radice: `b7a833c616f1a57fd631855b3ac7343d7e7bd00e`.
- I file applicativi, il lockfile e i test cloud corrispondono allo snapshot pubblicato. Solo questa nota e il README sono stati aggiunti/aggiornati per il passaggio al team.

## Cosa eseguire

- Radice del repository: app Node/Vite del team, con le sue funzionalità recenti.
- `cloud/`: app pubblica React/Leaflet + Vinext + Cloudflare Workers/D1. Dipendenze e test separati (`cd cloud && npm ci && npm test`).
- Per installazione, inizializzazione locale D1 e avvio: [README.md](README.md).

## Cosa non è ancora integrato

I commit recenti del team `c5ef551`, `91eb45c`, `b7a833c` introducono assistente segnalazioni/foto, controllo dei tratti e pannello semplificato nella radice. Queste funzionalità non sono state portate automaticamente nell'app cloud. Viceversa, le modifiche di questa cartella non sostituiscono il frontend nella radice. La scelta di quale architettura unificare resta una decisione del team, seguita da integrazione e test.

Il database pubblico delle segnalazioni, credenziali, file `.env`, dipendenze installate e build non sono inclusi. Lo snapshot OSM è quello reale già usato dal sito (1.158 elementi). Il progetto Sites mantiene la propria cronologia di deploy: un push GitHub non aggiorna il sito.

## Verifiche della versione pubblicata

TypeScript, build di produzione e 115 test automatici passati. Verificati localmente resize/scroll del visual viewport, ritorno al layout mappa, input nei viewport ridotti e assenza di overflow orizzontale. La simulazione desktop non certifica il comportamento della tastiera reale su ogni iPhone; è ancora necessario un controllo su Safari iOS.

## Verifica del passaggio GitHub

Da una nuova copia del repository, con Node 24.13.0: `npm ci` riuscito in entrambe le directory; radice 93 test e build passati; `cloud/` type-check, 115 test e build passati. Applicata la migration a un database locale vuoto e avviato il server di sviluppo: pagina, `/api/status`, `/api/osm` e `/api/reports` rispondono HTTP 200; OSM contiene 1.158 record e il database locale zero segnalazioni. Nessuna segnalazione è stata inserita nel sito pubblico durante queste prove.
