// Testi della landing in un solo punto, per correggerli o tradurli senza toccare i componenti.
// Regola del progetto: mai "accessibile" o "sicuro", solo ciò che i dati permettono di verificare.

import type { LatLngTuple } from '../../shared/types.ts';
import { STATIC } from './staticData.ts';

export interface Scenario { id: string; name: string; hint: string; from: LatLngTuple; to: LatLngTuple }

export const REPO_URL = 'https://github.com/gixrda/accessgo';
// Su GitHub Pages l'app (che richiede il server) non c'è: i link portano alle istruzioni per provarla.
export const APP_URL = STATIC ? `${REPO_URL}#installazione` : '/';
export const CLOUD_URL = 'https://accessogo.xyxzwb.chatgpt.site/';

export const copy = {
  meta: { payoff: 'Freedom to move.' },
  nav: {
    label: 'Navigazione principale',
    links: [
      { href: '#come-funziona', label: 'Come funziona' },
      { href: '#demo', label: 'Prova un percorso' },
      { href: '#progetto', label: 'Il progetto' },
    ],
    cta: STATIC ? 'Come provarla' : 'Apri OpenWay',
    menu: 'Menu',
  },
  hero: {
    title: 'La città è tua da esplorare.',
    lead: 'Scopri i percorsi, consulta le informazioni sulle barriere e contribuisci a rendere la mobilità urbana più consapevole.',
    searchLabel: 'Dove vuoi andare a Pisa?',
    searchPlaceholder: 'Via, piazza o luogo',
    searchButton: 'Cerca',
    searching: 'Cerco…',
    tooShort: 'Scrivi almeno 3 lettere per cercare.',
    noResults: (q: string) => `Nessun luogo trovato a Pisa per «${q}». Prova con il nome della via o della piazza.`,
    resultsLabel: 'Luoghi trovati',
    openRoute: 'Calcola il percorso fin qui',
    primary: 'Esplora la mappa',
    secondary: 'Scopri come funziona',
    exploring: 'Trascina la mappa, usa la rotella o i tasti freccia per spostarti.',
    exitExplore: 'Torna alla presentazione',
    mapLabel: 'Mappa interattiva della zona universitaria di Pisa',
  },
  routeCard: {
    title: 'Percorso di esempio',
    place: 'Via Roma, zona universitaria',
    loading: 'Calcolo il percorso di esempio…',
    error: 'Il servizio dei percorsi non risponde in questo momento. Sulla mappa restano gli ostacoli conosciuti.',
    note: 'Calcolato ora per sedia a rotelle e confrontato con OpenStreetMap. Nessun tratto è stato controllato di persona.',
    recorded: (date: string) => `Versione dimostrativa: percorso registrato il ${date}, senza calcolo dal vivo su questa pagina.`,
    branchesNote: 'Le linee chiare che si aprono a metà sono strade vicine: fanno parte dell’animazione, non sono percorsi calcolati.',
    replay: 'Riproduci l’animazione',
    legend: {
      route: 'Percorso per sedia a rotelle',
      footRoute: 'Percorso a piedi, non valutato per sedia a rotelle',
      obstacle: 'Ostacolo noto in OpenStreetMap',
      report: 'Segnalazione da controllare',
      alert: 'Punto di attenzione, in ordine',
    },
  },
  controls: {
    zoomIn: 'Avvicina',
    zoomOut: 'Allontana',
    recenter: 'Centra il percorso',
  },
  rail: [
    { id: 'problema', label: 'Il problema' },
    { id: 'come-funziona', label: 'Come funziona' },
    { id: 'demo', label: 'Prova un percorso' },
    { id: 'benefici', label: 'Benefici' },
    { id: 'progetto', label: 'Il progetto' },
    { id: 'domande', label: 'Domande' },
  ],
  intro: { word: 'OpenWay', payoff: 'Freedom to move.' },
  statements: {
    title: 'In breve',
    items: [
      { icon: 'route', text: ['Il percorso,', 'prima di partire.'] },
      { icon: 'warning', text: ['Gli ostacoli, nell’ordine', 'in cui li incontri.'] },
      { icon: 'report', text: ['Le segnalazioni', 'di chi passa di lì.'] },
      { icon: 'mic', text: ['La voce, per dettare', 'e farsi guidare.'] },
    ],
  },
  problem: {
    title: 'Non tutte le strade {pin} sono uguali per tutti.',
    statement: 'Un cordolo senza scivolo, un marciapiede che si interrompe, un cantiere comparso ieri. Per chi si muove in sedia a rotelle bastano pochi centimetri a cambiare un tragitto, e quasi nessuna mappa li mostra.',
    points: [
      {
        title: 'Le barriere sono piccole',
        text: 'Gradini, cordoli alti, passaggi stretti, pavé sconnesso. Per chi cammina non contano, quindi le mappe comuni li ignorano.',
      },
      {
        title: 'I dati ci sono a metà',
        text: 'Nella zona universitaria di Pisa OpenStreetMap registra 55 ostacoli noti e 398 possibili difficoltà. Molti marciapiedi però non sono mappati, e di tanti attraversamenti non si sa se hanno lo scivolo.',
      },
      {
        title: 'Ogni tragitto nuovo è una prova',
        text: 'Senza informazioni affidabili si scopre la strada solo percorrendola, spesso con qualcuno accanto.',
      },
    ],
    source: 'Fonte: snapshot OpenStreetMap del 24/10/2026, 1158 elementi della zona universitaria.',
  },
  features: {
    title: 'Come funziona',
    lead: 'Quattro cose che il prototipo fa oggi, nella zona universitaria di Pisa.',
    uiNote: 'Elementi ricostruiti dall’interfaccia dell’app, con i suoi testi e i suoi stati. L’esempio di percorso è via Roma, con i dati OpenStreetMap del 24/10/2026.',
    ui: {
      layers: [
        { mark: 'known', label: 'Ostacoli noti' },
        { mark: 'report', label: 'Segnalazioni degli utenti' },
        { mark: 'possible', label: 'Possibili difficoltà' },
        { mark: 'positive', label: 'Elementi utili' },
        { mark: 'info', label: 'Attraversamenti senza informazioni' },
        { mark: 'place', label: 'Negozi e luoghi accessibili' },
      ],
      report: {
        text: '«Transenne del cantiere sul marciapiede: non riesco a passare»',
        understood: 'Abbiamo capito così',
        category: 'Marciapiede bloccato',
        question: 'Si riesce a passare con la sedia a rotelle?',
        yes: 'Sì',
        no: 'No',
        status: 'Da controllare',
      },
      route: {
        verdict: '3 punti di attenzione',
        alerts: ['Marciapiede senza scivolo', 'Marciapiede senza scivolo', 'Marciapiede senza scivolo'],
        note: 'Basato sulla mappa libera OpenStreetMap: nessuno ha controllato questo percorso di persona.',
      },
      voice: {
        button: 'Detta arrivo',
        said: '«Portami in Piazza dei Cavalieri»',
        searched: 'Cerco: Piazza dei Cavalieri',
      },
    },
    items: [
      {
        id: 'esplora',
        title: 'Guarda cosa c’è lungo la strada',
        text: 'Ostacoli noti di OpenStreetMap e segnalazioni degli utenti, ognuno con forma, icona e testo. Da lontano vedi solo quelli che contano, avvicinandoti compaiono gli altri dettagli.',
      },
      {
        id: 'segnala',
        title: 'Segnala un ostacolo in un minuto',
        text: 'Tocchi il punto sulla mappa, descrivi cosa hai trovato e, se vuoi, aggiungi una foto. Gemma propone il tipo di ostacolo e fa una domanda, tu confermi o correggi. La segnalazione resta «da controllare» finché un moderatore non la verifica.',
      },
      {
        id: 'naviga',
        title: 'Calcola un percorso e leggi i limiti',
        text: 'Il percorso per sedia a rotelle arriva da Valhalla, con fino a tre alternative controllate tratto per tratto. I punti di attenzione sono numerati nell’ordine in cui li incontri. Se una segnalazione blocca il passaggio sul tuo percorso, OpenWay lo ricalcola.',
      },
      {
        id: 'voce',
        title: 'Detta, ascolta, prosegui',
        text: 'Puoi dettare partenza, arrivo e descrizione delle segnalazioni. La guida vocale legge in italiano le istruzioni di svolta e avanza con il GPS. Funziona solo in HTTPS e richiede la chiave ElevenLabs sul server; i comandi vocali completi non ci sono ancora.',
      },
    ],
  },
  demo: {
    title: 'Prova un percorso {pin} reale',
    lead: 'Cinque tragitti della zona universitaria, gli stessi usati per la demo del progetto. Scegline uno: il percorso viene calcolato adesso, gli ostacoli sono quelli mappati in OpenStreetMap e nessuno è stato controllato sul posto.',
    pick: 'Scegli un tragitto',
    loading: 'Calcolo il percorso…',
    error: 'Il servizio dei percorsi non risponde. Riprova tra poco oppure apri il tragitto direttamente nell’app.',
    retry: 'Riprova',
    open: 'Apri questo percorso in OpenWay',
    alertsTitle: 'Lungo il percorso',
    noAlerts: 'Nessun ostacolo noto lungo questo percorso, nei dati disponibili.',
    more: (n: number) => `e altri ${n} nell’app`,
    at: (d: string) => `a ${d}`,
    mapLabel: 'Mappa del tragitto scelto',
    scenarios: [
      { id: 'roma', name: 'Via Roma', hint: 'Tutto pedonale, con marciapiedi senza scivolo', from: [43.71696, 10.39513], to: [43.71856, 10.39513] },
      { id: 'mediceo', name: 'Lungarno Mediceo', hint: 'A piedi si passa da una scala, in sedia a rotelle la si evita', from: [43.715316, 10.406241], to: [43.716072, 10.406693] },
      { id: 'santamaria', name: 'Via Santa Maria', hint: 'Un tratto in strada senza marciapiede mappato', from: [43.71823, 10.39744], to: [43.71983, 10.39744] },
      { id: 'galloro', name: 'Via del Galloro', hint: 'Marciapiedi senza scivolo e un tratto in strada', from: [43.714, 10.39565], to: [43.7156, 10.39565] },
      { id: 'antonio', name: 'Piazza Sant’Antonio', hint: 'Un’alternativa più lunga per evitare la strada', from: [43.71243, 10.39733], to: [43.71243, 10.39953] },
    ] satisfies Scenario[] as Scenario[],
  },
  benefits: {
    title: 'Più informazioni. Meno incertezza.',
    lead: 'OpenWay non promette strade perfette. Ti dice cosa c’è, cosa manca e chi l’ha visto, prima che tu esca di casa.',
    items: [
      { id: 'lungo', title: 'Sai cosa trovi lungo la strada', text: 'Prima di partire vedi ostacoli noti e segnalazioni sul percorso, in ordine, con la distanza dalla partenza.' },
      { id: 'manca', title: 'Sai anche cosa manca', text: 'Quando i dati non bastano OpenWay lo dice: tratti senza marciapiede mappato, attraversamenti senza informazioni sullo scivolo.' },
      { id: 'aiuta', title: 'La tua segnalazione aiuta chi viene dopo', text: 'Un ostacolo segnalato compare sulla mappa per tutti. Se blocca il passaggio, i percorsi lo evitano finché non risulta risolto.' },
      { id: 'modi', title: 'Scegli come interagire', text: 'Mappa, tocco, testo o voce: usi il modo che ti è più comodo, e nessuna azione importante parte da sola.' },
    ],
    visual: {
      stops: ['Marciapiede senza scivolo', 'Segnalazione da controllare', 'Tratto in strada senza marciapiede'],
      start: 'Partenza',
      end: 'Arrivo',
      missing: [
        { kind: 'road', label: 'Tratto in strada senza marciapiede mappato' },
        { kind: 'info', label: 'Attraversamento senza informazioni sullo scivolo' },
      ],
      statuses: ['Da controllare', 'Controllata sul posto', 'Risolta'],
      statusNote: 'Solo un moderatore cambia lo stato.',
      modes: [
        { icon: 'pin', label: 'Mappa' },
        { icon: 'start', label: 'Tocco' },
        { icon: 'search', label: 'Testo' },
        { icon: 'mic', label: 'Voce' },
      ],
    },
  },
  project: {
    title: 'Il progetto',
    text: [
      'OpenWay è un prototipo nato a Pisa durante un hackathon, nell’ottobre 2026. All’inizio si chiamava AccessGo.',
      'L’idea è semplice: una mappa per chi si muove in sedia a rotelle che dica cosa sa, cosa è solo probabile e cosa manca. Per questo non definisce mai un percorso «accessibile» o «sicuro», e dichiara ogni volta che usa una soluzione di ripiego.',
    ],
    card: {
      name: 'OpenWay',
      kind: 'Prototipo · Pisa, zona universitaria',
      rows: [
        { label: 'Nato', value: 'Hackathon, ottobre 2026' },
        { label: 'Nome precedente', value: 'AccessGo' },
        { label: 'Copertura', value: 'Zona universitaria di Pisa' },
        { label: 'Stato dei percorsi', value: 'Non controllati sul posto' },
      ],
      repo: 'Codice su GitHub',
    },
    figuresTitle: 'I dati della zona',
    figuresNote: 'Snapshot OpenStreetMap del 24/10/2026. Sono gli elementi mappati, non una verifica sul posto.',
    figures: [
      { value: 1158, label: 'elementi OpenStreetMap analizzati' },
      { value: 55, label: 'ostacoli noti' },
      { value: 398, label: 'possibili difficoltà' },
      { value: 105, label: 'elementi utili, come gli scivoli' },
    ],
    stackTitle: 'Dati e tecnologie',
    stack: [
      { icon: 'layers', name: 'OpenStreetMap', role: 'Ostacoli e marciapiedi, snapshot del 24/10/2026' },
      { icon: 'route', name: 'Valhalla e OSRM', role: 'Percorsi e istruzioni di svolta, istanze FOSSGIS' },
      { icon: 'search', name: 'Nominatim', role: 'Ricerca degli indirizzi a Pisa' },
      { icon: 'report', name: 'Gemma 4', role: 'Lettura delle segnalazioni, con controllo lato server' },
      { icon: 'mic', name: 'ElevenLabs', role: 'Dettatura e guida vocale' },
      { icon: 'pin', name: 'React e Leaflet', role: 'Interfaccia e mappa' },
    ],
    limitsTitle: 'Cosa non fa ancora',
    limits: [
      'Copre solo la zona universitaria di Pisa.',
      'Le segnalazioni restano da controllare finché un moderatore non le verifica.',
      'Usa servizi pubblici gratuiti, che possono essere lenti o non rispondere.',
      'La guida vocale è stata provata nel browser, non camminando con un telefono.',
    ],
  },
  faq: {
    title: 'Domande frequenti',
    items: [
      { q: 'Dove funziona?', a: 'Per ora solo nella zona universitaria di Pisa, l’area coperta dallo snapshot di OpenStreetMap del 24/10/2026.' },
      { q: 'Il percorso è garantito senza barriere?', a: 'No. OpenWay mostra ciò che i dati permettono di verificare: ostacoli noti, segnalazioni e tratti senza informazioni. L’assenza di ostacoli noti non è una garanzia e nessun percorso è stato controllato di persona.' },
      { q: 'Chi controlla le segnalazioni?', a: 'Ogni segnalazione nasce «da controllare». Solo un moderatore può segnarla come controllata sul posto o come risolta. Una segnalazione risolta non viene più evitata dai percorsi.' },
      { q: 'Che cosa fa l’intelligenza artificiale?', a: 'Gemma legge la descrizione di una segnalazione, propone tipo e gravità e fa una domanda mirata. Chi segnala conferma o corregge. L’AI non decide mai che un ostacolo è verificato.' },
      { q: 'Serve la voce per usarlo?', a: 'No: mappa, tocco e testo bastano. Dettatura e guida vocale richiedono HTTPS e il servizio ElevenLabs attivo sul server; quando manca, l’app lo dice e si può scrivere.' },
      { q: 'Quali dati vengono conservati?', a: 'Le segnalazioni, con il punto scelto sulla mappa e l’eventuale foto, ridimensionata nel browser e senza dati GPS. Audio e trascrizioni della voce non vengono conservati.' },
    ],
  },
  closing: {
    title: 'La città si scopre, insieme.',
    text: 'Apri la mappa, prova un percorso o segnala il primo ostacolo che incontri.',
    primary: STATIC ? 'Come provarla' : 'Prova OpenWay',
    secondary: 'Guarda il codice',
  },
  footer: {
    about: 'Prototipo per orientarsi in sedia a rotelle nella zona universitaria di Pisa.',
    productTitle: 'Prodotto',
    projectTitle: 'Progetto',
    app: STATIC ? 'Come provarla' : 'Apri la mappa',
    repo: 'Codice sorgente',
    cloud: 'Edizione online (versione precedente)',
    privacyTitle: 'Privacy',
    privacy: 'Le segnalazioni vengono salvate sul server del progetto con il punto scelto sulla mappa. Le foto sono ridimensionate nel browser e senza dati GPS. Audio e trascrizioni della voce non vengono conservati.',
    credits: 'Dati mappa © OpenStreetMap contributors (ODbL). Percorsi: Valhalla e OSRM (FOSSGIS e.V.). Carattere: Atkinson Hyperlegible Next.',
  },
};
