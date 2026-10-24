# Provenienza e integrazione

Questa cartella contiene il sorgente della versione pubblica AccessGo v3 del 24 ottobre 2026, pubblicata su https://accessogo.xyxzwb.chatgpt.site/.

- Commit sorgente Sites v3: `62593066f93726c79b50f6f02570db185f0d02a6`.
- Snapshot Sites precedente v2: `6047df2fe500511074c966b40663c6ebed8d9a59`.
- Base delle migliorie mobile/ricerca: `f0828a2` del ramo locale `codex/mobile-first-round`.
- Base applicativa del team conservata nella radice: `b7a833c616f1a57fd631855b3ac7343d7e7bd00e`.
- Questo aggiornamento parte da `c57fd9a744cfe8356dcffe8642a74b8f65fe3119`, dopo l'integrazione della PR #1, ed è preparato nel ramo `codex/gemma-api-reliability`. L'applicazione nella radice non è modificata in questo round.
- I file applicativi, il lockfile e i test cloud corrispondono allo snapshot pubblicato. Solo questa nota e il README sono stati aggiunti/aggiornati per il passaggio al team.

## Cosa eseguire

- Radice del repository: app Node/Vite del team, con le sue funzionalità recenti.
- `cloud/`: app pubblica React/Leaflet + Vinext + Cloudflare Workers/D1. Dipendenze e test separati (`cd cloud && npm ci && npm test`).
- Per installazione, inizializzazione locale D1 e avvio: [README.md](README.md).

## Cosa non è ancora integrato

I commit recenti del team `c5ef551`, `91eb45c`, `b7a833c` introducono assistente segnalazioni/foto, controllo dei tratti e pannello semplificato nella radice. Queste funzionalità non sono state portate automaticamente nell'app cloud. Viceversa, le modifiche di questa cartella non sostituiscono il frontend nella radice. La scelta di quale architettura unificare resta una decisione del team, seguita da integrazione e test.

Il database pubblico delle segnalazioni, credenziali, file `.env`, dipendenze installate e build non sono inclusi. Lo snapshot OSM è quello reale già usato dal sito (1.158 elementi). Il progetto Sites mantiene la propria cronologia di deploy: un push GitHub non aggiorna il sito.

## Migliorie Gemma della versione 3

Le chiamate Google Gemma usano come modello predefinito `gemma-4-26b-a4b-it`, un budget complessivo di 25 secondi e al massimo un nuovo tentativo per errori transitori. Errori e risposte non valide attivano un fallback dichiarato. Le regole locali distinguono alcuni casi espliciti di negazione/rimozione e non scambiano la larghezza del passaggio per l'altezza di un gradino. Le risposte del modello sono controllate per formato, citazioni e numeri presenti nella descrizione; questo non garantisce la correttezza semantica e non verifica la sicurezza reale di una strada.

Per credenziali locali/server e comando `npm run check:gemma`, vedere [README.md](README.md). La chiave e le segnalazioni reali non fanno parte dello snapshot.

## Verifiche attuali della versione 3

Nel checkout sorgente Sites: TypeScript, build di produzione e **203 test automatici passati**. Tre chiamate reali a Google Gemma su descrizioni sintetiche hanno restituito `engine: gemma` e la categoria attesa: gradino in italiano (`steps`, 15,768 s), gradini negati e buca (`uneven_surface`, 13,101 s), gradino in inglese (`steps`, 8,813 s). Sono prove limitate di integrazione/regressione, non una misura di accuratezza generale. Non sono state create segnalazioni pubbliche di prova. Il deploy Sites v3 è riuscito all'indirizzo indicato sopra.

L'applicazione nella radice non è stata modificata né sottoposta di nuovo ai test durante questo aggiornamento Gemma. Le verifiche storiche qui sotto restano distinte dai 203 test cloud e dalle tre chiamate reali della versione 3.

## Verifiche storiche della versione 2

TypeScript, build di produzione e 115 test automatici passati per lo snapshot v2. Verificati localmente resize/scroll del visual viewport, ritorno al layout mappa, input nei viewport ridotti e assenza di overflow orizzontale. La simulazione desktop non certifica il comportamento della tastiera reale su ogni iPhone; è ancora necessario un controllo su Safari iOS.

### Passaggio GitHub originale, versione 2

Da una nuova copia del repository, con Node 24.13.0: `npm ci` riuscito in entrambe le directory; radice **93 test** e build passati; `cloud/` type-check, **115 test** e build passati. Applicata la migration a un database locale vuoto e avviato il server di sviluppo: pagina, `/api/status`, `/api/osm` e `/api/reports` rispondevano HTTP 200; OSM conteneva 1.158 record e il database locale zero segnalazioni. Nessuna segnalazione era stata inserita nel sito pubblico durante quelle prove. Questi risultati descrivono il precedente passaggio, non una nuova esecuzione dei test della radice.
