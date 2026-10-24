# Provenienza e integrazione

Questa cartella contiene lo snapshot sorgente AccessGo v4 del 24 ottobre 2026, pubblicato sul sito esistente https://accessogo.xyxzwb.chatgpt.site/. Le verifiche locali e quelle della versione pubblicata sono distinte.

- Commit sorgente Sites v4: `0f54c63995506c389856a220c3f738c65061d86f`.
- Snapshot Sites precedente v3: `62593066f93726c79b50f6f02570db185f0d02a6`.
- Snapshot Sites precedente v2: `6047df2fe500511074c966b40663c6ebed8d9a59`.
- Base delle migliorie mobile/ricerca: `f0828a2` del ramo locale `codex/mobile-first-round`.
- Base applicativa del team conservata nella radice: `dc0aa89` (inclusa in `origin/main` al commit `c712e09`).
- Il lavoro prosegue sul ramo `codex/gemma-api-reliability`. La precedente [PR #2](https://github.com/gixrda/accessgo/pull/2) è stata integrata dal team durante questo round; il ramo è stato aggiornato a `origin/main` (`c712e09`) prima del nuovo commit. Questa modifica interessa solo `cloud/`; nessun push diretto o merge su `main` è stato effettuato per questa versione.
- I file applicativi, il lockfile e i test cloud corrispondono al commit sorgente v4 indicato sopra. Solo questa nota e il README sono stati aggiunti/aggiornati per il passaggio al team.

## Cosa eseguire

- Radice del repository: app Node/Vite del team, con le sue funzionalità recenti.
- `cloud/`: app pubblica React/Leaflet + Vinext + Cloudflare Workers/D1. Dipendenze e test separati (`cd cloud && npm ci && npm test`).
- Per installazione, inizializzazione locale D1 e avvio: [README.md](README.md).

## Cosa non è ancora integrato

I commit recenti del team `c5ef551`, `91eb45c`, `b7a833c`, `dc0aa89` introducono assistente segnalazioni/foto, controllo dei tratti, esclusione degli ostacoli bloccanti e testi semplificati nella radice. Queste funzionalità non sono state portate automaticamente nell'app cloud. Viceversa, le modifiche di questa cartella non sostituiscono il frontend nella radice. La scelta di quale architettura unificare resta una decisione del team, seguita da integrazione e test.

Il database pubblico delle segnalazioni, credenziali, file `.env`, dipendenze installate e build non sono inclusi. Lo snapshot OSM è quello reale già usato dal sito (1.158 elementi). Il progetto Sites mantiene la propria cronologia di deploy: un push GitHub non aggiorna il sito.

## Anteprima senza pubblicazione della versione 4

Nel pannello **Segnala**, il pulsante **Analizza senza pubblicare** accetta una descrizione senza account, posizione o categoria manuale. Mostra **Anteprima · non pubblicata**, il motore effettivo e l'eventuale motivo del fallback. Una modifica del testo o l'uscita dal pannello elimina l'anteprima e annulla la richiesta pendente; risposte tardive non sostituiscono risultati più recenti.

Il nuovo `POST /api/analyze` non inserisce segnalazioni, non salva testo o interpretazione e non aggiunge marker. Il testo viene inviato al servizio AI esterno. Un intervallo globale minimo di 5 secondi è gestito atomicamente in `provider_limits`, salvando solo un timestamp tecnico. Non sono conservati identificativi dei visitatori, coordinate o contenuti di prova. L'azione separata **Invia segnalazione** mantiene accesso obbligatorio e posizione esatta, ricalcola l'interpretazione e crea una segnalazione non verificata.

È inoltre corretta un'incompatibilità con Cloudflare Workers: le chiamate Gemma usano `redirect: 'manual'` e rifiutano esplicitamente le risposte 3xx. `redirect: 'error'`, usato in precedenza, non era supportato nel runtime Worker. Le prove Node della versione 3 non coprivano quel runtime e non bastavano a dimostrare il funzionamento delle chiamate dal sito ospitato.

## Verifiche attuali della versione 4

Nel checkout sorgente Sites: TypeScript, build di produzione e **238 test automatici passati**. Una richiesta reale al Worker locale, tramite `POST /api/analyze`, ha restituito `engine: gemma`, categoria `uneven_surface` e `published: false` in circa 8 secondi. Anche il browser locale nel viewport 390 × 844 ha mostrato un'anteprima Gemma reale, dopo un precedente fallback transitorio. L'elenco locale delle segnalazioni è rimasto a zero prima e dopo le prove.

I test coprono accesso anonimo, mancata persistenza dei contenuti, segnalazioni esistenti invariate, limite condiviso, cancellazione e risposte tardive, errore/riprova, fallback dichiarato e pubblicazione autenticata separata. Non sono state create segnalazioni pubbliche di prova. Il deploy Sites v4 è riuscito. Sul sito pubblico, una prova dal browser a 390 × 844 senza accesso né posizione ha mostrato un risultato Gemma reale per `Non ci sono gradini. Il problema è una buca profonda.`: categoria `Superficie irregolare`, ostacolo `buca profonda` e intestazione `Anteprima · non pubblicata`. Sono prove limitate di integrazione, non una garanzia di disponibilità o accuratezza generale del modello.

L'applicazione nella radice non è stata modificata né sottoposta di nuovo ai test in questo round. I conteggi storici qui sotto restano separati dai 238 test cloud attuali.

## Migliorie Gemma della versione 3

Le chiamate Google Gemma usano come modello predefinito `gemma-4-26b-a4b-it`, un budget complessivo di 25 secondi e al massimo un nuovo tentativo per errori transitori. Errori e risposte non valide attivano un fallback dichiarato. Le regole locali distinguono alcuni casi espliciti di negazione/rimozione e non scambiano la larghezza del passaggio per l'altezza di un gradino. Le risposte del modello sono controllate per formato, citazioni e numeri presenti nella descrizione; questo non garantisce la correttezza semantica e non verifica la sicurezza reale di una strada.

Per credenziali locali/server e comando `npm run check:gemma`, vedere [README.md](README.md). La chiave e le segnalazioni reali non fanno parte dello snapshot.

## Verifiche storiche della versione 3

Nel checkout sorgente Sites: TypeScript, build di produzione e **203 test automatici passati**. Tre chiamate dirette da Node a Google Gemma su descrizioni sintetiche hanno restituito `engine: gemma` e la categoria attesa: gradino in italiano (`steps`, 15,768 s), gradini negati e buca (`uneven_surface`, 13,101 s), gradino in inglese (`steps`, 8,813 s). Sono prove limitate di integrazione/regressione, non una misura di accuratezza generale. Non sono state create segnalazioni pubbliche di prova. Il deploy Sites v3 era riuscito all'indirizzo indicato sopra; il successo del deploy e delle prove Node non dimostrava però una chiamata Gemma riuscita nel runtime Worker. La verifica reale di quel percorso è documentata nella versione 4.

L'applicazione nella radice non era stata modificata né sottoposta di nuovo ai test durante quell'aggiornamento Gemma. I 203 test cloud e le tre chiamate dirette appartengono alla versione 3.

## Verifiche storiche della versione 2

TypeScript, build di produzione e 115 test automatici passati per lo snapshot v2. Verificati localmente resize/scroll del visual viewport, ritorno al layout mappa, input nei viewport ridotti e assenza di overflow orizzontale. La simulazione desktop non certifica il comportamento della tastiera reale su ogni iPhone; è ancora necessario un controllo su Safari iOS.

### Passaggio GitHub originale, versione 2

Da una nuova copia del repository, con Node 24.13.0: `npm ci` riuscito in entrambe le directory; radice **93 test** e build passati; `cloud/` type-check, **115 test** e build passati. Applicata la migration a un database locale vuoto e avviato il server di sviluppo: pagina, `/api/status`, `/api/osm` e `/api/reports` rispondevano HTTP 200; OSM conteneva 1.158 record e il database locale zero segnalazioni. Nessuna segnalazione era stata inserita nel sito pubblico durante quelle prove. Questi risultati descrivono il precedente passaggio, non una nuova esecuzione dei test della radice.
