// Scarica da Overpass i dati OSM dell'area demo e salva uno snapshot normalizzato in server/data/osm-pisa.json.
// Uso: npm run fetch:osm  (una sola richiesta: non eseguirlo in loop, rispetta i limiti di Overpass)
import { writeFile } from 'node:fs/promises';
import { DEMO_BBOX, type OsmDataset } from '../shared/types.ts';
import { normalizeOverpass, overpassQuery } from '../server/osm.ts';

// Istanza principale e un mirror pubblico, provati in sequenza (Overpass risponde spesso 429/502 sotto carico).
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
let json: { elements: Parameters<typeof normalizeOverpass>[0] } | undefined;
for (const url of ENDPOINTS) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': 'AccessGo-hackathon/0.1', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: overpassQuery(DEMO_BBOX) }),
    signal: AbortSignal.timeout(90_000),
  }).catch((e: Error) => e);
  if (res instanceof Response && res.ok) { json = await res.json(); break; }
  console.warn(`${url}: ${res instanceof Response ? `HTTP ${res.status}` : res.message}`);
}
if (!json) throw new Error('Overpass non disponibile: lo snapshot esistente non è stato modificato.');
const dataset: OsmDataset = {
  source: 'OpenStreetMap contributors (ODbL), via Overpass API',
  fetchedAt: new Date().toISOString(),
  bbox: DEMO_BBOX,
  features: normalizeOverpass(json.elements),
};
const file = new URL('../server/data/osm-pisa.json', import.meta.url);
await writeFile(file, JSON.stringify(dataset));
const count = (c: string) => dataset.features.filter((f) => f.certainty === c).length;
console.log(`OSM: ${json.elements.length} elementi → ${dataset.features.length} feature`,
  { known_obstacle: count('known_obstacle'), possible_issue: count('possible_issue'), positive_info: count('positive_info'), info: count('info') });
