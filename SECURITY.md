# Sicurezza

## Segnalare una vulnerabilità

Non aprire una issue pubblica. Usa la segnalazione privata di GitHub: scheda **Security** → **Report a vulnerability**. Rispondiamo il prima possibile; descrivi come riprodurre il problema e il suo impatto.

## Cosa è nel perimetro

- App e API in questa cartella (`src/`, `server/`, `shared/`) e la landing statica pubblicata su GitHub Pages.
- L'edizione `cloud/` è un'app separata con un proprio deploy.

OpenWay è un prototipo nato per un hackathon: non usarlo per dati personali sensibili.

## Come è protetto

- Le chiavi (Gemma, ElevenLabs, OpenRouteService, codice moderatore) sono lette solo dal server da `.env`, che non è nel repository. Nel browser non arriva nessuna chiave.
- Il server di produzione invia una Content Security Policy restrittiva, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`, e rifiuta percorsi fuori da `dist/`.
- Il codice moderatore è confrontato a tempo costante; se `ADMIN_TOKEN` è vuoto, il cambio di stato è disabilitato. Sceglilo lungo e casuale.
- La landing su GitHub Pages è statica: nessun server, nessun dato utente. Parla solo con le tile di OpenStreetMap e con Nominatim (ricerca, una richiesta al secondo, solo all'invio), con una CSP che lo impone.
- Le segnalazioni sono salvate in `server/data/` (escluso da git); le foto sono ridimensionate nel browser e senza dati GPS; audio e trascrizioni non vengono conservati.
- I workflow GitHub usano permessi minimi e azioni bloccate su commit; Dependabot controlla dipendenze e azioni.
