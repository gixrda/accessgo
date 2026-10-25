// Versione statica della landing (GitHub Pages): niente server, quindi niente /api.
// Dati OSM e percorsi registrati vengono serviti come file; la ricerca va direttamente a Nominatim.
import { PISA_BOUNDS, type GeocodeResult, type OsmDataset, type RouteResult } from '../../shared/types.ts';

const env = (import.meta as { env?: Record<string, string | undefined> }).env;
/** true nel build per GitHub Pages (vite build --mode static) */
export const STATIC = env?.VITE_STATIC === '1';
export const BASE = env?.BASE_URL ?? '/';

export interface RecordedRoutes { recordedAt: string; routes: Record<string, RouteResult> }

let recorded: Promise<RecordedRoutes> | null = null;
async function json<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`).catch(() => { throw new Error('Sei offline o la connessione è lenta. Controlla la rete e riprova.'); });
  if (!res.ok) throw new Error('Dati non disponibili in questo momento. Ricarica la pagina tra poco.');
  return res.json() as Promise<T>;
}

export const staticOsm = () => json<OsmDataset>('data/osm-pisa.json');
export const staticRoutes = () => (recorded ??= json<RecordedRoutes>('data/routes-recorded.json'));

// Policy Nominatim: al massimo 1 richiesta al secondo, solo all'invio (niente autocompletamento), risultati in cache.
const cache = new Map<string, GeocodeResult[]>();
let last = 0;
export async function geocodeDirect(q: string): Promise<GeocodeResult[]> {
  const key = q.trim().toLowerCase();
  if (key.length < 3) throw new Error('Scrivi almeno 3 lettere per cercare.');
  const hit = cache.get(key);
  if (hit) return hit;
  const wait = last + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const [s, w, n, e] = PISA_BOUNDS;
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: q.trim().slice(0, 200), format: 'jsonv2', limit: '5', viewbox: `${w},${n},${e},${s}`, bounded: '1', 'accept-language': 'it',
  })}`;
  const res = await fetch(url, { referrerPolicy: 'strict-origin-when-cross-origin' }).catch(() => null);
  if (!res?.ok) throw new Error('La ricerca degli indirizzi non funziona in questo momento. Riprova tra poco.');
  const data = await res.json() as { display_name?: unknown; lat?: unknown; lon?: unknown }[];
  // I dati arrivano da un servizio esterno: si tengono solo campi del tipo atteso, mai HTML.
  const results = (Array.isArray(data) ? data : [])
    .filter((r) => typeof r.display_name === 'string' && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
    .map((r) => ({ label: String(r.display_name).slice(0, 300), lat: Number(r.lat), lng: Number(r.lon) }));
  cache.set(key, results);
  return results;
}
