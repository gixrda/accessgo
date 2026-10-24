# AccessGo – Come ottenere i dati sulle strade e sull'accessibilità a Pisa

## 1. Dove possiamo trovare i dati?

Per sviluppare AccessGo abbiamo bisogno di dati geografici reali, soprattutto relativi a marciapiedi, attraversamenti pedonali, scale, pendenze e barriere architettoniche.

La soluzione che propongo è combinare OpenStreetMap, OpenRouteService e alcune informazioni ufficiali del Comune di Pisa.

### A. OpenStreetMap (OSM) – Fonte principale

- Sito: <https://www.openstreetmap.org/>
- Strumento per estrarre i dati: <https://overpass-turbo.eu/>

OpenStreetMap è un progetto di cartografia collaborativa che mette a disposizione dati geografici aperti.

Possiamo ottenere informazioni su:

- Strade e percorsi pedonali
- Marciapiedi
- Scale
- Attraversamenti pedonali
- Cordoli dei marciapiedi
- Barriere architettoniche
- Tipologia e condizioni della superficie stradale
- Pendenza e larghezza dei percorsi
- Accessibilità per le persone in sedia a rotelle

I dati possono essere esportati in formati come GeoJSON e JSON, facilmente utilizzabili con Python.

Non tutte le strade hanno informazioni complete sull'accessibilità. Dobbiamo quindi distinguere tra percorsi accessibili, percorsi con ostacoli conosciuti e percorsi di cui non abbiamo abbastanza informazioni.

### B. OpenRouteService – Calcolo dei percorsi

- Sito: <https://openrouteservice.org/>
- Documentazione API: <https://openrouteservice.org/dev/>

OpenRouteService è un servizio di routing basato su dati cartografici che offre anche un profilo dedicato agli spostamenti in sedia a rotelle (wheelchair routing).

Potremmo utilizzarlo per:

1. Calcolare un percorso tra due punti.
2. Ottenere la geometria del percorso.
3. Visualizzare il percorso sulla nostra mappa.
4. Mostrare distanza e durata stimata, quando disponibili.

Per utilizzare il servizio è necessario ottenere una API Key.

### C. Wheelmap – Accessibilità degli edifici e dei luoghi pubblici

- Sito: <https://wheelmap.org/>

Wheelmap è una piattaforma dedicata all'accessibilità dei luoghi pubblici per le persone in sedia a rotelle.

Può fornirci informazioni utili su ristoranti, negozi, edifici pubblici e altri punti di interesse.

Questi dati potrebbero essere integrati in AccessGo per mostrare non soltanto il percorso, ma anche l'accessibilità della destinazione.

## 2. Dati ufficiali della Provincia e del Comune di Pisa

Possiamo utilizzare anche due fonti istituzionali.

### A. Provincia di Pisa – Dataset delle strade

- <https://opendata.provincia.pisa.it/datasets/strade>

La Provincia di Pisa mette a disposizione dati geografici relativi alla rete stradale.

Sono disponibili formati come GeoJSON, SHP e KML.

Questi dati possono integrare le informazioni di OpenStreetMap, anche se non contengono necessariamente tutti i dettagli sulle barriere architettoniche.

### B. Comune di Pisa – PEBA

Piano per l'Eliminazione delle Barriere Architettoniche.

- <https://www.comune.pisa.it/Amministrazione/Documenti-e-dati/Documenti-tecnici-di-supporto/PEBA-Piano-per-l-Eliminazione-delle-Barriere-Architettoniche>

Il PEBA contiene documentazione relativa all'accessibilità urbana e alle barriere architettoniche.

Tra i documenti sono presenti mappe e analisi dei percorsi.

È una fonte particolarmente interessante per il nostro progetto, ma parte del materiale è datato e disponibile in PDF. Per questo non possiamo considerarlo una fonte di informazioni aggiornate in tempo reale.

## 3. Come scaricare concretamente i dati di Pisa

Il metodo più semplice è utilizzare Overpass Turbo, che permette di interrogare i dati di OpenStreetMap senza dover creare un account.

### Procedura

1. Aprire <https://overpass-turbo.eu/>
2. Spostare la mappa su Pisa, preferibilmente vicino all'Università.
3. Selezionare un'area relativamente piccola, ad esempio un quartiere.
4. Inserire una query Overpass per ottenere percorsi pedonali, scale, attraversamenti e barriere.
5. Premere **Run** per eseguire la ricerca.
6. Selezionare **Export → Data → GeoJSON**.
7. Salvare il file e utilizzarlo nel nostro progetto Python.

### Query Overpass

```
[out:json][timeout:30];

(
  way["highway"~"^(footway|pedestrian|path|steps)$"]({{bbox}});
  way["sidewalk"]({{bbox}});
  node["kerb"]({{bbox}});
  node["highway"="crossing"]({{bbox}});
  node["barrier"]({{bbox}});
);

out body;
>;
out skel qt;
```

La variabile `{{bbox}}` rappresenta l'area geografica attualmente visibile sulla mappa.

Questa query ci permette di estrarre le informazioni già presenti in OpenStreetMap nell'area selezionata.

## 4. Quali attributi ci interessano maggiormente?

| Attributo OSM | Significato |
|---|---|
| `highway=steps` | Presenza di scale |
| `kerb=raised` | Cordolo rialzato |
| `kerb=lowered` | Cordolo ribassato |
| `surface=*` | Tipo di superficie |
| `smoothness=*` | Regolarità della superficie |
| `incline=*` | Pendenza del percorso |
| `width=*` | Larghezza del percorso |
| `wheelchair=*` | Informazioni sull'accessibilità per sedie a rotelle |

Questi attributi ci aiutano a identificare possibili difficoltà lungo un percorso.

Tuttavia, l'assenza di informazioni non significa che una strada sia accessibile.

## 5. Come possiamo integrare questi dati in AccessGo?

Propongo questa architettura:

```
OpenStreetMap → Elaborazione dei dati → OpenRouteService → Interfaccia AccessGo
```

Possiamo poi integrare un modello AI, ad esempio Gemma, per analizzare le segnalazioni degli utenti.

Per esempio, un utente potrebbe scrivere:

> "In Via Roma c'è un gradino troppo alto e non riesco a passare con la sedia a rotelle."

Il modello AI potrebbe identificare:

- **Luogo segnalato:** Via Roma
- **Tipo di ostacolo:** gradino
- **Problema:** passaggio non accessibile
- **Stato della segnalazione:** non verificata

L'utente dovrebbe anche indicare la posizione esatta sulla mappa, perché il solo nome della strada non è sufficiente.

Queste informazioni potrebbero essere visualizzate sulla mappa e, dopo un'opportuna verifica, contribuire a migliorare i suggerimenti di percorso.

## 6. Cosa possiamo realizzare durante l'hackathon?

Per il primo prototipo, propongo di concentrarci su una piccola zona di Pisa, ad esempio nei pressi dell'Università.

Le funzionalità principali potrebbero essere:

1. Visualizzare una mappa interattiva basata su OpenStreetMap.
2. Mostrare scale, attraversamenti pedonali e altri ostacoli conosciuti.
3. Permettere agli utenti di selezionare un punto di partenza e una destinazione.
4. Calcolare un percorso tramite OpenRouteService.
5. Consentire agli utenti di segnalare nuovi ostacoli attraverso un'interfaccia semplice.
6. Utilizzare Gemma per interpretare automaticamente le segnalazioni scritte in linguaggio naturale.

L'obiettivo principale è costruire un prototipo funzionante con dati reali, senza dover sviluppare da zero un intero sistema di navigazione.

Per la sicurezza degli utenti, dobbiamo sempre indicare che i percorsi suggeriti non sono necessariamente verificati sul posto.

## Conclusione

La parte più interessante di AccessGo non è creare una nuova mappa, ma combinare dati geografici aperti, algoritmi di navigazione e intelligenza artificiale per migliorare l'accessibilità urbana.

In questo modo potremmo realizzare un progetto concreto, utile e potenzialmente espandibile ad altre città.
