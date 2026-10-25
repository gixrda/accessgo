# OpenWay — Design System
**Tagline:** Freedom to move.  
**Versione:** 1.0  
**Stato:** Direzione visuale e specifiche iniziali per la landing page

---

## 1. Visione del prodotto

OpenWay è una piattaforma di navigazione urbana orientata all'accessibilità. La landing page deve comunicare subito tre concetti:

1. **Orientamento:** una mappa reale e interattiva è il fulcro dell'esperienza.
2. **Consapevolezza:** le informazioni sulle barriere aiutano a comprendere meglio il percorso.
3. **Partecipazione:** le persone possono contribuire con segnalazioni e informazioni utili.

### Principi di design

- **Map-first:** la mappa è il protagonista della hero, non una semplice illustrazione decorativa.
- **Chiarezza prima dell'effetto:** ogni elemento visuale deve aiutare a capire il prodotto.
- **Editoriale, non template:** tipografia espressiva, spazio bianco, ritmo visivo e sezioni con composizioni variate.
- **Liquid Glass leggero:** trasparenze e blur sono riservati soprattutto ai controlli sovrapposti alla mappa.
- **Accessibilità concreta:** contrasto, focus visibile, interazione da tastiera e movimento ridotto.
- **Trasparenza dei dati:** non presentare come verificata una segnalazione che non lo è; non promettere percorsi sicuri o accessibili se i dati non lo dimostrano.

---

## 2. Direzione artistica

### Riferimenti

- **Google Maps:** gerarchia cartografica, ricerca flottante, mappa interattiva e comportamento del percorso.
- **Apple Maps:** pulizia, leggibilità e controlli discreti.
- **PATHS / Ableway:** comunicazione centrata sull'accessibilità e sulla missione, adottando però un tema chiaro.
- **Orinav / WaySee:** riferimenti per esplorare interazione vocale e navigazione assistita.

Questi riferimenti sono ispirazioni, non specifiche da copiare. OpenWay deve mantenere un'identità propria.

### Mood

- Luminoso, contemporaneo, umano e affidabile.
- Urbano e tecnologico senza apparire freddo o eccessivamente futuristico.
- Niente tema scuro come impostazione predefinita.
- Evitare gradienti saturi, glow neon, ombre pesanti e pannelli di vetro ovunque.

---

## 3. Palette colori

| Token | Valore | Uso |
|---|---|---|
| `color.canvas` | `#F8F9F7` | Sfondo principale della pagina |
| `color.surface` | `#FFFFFF` | Card e superfici solide |
| `color.surface-soft` | `#F1F4F2` | Sezioni alternate e superfici secondarie |
| `color.text` | `#202124` | Testo principale |
| `color.text-muted` | `#5F6368` | Testo secondario |
| `color.border` | `#DADCE0` | Bordi e divisori |
| `color.primary` | `#1677FF` | CTA, percorso principale e link |
| `color.primary-hover` | `#0F63D8` | Hover della CTA |
| `color.primary-soft` | `#E8F1FF` | Fondi informativi leggeri |
| `color.teal` | `#167D78` | Accenti secondari legati alla mobilità |
| `color.success` | `#137333` | Stato positivo |
| `color.warning` | `#A15C00` | Avvisi e informazioni da verificare |
| `color.danger` | `#B3261E` | Errori o ostacoli critici |
| `color.focus` | `#0B57D0` | Indicatore di focus accessibile |
| `color.action` | `#0F63D8` | Fondo dei pulsanti primari: bianco su `#1677FF` è 4,1:1, sotto AA (aggiunto il 25/10/2026) |
| `color.ice` | `#E8F0FF` | Sfondo di sezione azzurro ghiaccio (25/10/2026) |
| `color.soft-blue` | `#C9DCFF` | Bordi del vetro, gradienti delicati, aloni (25/10/2026) |
| `color.sky` | `#DDF2FF` | Celeste dal logo, riflessi del vetro (25/10/2026) |
| `color.deep` | `#123B79` | Titoli enfatici, numeri, inizio del gradiente finale (25/10/2026) |
| `color.mid-blue` | `#1458C9` | Fine del gradiente finale: testo bianco piccolo sopra 4,5:1 (25/10/2026) |

### Regole d'uso

- Blu per azione primaria e percorso selezionato.
- Teal come accento secondario, non come unico segnale di stato.
- Stati e segnalazioni devono combinare colore, icona e testo.
- Verificare il contrasto di ogni coppia testo/sfondo; non affidarsi al colore da solo.
- La mappa deve conservare una palette neutra e poco satura per non competere con i percorsi e i marker.

---

## 4. Tipografia

### Font

Preferire **Inter** o una sans-serif di sistema equivalente. Se il progetto ha già una famiglia tipografica consolidata, mantenere una sola famiglia principale.

### Scala tipografica

| Token | Desktop | Mobile | Peso | Uso |
|---|---:|---:|---:|---|
| `type.display` | 64 px | 42 px | 650–700 | Headline hero |
| `type.h1` | 48 px | 36 px | 650–700 | Titolo di sezione principale |
| `type.h2` | 36 px | 30 px | 600–650 | Titoli di sezione |
| `type.h3` | 24 px | 22 px | 600 | Titoli delle funzionalità |
| `type.body-lg` | 20 px | 18 px | 400 | Intro e lead |
| `type.body` | 16 px | 16 px | 400 | Corpo testo |
| `type.small` | 14 px | 14 px | 400 | Testi secondari |
| `type.caption` | 12 px | 12 px | 400–500 | Note e attribuzioni |

### Line-height e lunghezza

- Display e titoli: `1.05–1.15`.
- Corpo testo: `1.5–1.7`.
- Testo descrittivo: larghezza ideale di 55–75 caratteri per riga.
- Evitare paragrafi lunghi e allineamenti centrati su testi articolati.

---

## 5. Spaziatura e layout

Usare una scala coerente basata su multipli di 4 px.

| Token | Valore |
|---|---:|
| `space.1` | 4 px |
| `space.2` | 8 px |
| `space.3` | 12 px |
| `space.4` | 16 px |
| `space.5` | 20 px |
| `space.6` | 24 px |
| `space.8` | 32 px |
| `space.10` | 40 px |
| `space.12` | 48 px |
| `space.16` | 64 px |
| `space.20` | 80 px |
| `space.24` | 96 px |
| `space.32` | 128 px |

### Griglia

- Container massimo desktop: `1200–1320 px`.
- Padding laterale desktop: `48–64 px`.
- Padding laterale tablet: `32 px`.
- Padding laterale mobile: `20–24 px`.
- Griglia desktop: 12 colonne.
- Spazio tra sezioni: `96–144 px` desktop, `64–88 px` mobile.
- Usare sezioni alternate per ritmo, senza trasformare ogni sezione in una card.

---

## 6. Bordi, raggi e ombre

### Radius

| Token | Valore | Uso |
|---|---:|---|
| `radius.sm` | 8 px | Input compatti, piccoli tag |
| `radius.md` | 12 px | Input e pulsanti |
| `radius.lg` | 20 px | Card e pannelli |
| `radius.xl` | 28 px | Pannelli principali flottanti |
| `radius.pill` | 999 px | CTA e chip |

### Ombre

- `shadow.soft`: `0 4px 16px rgba(32, 33, 36, 0.06)`
- `shadow.panel`: `0 8px 32px rgba(32, 33, 36, 0.10)`
- `shadow.float`: `0 12px 40px rgba(32, 33, 36, 0.12)`

Le ombre devono creare separazione, non un effetto di profondità eccessivo.

---

## 7. Liquid Glass

### Principio

Liquid Glass è un trattamento selettivo per pannelli flottanti, in particolare sulla mappa. Non deve diventare il materiale di tutta la pagina.

### Specifiche iniziali

- Fondo: bianco con opacità `0.78–0.88`.
- Blur: `12–20 px`.
- Bordo: `1 px solid rgba(255, 255, 255, 0.75)`.
- Ombra: `0 8px 32px rgba(32, 33, 36, 0.10)`.
- Contrasto interno sufficiente anche su aree della mappa molto dettagliate.
- Evitare blur elevato su contenuti estesi e testo piccolo.

### Esempio CSS

```css
.glass-panel {
  background: rgba(255, 255, 255, 0.84);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 8px 32px rgba(32, 33, 36, 0.10);
  border-radius: 20px;
}

@supports not ((backdrop-filter: blur(1px))) {
  .glass-panel {
    background: #FFFFFF;
  }
}
```

Per i controlli sovrapposti alla mappa, aggiungere un fondo sufficientemente opaco e un focus ben visibile. Non applicare `backdrop-filter` a ogni elemento per evitare costi di rendering non necessari.

---

## 8. Iconografia e illustrazioni

- Preferire icone lineari semplici, con stroke coerente.
- Usare un'unica libreria di icone in tutto il prodotto.
- Non comunicare ostacoli o accessibilità solo attraverso pittogrammi non etichettati.
- Le illustrazioni devono essere funzionali e sobrie; privilegiare schermate reali del prodotto.
- Marker della mappa con forma, icona e label dove necessario.

### Stati delle segnalazioni

Ogni segnalazione deve rendere comprensibile il proprio stato:
- **Verificata:** confermata secondo un processo definito.
- **Da verificare:** informazione inviata ma non confermata.
- **Scaduta / non aggiornata:** dato che potrebbe non essere più attuale.
- **Risolta:** ostacolo non più presente, se la risoluzione è stata confermata.

Definire esplicitamente il processo che porta una segnalazione da uno stato all'altro. Non usare l'etichetta “verificata” se non esiste un controllo reale.

---

## 9. Componenti UI

### Pulsanti

**Primary**
- Fondo `color.primary`, testo bianco.
- Altezza minima 48 px.
- Padding orizzontale 20–24 px.
- Radius pill o 12 px in base al contesto.
- Hover: `color.primary-hover`.
- Focus: outline di almeno 2 px con offset visibile.

**Secondary**
- Fondo bianco o trasparente.
- Bordo `color.border`.
- Testo `color.text`.
- Stessa altezza e tipografia della primary.

**Tertiary / text**
- Nessun contenitore evidente.
- Usare per azioni secondarie, con area cliccabile generosa.

### Input e ricerca

- Altezza minima 48–52 px.
- Etichetta persistente o label accessibile, non solo placeholder.
- Bordo neutro; focus blu chiaramente visibile.
- Messaggi di errore specifici e vicini al campo.
- Per la ricerca sulla mappa, prevedere stato vuoto, caricamento, risultati e assenza di risultati.

### Chip e badge

- Usare per filtri e stati.
- Testo breve, contrasto sufficiente e icona quando utile.
- Evitare badge puramente decorativi o un eccesso di colori.

### Card

- Fondo bianco, bordo leggero o ombra soft.
- Radius `20 px`.
- Padding `24–32 px`.
- Non usare card per ogni contenuto: alternare composizioni editoriali, immagini e testo.

### Navigazione

- Header leggero e chiaro.
- Logo OpenWay a sinistra.
- Link principali essenziali.
- CTA primaria a destra.
- Su mobile, menu accessibile con nome e stato esplicito.

---

## 10. Hero: specifica di riferimento

### Obiettivo

Far percepire immediatamente OpenWay come una piattaforma di navigazione reale e interattiva, con una gerarchia visiva ispirata all'usabilità cartografica di Google Maps e una resa pulita e leggera.

### Composizione

1. Header trasparente o chiaro, leggibile sulla mappa.
2. Mappa interattiva a tutta larghezza, con altezza indicativa `min-height: 680px` desktop e `min-height: 620px` mobile, da adattare al viewport.
3. Pannello di ricerca flottante con Liquid Glass leggero.
4. Headline e breve descrizione, collocate in un'area con contrasto garantito. Evitare testo sovrapposto a una zona della mappa troppo dettagliata.
5. CTA primaria: **Esplora la mappa**.
6. CTA secondaria: **Scopri come funziona**.
7. Controlli mappa per zoom, posizione e livelli, se supportati.
8. Legenda chiara per segnalazioni e stato dei dati.

### Copy indicativo

**Headline:** “The city is yours to explore.”  
**Descrizione:** “Scopri i percorsi, consulta le informazioni sulle barriere e contribuisci a rendere la mobilità urbana più consapevole.”  
**CTA primaria:** “Esplora la mappa”  
**CTA secondaria:** “Scopri come funziona”

La lingua della pagina va uniformata: se il prodotto si rivolge principalmente al pubblico italiano, usare headline e CTA in italiano.

### Comportamento

- La mappa deve essere realmente interattiva, non un'immagine animata.
- Animare il percorso solo quando aggiunge comprensione.
- Evitare spostamenti automatici continui che tolgano il controllo all'utente.
- Rispettare `prefers-reduced-motion`.
- Mantenere i controlli utilizzabili da tastiera e screen reader.
- Non far partire l'audio automaticamente.
- Comunicare chiaramente quando una rotta o una segnalazione non è verificata.

---

## 11. Struttura della landing page

### 01 — Hero / Above the fold
Mappa interattiva, headline, descrizione, CTA primaria e secondaria.

### 02 — Il problema
Spiegazione editoriale delle difficoltà di orientamento e delle barriere urbane. Usare dati o esempi reali solo quando disponibili e citabili.

### 03 — Funzionalità principali
- Esplorazione della mappa.
- Consultazione e invio di segnalazioni.
- Ricalcolo del percorso, se implementato e supportato dai dati.
- Assistente vocale, limitatamente alle funzioni realmente disponibili.

### 04 — Demo del prodotto
Video breve o demo interattiva: ricerca destinazione, consultazione di un ostacolo, segnalazione e aggiornamento del percorso. Non simulare capacità non implementate senza indicarle come demo.

### 05 — Benefici
Elenco breve, concreto e centrato sull'utente. Evitare promesse assolute come “percorso sempre sicuro” o “accessibile a tutti”.

### 06 — Progetto, team e partner
Presentare il contesto del progetto, il team e le tecnologie. Mostrare esclusivamente partner e loghi autorizzati.

### 07 — CTA finale
Invito a provare il prototipo, partecipare alla validazione o contribuire al progetto, secondo lo stato reale di OpenWay.

### 08 — Footer
Contatti, informazioni sul progetto, privacy, accessibilità ed eventuale newsletter. Inserire una newsletter solo se esiste un processo di iscrizione e gestione dei consensi.

---

## 12. Motion design

- Durata micro-interazioni: `150–220 ms`.
- Transizioni tra pannelli: `220–320 ms`.
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Animazioni brevi, con uno scopo funzionale.
- Evitare parallax aggressivo, elementi in movimento continuo e transizioni che ritardano l'accesso ai contenuti.
- Se `prefers-reduced-motion: reduce`, disabilitare le animazioni non essenziali.

Esempio:

```css
:root {
  --motion-fast: 180ms;
  --motion-standard: 260ms;
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
}

.interactive {
  transition:
    background-color var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-standard) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 13. Responsive design

### Desktop — da 1024 px
- Hero cartografica ampia.
- Pannello ricerca flottante.
- Layout editoriale a 2 colonne dove utile.
- Spazio bianco generoso e titoli grandi.

### Tablet — 768–1023 px
- Ridurre headline e padding.
- Evitare sovrapposizioni tra header, pannello di ricerca e controlli della mappa.
- Usare composizioni a una o due colonne in base alla larghezza effettiva.

### Mobile — sotto 768 px
- Headline compatta, testo breve e CTA facilmente raggiungibili.
- Controlli della mappa distanziati e touch target di almeno 44 × 44 px.
- Pannello di ricerca adattato alla larghezza disponibile.
- Evitare che i pannelli coprano completamente la mappa.
- Considerare una barra di azione inferiore solo se non ostacola i controlli cartografici.

---

## 14. Accessibilità e fiducia

- Obiettivo: WCAG 2.2 AA per i contenuti e i componenti controllabili.
- Contrasto testo normale: almeno 4.5:1, salvo eccezioni previste dallo standard.
- Focus da tastiera sempre visibile.
- Tutte le funzioni essenziali accessibili senza mouse.
- Label programmatiche per input e pulsanti.
- Messaggi di stato annunciabili alle tecnologie assistive.
- Non usare soltanto il colore per indicare un ostacolo o un errore.
- Fornire alternativa testuale alle informazioni visive rilevanti della mappa, dove possibile.
- Non presentare una rotta come sicura, priva di barriere o pienamente accessibile senza dati e verifiche sufficienti.
- Indicare fonte e aggiornamento delle segnalazioni quando disponibili.

---

## 15. Linee guida tecniche

Queste sono opzioni di riferimento, da confermare rispetto allo stack effettivo del progetto:

- **UI:** React + TypeScript.
- **Styling:** CSS Modules, CSS globale organizzato a token o sistema equivalente già presente.
- **Mappa:** Leaflet con un provider cartografico compatibile; valutare condizioni d'uso, attribuzione, quote e costi.
- **Routing:** integrare un servizio compatibile con i requisiti reali di accessibilità; non presumere che il routing pedonale standard conosca rampe, gradini o ostacoli temporanei.
- **Icone:** una libreria coerente, per esempio Lucide.
- **Font:** Inter o sans-serif di sistema.
- **Motion:** CSS transitions per micro-interazioni; librerie dedicate solo quando necessarie.

### Token CSS iniziali

```css
:root {
  color-scheme: light;

  --color-canvas: #F8F9F7;
  --color-surface: #FFFFFF;
  --color-surface-soft: #F1F4F2;
  --color-text: #202124;
  --color-text-muted: #5F6368;
  --color-border: #DADCE0;
  --color-primary: #1677FF;
  --color-primary-hover: #0F63D8;
  --color-primary-soft: #E8F1FF;
  --color-teal: #167D78;
  --color-success: #137333;
  --color-warning: #A15C00;
  --color-danger: #B3261E;
  --color-focus: #0B57D0;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 28px;
  --radius-pill: 999px;

  --shadow-soft: 0 4px 16px rgba(32, 33, 36, 0.06);
  --shadow-panel: 0 8px 32px rgba(32, 33, 36, 0.10);
  --shadow-float: 0 12px 40px rgba(32, 33, 36, 0.12);

  --glass-bg: rgba(255, 255, 255, 0.84);
  --glass-blur: 16px;
  --glass-border: 1px solid rgba(255, 255, 255, 0.78);

  --container-max: 1280px;
  --page-gutter: 24px;
  --motion-fast: 180ms;
  --motion-standard: 260ms;
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);

  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--color-text);
  background: var(--color-canvas);
}

@media (min-width: 768px) {
  :root {
    --page-gutter: 32px;
  }
}

@media (min-width: 1200px) {
  :root {
    --page-gutter: 56px;
  }
}
```

---

## 16. Do / Don't

### Do
- Usare una mappa reale e interattiva nella hero.
- Mantenere un tema chiaro e un contrasto elevato.
- Applicare Liquid Glass in modo selettivo.
- Dare priorità a tipografia, spazio bianco e gerarchia.
- Distinguere dati verificati, non verificati e non aggiornati.
- Usare animazioni controllate e rispettose delle preferenze utente.
- Mostrare solo funzionalità e partner effettivamente disponibili.

### Don't
- Non usare una mappa statica fingendo che sia interattiva.
- Non usare un tema scuro come stile predefinito.
- Non mettere testo piccolo su pannelli molto trasparenti.
- Non rendere ogni sezione una griglia di card identiche.
- Non usare il colore come unico indicatore.
- Non dichiarare percorsi “sicuri” o “accessibili” senza evidenze.
- Non inventare testimonianze, statistiche, partnership o risultati.

---

## 17. Checklist di accettazione

- [ ] La hero mostra una mappa realmente interattiva.
- [ ] Ricerca, controlli e CTA hanno stati hover, focus, loading, errore e vuoto dove pertinenti.
- [ ] I pannelli Liquid Glass rimangono leggibili sulle diverse aree della mappa.
- [ ] La pagina è responsive e non presenta sovrapposizioni.
- [ ] Le interazioni principali funzionano da tastiera.
- [ ] Le animazioni rispettano `prefers-reduced-motion`.
- [ ] I marker distinguono chiaramente lo stato delle segnalazioni.
- [ ] Le funzionalità presentate corrispondono a quelle realmente implementate.
- [ ] Attribuzione e condizioni del provider cartografico sono rispettate.
- [ ] La pagina non fa promesse assolute sulla sicurezza o accessibilità dei percorsi.

---

**Sintesi:** OpenWay deve apparire come un prodotto cartografico credibile e immediatamente comprensibile, con una mappa protagonista, pannelli Liquid Glass discreti e una landing editoriale luminosa. La fiducia si costruisce con un'interfaccia chiara e con la trasparenza sui limiti e sull'affidabilità dei dati.
