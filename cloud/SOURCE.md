# Aggiornamento v7 · deviazioni per ostacoli e rischi visibili

- Sorgente Sites: `38d44a5c9daf48d2a083534c76adbcda48df3e94`.
- Versione 7 pubblicata il 24 ottobre 2026 alle 13:45:15 UTC; revisione ambiente 2 invariata.
- Sito: https://accessogo.xyxzwb.chatgpt.site/
- Base GitHub: `07ac24e`, dopo il merge della PR #5 e gli aggiornamenti del team. Prosegue il ramo `codex/gemma-api-reliability`; nessun push diretto o merge su `main`.
- Questo aggiornamento modifica soltanto `cloud/`; l'applicazione nella radice resta separata.

Il server carica gli ostacoli OSM espliciti e le segnalazioni verificate ammesse dal database, esclude le geometrie nel provider e ricontrolla ogni deviazione. Massimo due tentativi; nessun ripiego pedonale per le richieste pubbliche in sedia a rotelle. Gli ostacoli non aggirati o i controlli incompleti impediscono l'avvio della guida vocale. I rischi precedono le statistiche, la linea bloccata è rossa tratteggiata. La sezione v7 del README descrive criteri e limiti spaziali.

Verifiche: 515 test, TypeScript e build passati; regressioni UI finali 13/13. Due casi Valhalla reali: deviazione di 1452.232 m che evita sei record OSM, e NoRoute dopo esclusioni correttamente bloccato. Browser locale: Piazza Dante → Torre di Pisa, circa800 m/12 min, un ostacolo evitato; interfaccia390×844 senza errori console. Nessun report di prova pubblicato. I test software e API non certificano l'accessibilità sul posto; iPhone fisico e prove con utenti restano da svolgere.

---

# Aggiornamento v6 · ricerca e navigazione vocale

- Sorgente Sites: `ef1248ee9bd503181e3cfe7de7cc8d45cb33d1ce`.
- Versione 6 pubblicata il 24 ottobre 2026 alle 13:29:27 UTC; revisione ambiente 2 invariata.
- Sito: https://accessogo.xyxzwb.chatgpt.site/
- Base GitHub: `0cdb2ab`, dopo il merge della PR #4 da parte del team. Prosegue il ramo `codex/gemma-api-reliability`, senza push diretto o merge su `main`.
- Tutti i file applicativi e test di `cloud/` corrispondono allo snapshot sopra. Solo README e questa nota contengono le informazioni aggiuntive per il team. La radice del repository non è stata modificata o ritestata in questo aggiornamento.

## Cambiamenti

Ricerca unificata e microfono **Parla** in alto, mappa prevalente su telefono, pannelli/livelli espandibili. I nomi di luoghi e gli indirizzi vengono cercati direttamente, senza dipendere da AI. ElevenLabs trascrive richieste complete con rilevamento automatico della lingua; Gemma propone partenza, destinazione e tappe. Tutti i risultati geografici richiedono scelta e conferma prima del calcolo. Nessun test di questo flusso pubblica segnalazioni.

Ricerca OSM con nomi alternativi IT/EN/ZH, attesa limitata sul cooldown e fallback su dati locali reali. Polo F identifica l’area Polo Fibonacci, con ingresso da verificare. La localizzazione per pianificazione prova alta precisione e, solo se indisponibile/scaduta, una stima normale; stime di 100–1000 m richiedono conferma. Rifiuti dei permessi e posizioni fuori Pisa sono espliciti; vecchie risposte GPS/AI non sovrascrivono nuove scelte.

## Verifiche

TypeScript, build di produzione e **493 test passati**. Roundtrip locale ElevenLabs reale: MP3 sintetico 31.390 byte → Scribe v2 → `Vorrei andare alla Torre di Pisa` → Gemma con destinazione Torre di Pisa; elenco report invariato. Sette ricerche OSM reali verificate. Browser locale 390 × 844: luoghi confermati, percorso Valhalla 620 m con 8 manovre. Il modello ha interpretato correttamente una richiesta con partenza e tappa dichiarate dopo la destinazione, e ha richiesto chiarimenti per destinazioni alternative.

Una chiamata diretta Gemma in cinese è riuscita; due precedenti chiamate Worker in cinese hanno usato il fallback correttamente indicato, senza causa transitoria confermata. Non è una prova di accuratezza generale. iPhone fisico, microfono, permessi e GPS durante una passeggiata restano da verificare. La guida richiede schermo/pagina attivi e non ricalcola automaticamente.

Verifica pubblica v6 a 390 × 844: ricerca diretta `比萨斜塔` senza AI, selezione di Piazza dei Cavalieri come partenza e conferma dei due candidati; percorso restituito di 620 m, 10 minuti e 8 manovre. I controlli Parla e Guida vocale risultano disponibili. Questa prova non ha richiesto permessi microfono/GPS né creato report.

Credenziali, database pubblici, `.dev.vars`, dipendenze e build non sono inclusi. Una scansione dei file sorgente e del bundle client non ha trovato i segreti locali configurati.

---

## Cronologia precedente

# Provenienza e integrazione

Questa cartella contiene lo snapshot sorgente AccessGo v5 del 24 ottobre 2026, pubblicato sul sito esistente https://accessogo.xyxzwb.chatgpt.site/. Le verifiche locali e quelle della versione pubblicata sono distinte.

- Commit sorgente Sites v5: `adf8ff2390f77b347eb9503007608ffb7694c2d7`.
- Deploy Sites v5 riuscito il 24 ottobre 2026 alle 13:08:56 UTC, con revisione ambiente 2.
- Snapshot Sites precedente v4: `0f54c63995506c389856a220c3f738c65061d86f`.
- Snapshot Sites precedente v3: `62593066f93726c79b50f6f02570db185f0d02a6`.
- Snapshot Sites precedente v2: `6047df2fe500511074c966b40663c6ebed8d9a59`.
- Base delle migliorie mobile/ricerca: `f0828a2` del ramo locale `codex/mobile-first-round`.
- Base del ramo per questo aggiornamento: `0c1dabf`, dopo l’integrazione della PR #3 da parte del team. La base applicativa nella radice, già documentata come `dc0aa89`, resta separata dallo snapshot cloud.
- Il lavoro prosegue sul ramo `codex/gemma-api-reliability`. La precedente [PR #3](https://github.com/gixrda/accessgo/pull/3), relativa alla versione 4, è stata integrata dal team; questo aggiornamento parte da `0c1dabf`. La precedente PR #2 riguardava la versione 3. Le modifiche della versione 5 interessano solo `cloud/`; nessun push diretto o merge su `main` viene eseguito da questo aggiornamento.
- I file applicativi, il lockfile e i test cloud corrispondono al commit sorgente v5 indicato sopra. Solo questa nota e il README sono stati aggiunti/aggiornati per il passaggio al team.

## Cosa eseguire

- Radice del repository: app Node/Vite del team, con le sue funzionalità recenti.
- `cloud/`: app pubblica React/Leaflet + Vinext + Cloudflare Workers/D1. Dipendenze e test separati (`cd cloud && npm ci && npm test`).
- Per installazione, inizializzazione locale D1 e avvio: [README.md](README.md).

## Cosa non è ancora integrato

I commit recenti del team `c5ef551`, `91eb45c`, `b7a833c`, `dc0aa89` introducono assistente segnalazioni/foto, controllo dei tratti, esclusione degli ostacoli bloccanti e testi semplificati nella radice. Queste funzionalità non sono state portate automaticamente nell'app cloud. Viceversa, le modifiche di questa cartella non sostituiscono il frontend nella radice. La scelta di quale architettura unificare resta una decisione del team, seguita da integrazione e test.

Il database pubblico delle segnalazioni, credenziali, file `.env`, dipendenze installate e build non sono inclusi. Lo snapshot OSM è quello reale già usato dal sito (1.158 elementi). Il progetto Sites mantiene la propria cronologia di deploy: un push GitHub non aggiorna il sito.

## Novità della versione 5

- Analisi distinta di assenza/rimozione (`no_obstacle`) e descrizione da chiarire (`unclear`), con etichette italiane esplicite. L’assenza descritta non certifica l’accessibilità e non risolve segnalazioni esistenti. Il backend impedisce di pubblicarla come ostacolo; le descrizioni incerte richiedono chiarimenti o una categoria manuale.
- Itinerari ordinati con fino a tre tappe intermedie. Il routing riceve tutti i punti, conserva le manovre reali e rifiuta risposte parziali; cambiamenti delle tappe cancellano le indicazioni obsolete.
- Dettatura confermata dall’utente con ElevenLabs Scribe v2 e lettura con ElevenLabs Flash v2.5. Le credenziali rimangono nel Worker. L’audio e le trascrizioni non vengono salvati nel database; i limiti condivisi conservano soltanto timestamp. Le prove audio non avviano il GPS.

## Verifiche attuali della versione 5

Nel checkout sorgente Sites: TypeScript, build di produzione e **356 test automatici passati**. Tre chiamate reali dal Worker locale a Gemma hanno restituito `engine: gemma`, `published: false` e le categorie attese `no_obstacle`, `unclear`, `uneven_surface`; le segnalazioni sono rimaste invariate.

Una richiesta reale a Valhalla con tre punti ha restituito circa 1.210 m, 76 coordinate e 17 manovre. Una verifica separata nel browser locale a 390 × 844 ha completato un itinerario con tre punti, mostrando 1,2 km e 15 indicazioni. Si tratta di verifiche del routing e dell’interfaccia, non di accessibilità fisica del percorso.

Dopo la configurazione della chiave e dei relativi permessi, il Worker locale ha completato un roundtrip reale ElevenLabs: TTS HTTP 200, MP3 di 33.897 byte per `Tra cento metri, gira a destra.`, seguito da STT HTTP 200 con Scribe v2 e testo `Tra 100 metri gira a destra`. Nel browser locale è comparso lo stato di riproduzione ElevenLabs senza errori in console. L’audio sintetico verifica il collegamento fra servizi, non un microfono fisico o una passeggiata reale.

Il deploy Sites v5 è riuscito. Nel browser pubblico a 390 × 844 è stato calcolato un itinerario a tre punti (Duomo su Via Roma, Via Santa Maria, Piazza dei Cavalieri), con 960 m e 11 indicazioni. Questa verifica è distinta dagli itinerari locali descritti sopra. Sul sito pubblico il pulsante Prova voce ElevenLabs ha mostrato lo stato Audio ElevenLabs in riproduzione; è stata salvata una schermata del browser mobile. Microfono, permessi e riproduzione su iPhone reale, oltre al comportamento GPS durante una passeggiata, restano da verificare. La guida richiede pagina e schermo attivi; non funziona come navigazione in background e non ricalcola automaticamente il percorso.

L’applicazione nella radice non è stata modificata né sottoposta nuovamente ai test in questo round. I conteggi e i risultati storici sotto appartengono alle versioni indicate.

## Anteprima senza pubblicazione introdotta nella versione 4

Nel pannello **Segnala**, il pulsante **Analizza senza pubblicare** accetta una descrizione senza account, posizione o categoria manuale. Mostra **Anteprima · non pubblicata**, il motore effettivo e l'eventuale motivo del fallback. Una modifica del testo o l'uscita dal pannello elimina l'anteprima e annulla la richiesta pendente; risposte tardive non sostituiscono risultati più recenti.

Il nuovo `POST /api/analyze` non inserisce segnalazioni, non salva testo o interpretazione e non aggiunge marker. Il testo viene inviato al servizio AI esterno. Un intervallo globale minimo di 5 secondi è gestito atomicamente in `provider_limits`, salvando solo un timestamp tecnico. Non sono conservati identificativi dei visitatori, coordinate o contenuti di prova. L'azione separata **Invia segnalazione** mantiene accesso obbligatorio e posizione esatta, ricalcola l'interpretazione e crea una segnalazione non verificata.

È inoltre corretta un'incompatibilità con Cloudflare Workers: le chiamate Gemma usano `redirect: 'manual'` e rifiutano esplicitamente le risposte 3xx. `redirect: 'error'`, usato in precedenza, non era supportato nel runtime Worker. Le prove Node della versione 3 non coprivano quel runtime e non bastavano a dimostrare il funzionamento delle chiamate dal sito ospitato.

## Verifiche storiche della versione 4

Nel checkout sorgente Sites: TypeScript, build di produzione e **238 test automatici passati**. Una richiesta reale al Worker locale, tramite `POST /api/analyze`, ha restituito `engine: gemma`, categoria `uneven_surface` e `published: false` in circa 8 secondi. Anche il browser locale nel viewport 390 × 844 ha mostrato un'anteprima Gemma reale, dopo un precedente fallback transitorio. L'elenco locale delle segnalazioni è rimasto a zero prima e dopo le prove.

I test coprono accesso anonimo, mancata persistenza dei contenuti, segnalazioni esistenti invariate, limite condiviso, cancellazione e risposte tardive, errore/riprova, fallback dichiarato e pubblicazione autenticata separata. Non sono state create segnalazioni pubbliche di prova. Il deploy Sites v4 è riuscito. Sul sito pubblico, una prova dal browser a 390 × 844 senza accesso né posizione ha mostrato un risultato Gemma reale per `Non ci sono gradini. Il problema è una buca profonda.`: categoria `Superficie irregolare`, ostacolo `buca profonda` e intestazione `Anteprima · non pubblicata`. Sono prove limitate di integrazione, non una garanzia di disponibilità o accuratezza generale del modello.

L'applicazione nella radice non è stata modificata né sottoposta di nuovo ai test in questo round. Questi 238 test cloud appartengono alla versione 4 e restano distinti dai 356 test della versione 5 e dai conteggi precedenti.

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
