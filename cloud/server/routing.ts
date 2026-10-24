import type { LatLngTuple, RouteResult } from '../shared/types.ts';
import { routeDistances, type RouteManeuver } from '../shared/navigation.ts';
import { HttpError, USER_AGENT, type Env } from './errors.ts';
import { trustedBlockers, intersectingBlockers, exclusionRings, type RoutingSafetyContext, type ExclusionRing, type TrustedBlocker } from './route-safety.ts';
export type { RoutingSafetyContext } from './route-safety.ts';

type Point = { lat: number; lng: number };
type LngLat = [number, number];
type DirectedRoute = RouteResult & { maneuvers: RouteManeuver[]; waypoints: LatLngTuple[] };
const NO_WHEELCHAIR_ROUTE = 'Nessun percorso per sedia a rotelle trovato tra questi punti con i dati disponibili.';
const INCOMPLETE_ROUTE = 'Il servizio non ha restituito un percorso completo per tutte le tappe.';

/** Keep the requested order; every provider receives the entire trip in one request. */
function orderedPoints(from: Point, to: Point, via: Point[]): Point[] {
  if (via.length > 3) throw new HttpError(400, 'Puoi aggiungere al massimo 3 tappe intermedie.');
  return [from, ...via, to];
}
const waypoints = (points: Point[]): LatLngTuple[] => points.map(({ lat, lng }) => [lat, lng]);
const isLngLat = (p: unknown): p is LngLat => Array.isArray(p) && p.length >= 2
  && typeof p[0] === 'number' && Number.isFinite(p[0]) && Math.abs(p[0]) <= 180
  && typeof p[1] === 'number' && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90;
const finiteDistance = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function geometry(raw: unknown): LatLngTuple[] {
  if (!Array.isArray(raw) || raw.length < 2 || !raw.every(isLngLat)) throw new HttpError(502, INCOMPLETE_ROUTE);
  return raw.map(([lng, lat]) => [lat, lng]);
}

/** ORS wheelchair, then Valhalla wheelchair; clearly labelled pedestrian fallback only on failure. */
async function initialRoute(from: Point, to: Point, env: Env, via: Point[] = [], allowWalkingFallback = true): Promise<DirectedRoute> {
  const points = orderedPoints(from, to, via);
  const routers = env.ORS_API_KEY
    ? [() => orsWheelchair(points, env.ORS_API_KEY!), () => valhalla(points, 'wheelchair')]
    : [() => valhalla(points, 'wheelchair')];
  let reason = '';
  for (const route of routers) {
    try {
      const r = await route();
      return reason ? { ...r, notice: reason } : r;
    } catch (e) {
      // An inaccessible leg is a result, not permission to omit it or substitute a walking route.
      if (e instanceof HttpError && e.status === 404) throw e;
      reason = e instanceof HttpError ? e.message : 'Servizio di routing per sedia a rotelle non raggiungibile.';
    }
  }
  if (!allowWalkingFallback) throw new HttpError(503, reason || NO_WHEELCHAIR_ROUTE);
  return { ...(await osrmFoot(points)), notice: `${reason} Mostrato un percorso pedonale standard.` };
}


/** Bounded provider rerouting, followed by an independent geometry check. This is a data
 * check, not field validation; no walking fallback can bypass a supplied safety context. */
export async function getRoute(from: Point, to: Point, env: Env, via: Point[] = [], context?: RoutingSafetyContext): Promise<DirectedRoute> {
  let candidate = await initialRoute(from, to, env, via, !context);
  if (!context) return candidate;
  const points = orderedPoints(from, to, via);
  const blockers = trustedBlockers(context);
  let hits = intersectingBlockers(candidate.coords, blockers);
  const excluded = new Map<string, TrustedBlocker>();
  const key = (b: TrustedBlocker) => `${b.obstacle.source}:${b.obstacle.id}`;
  const result = (blocked: boolean): DirectedRoute => {
    const status = blocked ? 'blocked' : !context.reportsAvailable ? 'unavailable' : excluded.size ? 'rerouted' : 'checked';
    const message = blocked
      ? 'Nessuna alternativa che eviti tutti gli ostacoli identificati è stata trovata. Percorso solo da esaminare: guida vocale disattivata.'
      : !context.reportsAvailable
        ? 'Segnalazioni non disponibili: controllo degli ostacoli incompleto. Guida vocale disattivata; riprova prima di partire.'
        : excluded.size
          ? 'Percorso ricalcolato per evitare gli ostacoli identificati. Controllo sui dati disponibili, non verificato sul posto.'
          : 'Nessun ostacolo bloccante identificato lungo questa geometria nei dati controllati. Le informazioni possono essere incomplete.';
    const hitIds = new Set(hits.map(key));
    return { ...candidate, maneuvers: blocked || !context.reportsAvailable ? [] : candidate.maneuvers,
      safety: { status, message, blockedBy: hits.map(b => b.obstacle),
        avoided: [...excluded.values()].filter(b => !hitIds.has(key(b))).map(b => b.obstacle), reportsChecked: context.reportsAvailable } };
  };
  // Providers can snap requested stops onto another road. Check the original requested
  // positions against every blocker even when the returned geometry bypasses that stop.
  const blockedStops = points.flatMap(p => intersectingBlockers([[p.lat, p.lng]], blockers));
  if (blockedStops.length) {
    hits = [...new Map([...hits, ...blockedStops].map(b => [key(b), b])).values()];
    return result(true);
  }
  for (let attempt = 0; hits.length && attempt < 2; attempt++) {
    for (const b of hits) excluded.set(key(b), b);
    // A chosen stop inside a blocker cannot be silently snapped past or omitted.
    if (points.some(p => intersectingBlockers([[p.lat, p.lng]], hits).length)) return result(true);
    const rings = exclusionRings([...excluded.values()]);
    if (rings.length > 80) return result(true); // avoid an oversized request to a public provider
    try {
      candidate = candidate.provider === 'openrouteservice' && env.ORS_API_KEY
        ? await orsWheelchair(points, env.ORS_API_KEY, rings)
        : await valhalla(points, 'wheelchair', rings);
    } catch { return result(true); }
    // Check every trusted blocker, including ones encountered only on a detour.
    hits = intersectingBlockers(candidate.coords, blockers);
  }
  return result(hits.length > 0);
}

/** Standard walking comparison follows exactly the same ordered stops. */
export async function getFootRoute(from: Point, to: Point, via: Point[] = []): Promise<DirectedRoute> {
  const points = orderedPoints(from, to, via);
  try {
    return await valhalla(points, 'foot');
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw e;
    return { ...(await osrmFoot(points)), mode: 'foot' };
  }
}

type OrsStep = { instruction?: string; distance?: number; type?: number; way_points?: number[] };
type OrsResponse = { features?: { geometry?: { coordinates?: unknown }; properties?: {
  summary?: { distance?: number; duration?: number }; segments?: { steps?: OrsStep[] }[];
} }[] };
async function orsWheelchair(points: Point[], key: string, exclusions: ExclusionRing[] = []): Promise<DirectedRoute> {
  const res = await fetch('https://api.openrouteservice.org/v2/directions/wheelchair/geojson', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
    body: JSON.stringify({ coordinates: points.map(({ lng, lat }) => [lng, lat]), instructions: true, language: 'it',
      ...(exclusions.length ? { options: { avoid_polygons: { type: 'MultiPolygon', coordinates: exclusions.map(ring => [ring]) } } } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'Chiave OpenRouteService non valida.');
  if (res.status === 429) throw new HttpError(503, 'Limite di richieste OpenRouteService raggiunto.');
  if (res.status === 404 || res.status === 400) throw new HttpError(404, NO_WHEELCHAIR_ROUTE);
  if (!res.ok) throw new HttpError(502, 'OpenRouteService ha restituito un errore.');
  const json = await res.json() as OrsResponse;
  const f = json.features?.[0];
  if (!f) throw new HttpError(404, NO_WHEELCHAIR_ROUTE);
  const segments = f.properties?.segments;
  if (!segments || segments.length !== points.length - 1 || !finiteDistance(f.properties?.summary?.distance)) {
    throw new HttpError(502, INCOMPLETE_ROUTE);
  }
  const coords = geometry(f.geometry?.coordinates);
  const cumulative = routeDistances(coords);
  const maneuvers: RouteManeuver[] = [];
  let completeInstructions = true;
  let previousIndex = 0;
  segments.forEach((segment, legIndex) => {
    if (!segment.steps?.length) completeInstructions = false;
    for (const [stepIndex, step] of (segment.steps ?? []).entries()) {
      const shapeIndex = step.way_points?.[0];
      if (!Number.isInteger(shapeIndex) || shapeIndex! < previousIndex || shapeIndex! >= coords.length
        || (stepIndex === 0 && shapeIndex !== previousIndex)
        || !step.instruction?.trim() || !finiteDistance(step.distance)) {
        completeInstructions = false;
        continue;
      }
      previousIndex = shapeIndex!;
      maneuvers.push({ instruction: step.instruction.trim(), coordinate: coords[shapeIndex!],
        shapeIndex: shapeIndex!, routeDistanceM: cumulative[shapeIndex!], distanceM: step.distance, legIndex,
        type: step.type === 10 ? 'arrive' : step.type === 11 ? 'depart' : 'turn' });
    }
  });
  if (previousIndex !== coords.length - 1) completeInstructions = false;
  return {
    mode: 'wheelchair', provider: 'openrouteservice', coords,
    distanceM: f.properties!.summary!.distance!,
    durationS: finiteDistance(f.properties?.summary?.duration) ? f.properties.summary.duration : null,
    waypoints: waypoints(points), maneuvers: completeInstructions ? maneuvers : [],
  };
}

type OsrmStep = { distance?: number; maneuver?: { instruction?: string; type?: string; location?: unknown };
  intersections?: { geometry_index?: number }[];
};
type OsrmRoute = {
  distance?: number; duration?: number; geometry?: { coordinates?: unknown };
  legs?: { steps?: OsrmStep[] }[];
};
type OsrmResponse = { code: string; routes?: OsrmRoute[]; waypoints?: unknown[] };

function osrmGeometry(route: OsrmRoute, points: Point[]): LatLngTuple[] {
  // Count legs, rather than accepting a provider that silently dropped a requested stop.
  if (!route.legs || route.legs.length !== points.length - 1 || !finiteDistance(route.distance)) {
    throw new HttpError(502, INCOMPLETE_ROUTE);
  }
  return geometry(route.geometry?.coordinates);
}

function osrmManeuvers(route: OsrmRoute, coords: LatLngTuple[]): RouteManeuver[] {
  const cumulative = routeDistances(coords);
  const maneuvers: RouteManeuver[] = [];
  let cursor = 0;
  for (const [legIndex, leg] of (route.legs ?? []).entries()) {
    if (!leg.steps?.length) return [];
    const legOffset = cursor;
    for (const [stepIndex, step] of leg.steps.entries()) {
      const location = step.maneuver?.location;
      const instruction = step.maneuver?.instruction?.trim();
      if (!instruction || !isLngLat(location) || !finiteDistance(step.distance)) return [];
      const matches = (i: number) => i >= 0 && i < coords.length
        && Math.abs(coords[i][0] - location[1]) < 0.0000011 && Math.abs(coords[i][1] - location[0]) < 0.0000011;
      // Valhalla OSRM intersection indexes restart at zero for each leg. Prefer this explicit
      // position over coordinate-only lookup, which is ambiguous on loops or repeated vertices.
      const localIndex = step.intersections?.[0]?.geometry_index;
      let shapeIndex: number;
      if (localIndex !== undefined) {
        if (!Number.isInteger(localIndex) || localIndex < 0) return [];
        shapeIndex = legOffset + localIndex;
      } else {
        shapeIndex = coords.findIndex((_, i) => i >= cursor && matches(i));
        // Without an explicit index, a positive-distance loop ending at its start is ambiguous.
        if (shapeIndex === cursor && stepIndex > 0 && (leg.steps[stepIndex - 1].distance ?? 0) > 1) return [];
      }
      if (shapeIndex < cursor || !matches(shapeIndex)) return [];
      // Separate snapped leg endpoints would create a gap in spoken guidance. Keep the map
      // route available, but withhold navigation rather than claiming that gap is traversable.
      if (stepIndex === 0 && shapeIndex !== legOffset) return [];
      cursor = shapeIndex;
      maneuvers.push({ instruction, coordinate: coords[shapeIndex], shapeIndex,
        routeDistanceM: cumulative[shapeIndex], distanceM: step.distance, legIndex, type: step.maneuver?.type });
    }
  }
  if (cursor !== coords.length - 1) return [];
  return maneuvers;
}

async function valhalla(points: Point[], type: 'wheelchair' | 'foot', exclusions: ExclusionRing[] = []): Promise<DirectedRoute> {
  const res = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, 'X-Client-Id': 'accessogo.xyxzwb.chatgpt.site' },
    body: JSON.stringify({
      // break forces arrival/departure directions and a leg for every user-selected stop.
      locations: points.map(({ lat, lng }) => ({ lat, lon: lng, type: 'break' })),
      costing: 'pedestrian',
      ...(exclusions.length ? { exclude_polygons: exclusions } : {}),
      // Valhalla penalizes steps rather than excluding them; existing OSM analysis still warns about steps.
      costing_options: { pedestrian: type === 'wheelchair' ? { type, step_penalty: 43_200 } : { type } },
      format: 'osrm', shape_format: 'geojson', language: 'it-IT', units: 'kilometers',
      directions_type: 'instructions',
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new HttpError(503, 'Servizio di routing per sedia a rotelle non raggiungibile.'); });
  if (res.status === 429) throw new HttpError(503, 'Troppe richieste al servizio di routing per sedia a rotelle.');
  const json = await res.json().catch(() => null) as OsrmResponse | null;
  if (json?.code === 'NoRoute') throw new HttpError(404, type === 'wheelchair' ? NO_WHEELCHAIR_ROUTE : 'Nessun percorso trovato tra questi punti.');
  const r = json?.code === 'Ok' ? json.routes?.[0] : undefined;
  if (!res.ok || !r) throw new HttpError(502, 'Il servizio di routing per sedia a rotelle ha restituito un errore.');
  const coords = osrmGeometry(r, points);
  return {
    mode: type, provider: 'valhalla', coords, distanceM: r.distance!,
    durationS: finiteDistance(r.duration) ? r.duration : null,
    waypoints: waypoints(points), maneuvers: osrmManeuvers(r, coords),
  };
}

async function osrmFoot(points: Point[]): Promise<DirectedRoute> {
  const locations = points.map(({ lng, lat }) => `${lng},${lat}`).join(';');
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${locations}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    .catch(() => { throw new HttpError(503, 'Servizio di routing non raggiungibile. Controlla la connessione e riprova.'); });
  if (res.status === 429) throw new HttpError(503, 'Troppe richieste al servizio di routing. Riprova tra poco.');
  const json = await res.json().catch(() => null) as OsrmResponse | null;
  if (!res.ok || !json) throw new HttpError(502, 'Il servizio di routing ha restituito un errore.');
  if (json.code !== 'Ok' || !json.routes?.[0]) throw new HttpError(404, 'Nessun percorso trovato tra questi punti.');
  const r = json.routes[0];
  return {
    mode: 'foot_fallback', provider: 'osrm-fossgis', coords: osrmGeometry(r, points), distanceM: r.distance!,
    // OSRM walking duration is not a wheelchair estimate; fallback does not offer live voice navigation.
    durationS: null, waypoints: waypoints(points), maneuvers: [],
  };
}
