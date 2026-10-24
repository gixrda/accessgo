import type { LatLngTuple, RouteResult } from '../shared/types.ts';
import { HttpError, USER_AGENT, type Env } from './errors.ts';
import { distanceToRoute } from '../shared/geo.ts';
import { RULES } from '../shared/rules.ts';
import { chooseSafest } from './safety.ts';

type Point = { lat: number; lng: number };

const NO_WHEELCHAIR_ROUTE = "Non abbiamo trovato un percorso per la sedia a rotelle tra questi due punti. Prova a spostare la partenza o l'arrivo.";
const NO_ROUTE = "Non abbiamo trovato un percorso tra questi due punti. Prova a spostare la partenza o l'arrivo.";
const WHEELCHAIR_DOWN = 'Il servizio dei percorsi per sedia a rotelle non risponde.';

/**
 * Routing per sedia a rotelle, tutto gratuito:
 * 1. OpenRouteService "wheelchair" se c'è ORS_API_KEY (chiave gratuita; considera anche i cordoli);
 * 2. Valhalla "pedestrian/wheelchair" sull'istanza pubblica FOSSGIS (senza chiave);
 * 3. solo se nessuno dei due risponde: percorso pedonale OSRM, marcato mode="foot_fallback" e dichiarato nell'interfaccia.
 * Ogni percorso candidato viene verificato tratto per tratto (server/safety.ts): si scartano strade principali
 * senza marciapiede e scale, e tra le alternative si preferisce quella con meno carreggiata senza marciapiede.
 * `avoid`: segnalazioni bloccanti da evitare. Se nessun percorso le evita, si calcola senza escluderle e lo si dichiara.
 */
export async function getRoute(from: Point, to: Point, env: Env, avoid: Point[] = []): Promise<RouteResult> {
  if (!avoid.length) return wheelchairRoute(from, to, env, []);
  try {
    const r = await wheelchairRoute(from, to, env, avoid);
    // Il ripiego pedonale (OSRM) non sa escludere aree: in quel caso non dichiariamo nulla di evitato.
    if (r.mode === 'foot_fallback') return r;
    // Non ci si fida del servizio: si controlla sulla geometria che il percorso non passi più dagli ostacoli.
    const still = avoid.filter((p) => distanceToRoute(r.coords, [p.lat, p.lng]) <= RULES.ON_EDGE_M).length;
    return { ...r, avoidedBlocking: avoid.length - still, ...(still ? { avoidFailed: true } : {}) };
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 422)) {
      return { ...(await wheelchairRoute(from, to, env, [])), avoidFailed: true };
    }
    throw e;
  }
}

// Area esclusa attorno al punto dell'ostacolo agganciato alla rete: quadrato di semilato RULES.AVOID_HALF_M, in [lng, lat].
export function avoidSquare({ lat, lng }: Point): [number, number][] {
  const dLat = RULES.AVOID_HALF_M / 110_540;
  const dLng = RULES.AVOID_HALF_M / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]];
}

async function wheelchairRoute(from: Point, to: Point, env: Env, avoid: Point[]): Promise<RouteResult> {
  const sources = env.ORS_API_KEY
    ? [() => orsWheelchair(from, to, env.ORS_API_KEY!, avoid).then((r) => [r]), () => valhalla(from, to, 'wheelchair', 2, avoid)]
    : [() => valhalla(from, to, 'wheelchair', 2, avoid)];
  let reason = '';
  let unsafe: HttpError | null = null;
  for (const [i, source] of sources.entries()) {
    try {
      const r = await chooseSafest(await source(), true);
      return reason ? { ...r, notice: reason } : r;
    } catch (e) {
      // "Nessun percorso per sedia a rotelle" è un risultato, non un guasto: non lo sostituiamo con un altro percorso.
      if (e instanceof HttpError && e.status === 404) throw e;
      // Percorsi trovati ma tutti pericolosi: si prova il servizio successivo, altrimenti si comunica il limite.
      if (e instanceof HttpError && e.status === 422) {
        unsafe = e;
        if (i === sources.length - 1) throw e;
        continue;
      }
      reason = e instanceof HttpError ? e.message : WHEELCHAIR_DOWN;
    }
  }
  if (unsafe) throw unsafe;
  const foot = await chooseSafest([await osrmFoot(from, to)], true);
  return { ...foot, notice: `${reason} Ti mostriamo un normale percorso a piedi.` };
}

/**
 * Aggancia un punto alla rete percorribile in sedia a rotelle (Valhalla /locate): punto sulla via più vicina e distanza.
 * null se il servizio non risponde: in quel caso si usa il punto scelto da chi segnala.
 */
export async function snapToNetwork(p: Point): Promise<{ lat: number; lng: number; distanceM: number } | null> {
  try {
    const res = await fetch('https://valhalla1.openstreetmap.de/locate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ locations: [{ lat: p.lat, lon: p.lng }], costing: 'pedestrian', costing_options: { pedestrian: { type: 'wheelchair' } }, verbose: true }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { edges?: { correlated_lat: number; correlated_lon: number; distance: number }[] }[];
    const e = json[0]?.edges?.reduce((a, b) => (b.distance < a.distance ? b : a));
    return e ? { lat: e.correlated_lat, lng: e.correlated_lon, distanceM: Math.round(e.distance * 10) / 10 } : { lat: p.lat, lng: p.lng, distanceM: Infinity };
  } catch {
    return null;
  }
}

/** Percorso pedonale standard per il confronto: stesso motore (Valhalla) del profilo sedia a rotelle, OSRM come riserva. */
export async function getFootRoute(from: Point, to: Point): Promise<RouteResult> {
  try {
    return (await valhalla(from, to, 'foot'))[0];
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw e;
    return { ...(await osrmFoot(from, to)), mode: 'foot' };
  }
}

async function orsWheelchair(from: Point, to: Point, key: string, avoid: Point[]): Promise<RouteResult> {
  const res = await fetch('https://api.openrouteservice.org/v2/directions/wheelchair/geojson', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
    body: JSON.stringify({
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
      ...(avoid.length ? { options: { avoid_polygons: { type: 'MultiPolygon', coordinates: avoid.map((p) => [avoidSquare(p)]) } } } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'OpenRouteService non è configurato correttamente.');
  if (res.status === 429) throw new HttpError(503, 'OpenRouteService ha ricevuto troppe richieste.');
  // 2009 = percorso non trovato, 2010 = punto non collegato alla rete percorribile
  if (res.status === 404 || res.status === 400) throw new HttpError(404, NO_WHEELCHAIR_ROUTE);
  if (!res.ok) throw new HttpError(502, 'OpenRouteService ha avuto un problema.');
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

async function valhalla(from: Point, to: Point, type: 'wheelchair' | 'foot', alternates = 0, avoid: Point[] = []): Promise<RouteResult[]> {
  const res = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      locations: [{ lat: from.lat, lon: from.lng }, { lat: to.lat, lon: to.lng }],
      costing: 'pedestrian',
      // type=wheelchair: 4 km/h e solo fondi compatti o migliori. Valhalla penalizza le scale senza escluderle:
      // con la penalità massima ammessa (12 h) le usa solo se non esiste alternativa, e l'analisi le segnala.
      costing_options: { pedestrian: type === 'wheelchair' ? { type, step_penalty: 43_200 } : { type } },
      ...(alternates ? { alternates } : {}),
      // Verificato dal vivo: exclude_polygons sposta il percorso, exclude_locations no.
      ...(avoid.length ? { exclude_polygons: avoid.map(avoidSquare) } : {}),
      format: 'osrm',
      shape_format: 'geojson',
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new HttpError(503, WHEELCHAIR_DOWN); });
  if (res.status === 429) throw new HttpError(503, 'Il servizio dei percorsi per sedia a rotelle è molto usato in questo momento.');
  const json = await res.json().catch(() => null) as OsrmResponse | null;
  // 400: la richiesta è nostra, quindi è un caso senza percorso (es. punto dentro un'area esclusa), non un guasto.
  if (json?.code === 'NoRoute' || res.status === 400) throw new HttpError(404, type === 'wheelchair' ? NO_WHEELCHAIR_ROUTE : NO_ROUTE);
  const routes = json?.code === 'Ok' ? json.routes ?? [] : [];
  if (!res.ok || !routes.length) throw new HttpError(502, 'Il servizio dei percorsi per sedia a rotelle ha avuto un problema.');
  return routes.map((r) => ({
    mode: type, provider: 'valhalla',
    coords: r.geometry.coordinates.map(([lng, lat]): LatLngTuple => [lat, lng]),
    distanceM: r.distance,
    durationS: r.duration,
  }));
}

async function osrmFoot(from: Point, to: Point): Promise<RouteResult> {
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    .catch(() => { throw new HttpError(503, 'Non riusciamo a calcolare il percorso. Controlla la connessione e riprova.'); });
  if (res.status === 429) throw new HttpError(503, 'Il servizio dei percorsi è molto usato in questo momento. Riprova tra poco.');
  const json = await res.json().catch(() => null) as OsrmResponse | null;
  if (!json) throw new HttpError(502, 'Il servizio dei percorsi ha avuto un problema. Riprova tra poco.');
  if (json.code !== 'Ok' || !json.routes?.[0]) throw new HttpError(404, NO_ROUTE);
  const r = json.routes[0];
  return {
    mode: 'foot_fallback', provider: 'osrm-fossgis',
    coords: r.geometry.coordinates.map(([lng, lat]): LatLngTuple => [lat, lng]),
    distanceM: r.distance,
    // La durata OSRM è calcolata a passo pedonale: non la mostriamo come stima per una sedia a rotelle.
    durationS: null,
  };
}
