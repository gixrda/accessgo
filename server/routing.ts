import type { LatLngTuple, RouteResult } from '../shared/types.ts';
import { HttpError, USER_AGENT, type Env } from './errors.ts';

type Point = { lat: number; lng: number };

/**
 * Con ORS_API_KEY usa il profilo OpenRouteService "wheelchair".
 * Senza chiave, o se ORS non risponde, usa il router pedonale OSRM di FOSSGIS: il risultato è marcato
 * mode="foot_fallback" e l'interfaccia lo dichiara come NON valutato per sedia a rotelle.
 */
export async function getRoute(from: Point, to: Point, env: Env): Promise<RouteResult> {
  if (!env.ORS_API_KEY) return osrmFoot(from, to);
  try {
    return await orsWheelchair(from, to, env.ORS_API_KEY);
  } catch (e) {
    // "Nessun percorso per sedia a rotelle" è un risultato, non un guasto: non lo sostituiamo con un percorso pedonale.
    if (e instanceof HttpError && e.status === 404) throw e;
    const reason = e instanceof HttpError ? e.message : 'OpenRouteService non raggiungibile.';
    return { ...(await osrmFoot(from, to)), notice: `${reason} Mostrato un percorso pedonale standard.` };
  }
}

async function orsWheelchair(from: Point, to: Point, key: string): Promise<RouteResult> {
  const res = await fetch('https://api.openrouteservice.org/v2/directions/wheelchair/geojson', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
    body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'Chiave OpenRouteService non valida.');
  if (res.status === 429) throw new HttpError(503, 'Limite di richieste OpenRouteService raggiunto.');
  if (res.status === 404 || res.status === 400) {
    // 2009 = percorso non trovato, 2010 = punto non collegato alla rete percorribile
    throw new HttpError(404, 'Nessun percorso per sedia a rotelle trovato tra questi punti con i dati disponibili.');
  }
  if (!res.ok) throw new HttpError(502, 'OpenRouteService ha restituito un errore.');
  const json = await res.json() as {
    features?: { geometry: { coordinates: [number, number][] }; properties: { summary: { distance?: number; duration?: number } } }[];
  };
  const f = json.features?.[0];
  if (!f) throw new HttpError(404, 'Nessun percorso per sedia a rotelle trovato.');
  return {
    mode: 'wheelchair', provider: 'openrouteservice',
    coords: f.geometry.coordinates.map(([lng, lat]): LatLngTuple => [lat, lng]),
    distanceM: f.properties.summary.distance ?? 0,
    durationS: f.properties.summary.duration ?? null,
  };
}

async function osrmFoot(from: Point, to: Point): Promise<RouteResult> {
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    .catch(() => { throw new HttpError(503, 'Servizio di routing non raggiungibile. Controlla la connessione e riprova.'); });
  if (res.status === 429) throw new HttpError(503, 'Troppe richieste al servizio di routing. Riprova tra poco.');
  const json = await res.json().catch(() => null) as
    | { code: string; routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] }
    | null;
  if (!json) throw new HttpError(502, 'Il servizio di routing ha restituito un errore.');
  if (json.code !== 'Ok' || !json.routes?.[0]) throw new HttpError(404, 'Nessun percorso trovato tra questi punti.');
  const r = json.routes[0];
  return {
    mode: 'foot_fallback', provider: 'osrm-fossgis',
    coords: r.geometry.coordinates.map(([lng, lat]): LatLngTuple => [lat, lng]),
    distanceM: r.distance,
    // La durata OSRM è calcolata a passo pedonale: non la mostriamo come stima per una sedia a rotelle.
    durationS: null,
  };
}
