import type { LatLngTuple, RouteResult } from '../shared/types.ts';
import { HttpError, USER_AGENT, type Env } from './errors.ts';

type Point = { lat: number; lng: number };

const NO_WHEELCHAIR_ROUTE = 'Nessun percorso per sedia a rotelle trovato tra questi punti con i dati disponibili.';

/**
 * Routing per sedia a rotelle, tutto gratuito:
 * 1. OpenRouteService "wheelchair" se c'è ORS_API_KEY (chiave gratuita; considera anche i cordoli);
 * 2. Valhalla "pedestrian/wheelchair" sull'istanza pubblica FOSSGIS (senza chiave);
 * 3. solo se nessuno dei due risponde: percorso pedonale OSRM, marcato mode="foot_fallback" e dichiarato nell'interfaccia.
 */
export async function getRoute(from: Point, to: Point, env: Env): Promise<RouteResult> {
  const routers = env.ORS_API_KEY
    ? [() => orsWheelchair(from, to, env.ORS_API_KEY!), () => valhalla(from, to, 'wheelchair')]
    : [() => valhalla(from, to, 'wheelchair')];
  let reason = '';
  for (const route of routers) {
    try {
      const r = await route();
      return reason ? { ...r, notice: reason } : r;
    } catch (e) {
      // "Nessun percorso per sedia a rotelle" è un risultato, non un guasto: non lo sostituiamo con un altro percorso.
      if (e instanceof HttpError && e.status === 404) throw e;
      reason = e instanceof HttpError ? e.message : 'Servizio di routing per sedia a rotelle non raggiungibile.';
    }
  }
  return { ...(await osrmFoot(from, to)), notice: `${reason} Mostrato un percorso pedonale standard.` };
}

/** Percorso pedonale standard per il confronto: stesso motore (Valhalla) del profilo sedia a rotelle, OSRM come riserva. */
export async function getFootRoute(from: Point, to: Point): Promise<RouteResult> {
  try {
    return await valhalla(from, to, 'foot');
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw e;
    return { ...(await osrmFoot(from, to)), mode: 'foot' };
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
  // 2009 = percorso non trovato, 2010 = punto non collegato alla rete percorribile
  if (res.status === 404 || res.status === 400) throw new HttpError(404, NO_WHEELCHAIR_ROUTE);
  if (!res.ok) throw new HttpError(502, 'OpenRouteService ha restituito un errore.');
  const json = await res.json() as {
    features?: { geometry: { coordinates: [number, number][] }; properties: { summary: { distance?: number; duration?: number } } }[];
  };
  const f = json.features?.[0];
  if (!f) throw new HttpError(404, NO_WHEELCHAIR_ROUTE);
  return {
    mode: 'wheelchair', provider: 'openrouteservice',
    coords: f.geometry.coordinates.map(([lng, lat]): LatLngTuple => [lat, lng]),
    distanceM: f.properties.summary.distance ?? 0,
    durationS: f.properties.summary.duration ?? null,
  };
}

type OsrmResponse = { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };

async function valhalla(from: Point, to: Point, type: 'wheelchair' | 'foot'): Promise<RouteResult> {
  const res = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      locations: [{ lat: from.lat, lon: from.lng }, { lat: to.lat, lon: to.lng }],
      costing: 'pedestrian',
      // type=wheelchair: 4 km/h e solo fondi compatti o migliori. Valhalla penalizza le scale senza escluderle:
      // con la penalità massima ammessa (12 h) le usa solo se non esiste alternativa, e l'analisi le segnala.
      costing_options: { pedestrian: type === 'wheelchair' ? { type, step_penalty: 43_200 } : { type } },
      format: 'osrm',
      shape_format: 'geojson',
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new HttpError(503, 'Servizio di routing per sedia a rotelle non raggiungibile.'); });
  if (res.status === 429) throw new HttpError(503, 'Troppe richieste al servizio di routing per sedia a rotelle.');
  const json = await res.json().catch(() => null) as OsrmResponse | null;
  if (json?.code === 'NoRoute') throw new HttpError(404, type === 'wheelchair' ? NO_WHEELCHAIR_ROUTE : 'Nessun percorso trovato tra questi punti.');
  const r = json?.code === 'Ok' ? json.routes?.[0] : undefined;
  if (!res.ok || !r) throw new HttpError(502, 'Il servizio di routing per sedia a rotelle ha restituito un errore.');
  return {
    mode: type, provider: 'valhalla',
    coords: r.geometry.coordinates.map(([lng, lat]): LatLngTuple => [lat, lng]),
    distanceM: r.distance,
    durationS: r.duration,
  };
}

async function osrmFoot(from: Point, to: Point): Promise<RouteResult> {
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    .catch(() => { throw new HttpError(503, 'Servizio di routing non raggiungibile. Controlla la connessione e riprova.'); });
  if (res.status === 429) throw new HttpError(503, 'Troppe richieste al servizio di routing. Riprova tra poco.');
  const json = await res.json().catch(() => null) as OsrmResponse | null;
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
