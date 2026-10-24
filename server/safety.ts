import type { LatLngTuple, RouteResult, RouteSafety, SafetySegment } from '../shared/types.ts';
import { HttpError, USER_AGENT } from './errors.ts';

/**
 * Verifica dei tratti di un percorso, indipendente dal servizio che l'ha calcolato.
 * Valhalla /trace_attributes associa la geometria alla rete OSM e restituisce, per ogni tratto, tipo d'uso,
 * classe stradale e presenza di marciapiede. I divieti di accesso (foot=no, access=no, autostrade) sono già
 * esclusi dal router: qui si riconoscono i tratti in carreggiata e quelli pericolosi per scegliere tra le alternative.
 */

type Edge = {
  use?: string; road_class?: string; sidewalk?: string; length?: number; names?: string[];
  begin_shape_index?: number; end_shape_index?: number;
};

// Infrastruttura separata dal traffico (o zone residenziali a priorità pedonale: living_street).
const PEDESTRIAN_USES = new Set([
  'footway', 'sidewalk', 'pedestrian', 'path', 'pedestrian_crossing', 'living_street', 'elevator', 'cycleway', 'track', 'bridleway',
]);
const STEP_USES = new Set(['steps', 'escalator']);
// Senza marciapiede mappato, camminare su queste strade è un pericolo identificabile: il percorso viene scartato.
const MAIN_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
// Il primo e l'ultimo tratto collegano il punto scelto sulla mappa alla rete: se brevi non indicano un cammino in carreggiata.
const ACCESS_M = 20;
// Frammenti più corti sono rumore dell'aggancio della geometria alla rete, non tratti percorsi.
const NOISE_M = 3;
// Si accettano fino a 2 m di percorso in più per ogni metro di carreggiata senza marciapiede evitato.
const DETOUR_PER_CARRIAGEWAY_M = 2;

export const NOT_VERIFIABLE = 'Non è stato possibile trovare un percorso sufficientemente verificabile. Controlla la mappa prima di proseguire.';

export function decodePolyline6(str: string): LatLngTuple[] {
  const out: LatLngTuple[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}

export function classifyEdges(edges: Edge[], shape: LatLngTuple[]): RouteSafety {
  let pedestrianM = 0, sidewalkM = 0, carriagewayM = 0;
  const segments: (SafetySegment & { endIndex?: number })[] = [];
  edges.forEach((e, i) => {
    const m = (e.length ?? 0) * 1000;
    const use = e.use ?? 'other';
    let kind: SafetySegment['kind'] | null = null;
    if (STEP_USES.has(use)) kind = 'steps';
    else if (PEDESTRIAN_USES.has(use)) pedestrianM += m;
    else if (e.sidewalk && e.sidewalk !== 'none') sidewalkM += m;
    else if (((i === 0 || i === edges.length - 1) && m < ACCESS_M) || m < NOISE_M) pedestrianM += m;
    else kind = MAIN_ROADS.has(e.road_class ?? '') ? 'main_road' : 'carriageway';
    if (!kind) return;
    if (kind !== 'steps') carriagewayM += m;
    const coords = shape.slice(e.begin_shape_index ?? 0, (e.end_shape_index ?? 0) + 1);
    const name = e.names?.[0];
    const last = segments.at(-1);
    // Tratti consecutivi dello stesso tipo e della stessa via diventano un unico segmento.
    if (last && last.kind === kind && last.name === name && last.endIndex === e.begin_shape_index) {
      last.lengthM += m;
      last.coords.push(...coords.slice(1));
      last.endIndex = e.end_shape_index;
    } else {
      segments.push({ kind, lengthM: m, ...(name ? { name } : {}), coords, endIndex: e.end_shape_index });
    }
  });
  const hasHazard = segments.some((s) => s.kind !== 'carriageway');
  return {
    checked: true,
    pedestrianM: Math.round(pedestrianM), sidewalkM: Math.round(sidewalkM), carriagewayM: Math.round(carriagewayM),
    segments: segments.map(({ endIndex: _, ...s }) => ({ ...s, lengthM: Math.round(s.lengthM) })),
    verifiable: carriagewayM === 0 && !hasHazard,
    alternatives: 1,
  };
}

/** Classifica i tratti di un percorso. Restituisce null se la verifica non è disponibile. */
export async function assessRoute(coords: LatLngTuple[], wheelchair: boolean): Promise<RouteSafety | null> {
  try {
    const res = await fetch('https://valhalla1.openstreetmap.de/trace_attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({
        shape: coords.map(([lat, lon]) => ({ lat, lon })),
        shape_match: 'walk_or_snap',
        costing: 'pedestrian',
        costing_options: { pedestrian: { type: wheelchair ? 'wheelchair' : 'foot' } },
        filters: {
          attributes: ['shape', 'edge.use', 'edge.road_class', 'edge.sidewalk', 'edge.length', 'edge.names', 'edge.begin_shape_index', 'edge.end_shape_index'],
          action: 'include',
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { edges?: Edge[]; shape?: string };
    if (!json.edges?.length || typeof json.shape !== 'string') return null;
    return classifyEdges(json.edges, decodePolyline6(json.shape));
  } catch {
    return null;
  }
}

const rounded = (m: number) => `${Math.round(m / 10) * 10 || Math.round(m)} m`;

/**
 * Sceglie tra percorsi alternativi quello più verificabile.
 * Scarta i percorsi su strade principali senza marciapiede e, per la sedia a rotelle, quelli con scale.
 * Se la verifica non è disponibile restituisce il primo percorso marcato come non verificato.
 */
export async function chooseSafest(candidates: RouteResult[], wheelchair: boolean): Promise<RouteResult> {
  const assessed = await Promise.all(candidates.map(async (route) => ({ route, safety: await assessRoute(route.coords, wheelchair) })));
  const checked = assessed.filter((a): a is { route: RouteResult; safety: RouteSafety } => a.safety !== null);
  if (!checked.length) {
    return {
      ...candidates[0],
      safety: { checked: false, pedestrianM: 0, sidewalkM: 0, carriagewayM: 0, segments: [], verifiable: false, alternatives: candidates.length },
    };
  }
  const rejected = (s: RouteSafety) => s.segments.some((x) => x.kind === 'main_road' || (wheelchair && x.kind === 'steps'));
  const ok = checked.filter((a) => !rejected(a.safety));
  if (!ok.length) {
    throw new HttpError(422, `${NOT_VERIFIABLE} Tutte le alternative trovate (${checked.length}) passano su strade principali senza marciapiede mappato${wheelchair ? ' o su scale' : ''}.`);
  }
  const minDist = Math.min(...ok.map((a) => a.route.distanceM));
  const score = (a: (typeof ok)[number]) => a.safety.carriagewayM + (a.route.distanceM - minDist) / DETOUR_PER_CARRIAGEWAY_M;
  const best = ok.reduce((x, y) => (score(y) < score(x) ? y : x));
  const first = checked[0];
  let choice: string | undefined;
  if (checked.length > 1) {
    if (best === first) {
      choice = `È il più verificabile tra ${checked.length} alternative calcolate.`;
    } else {
      const why = rejected(first.safety)
        ? `il percorso più diretto passa ${first.safety.segments.some((s) => s.kind === 'main_road') ? 'su una strada principale senza marciapiede mappato' : 'su scale'}`
        : `evita ${rounded(first.safety.carriagewayM - best.safety.carriagewayM)} su carreggiata senza marciapiede mappato`;
      const extra = best.route.distanceM - first.route.distanceM;
      choice = `Preferito tra ${checked.length} alternative: ${why}${extra > 10 ? ` (${rounded(extra)} in più)` : ''}.`;
    }
  }
  return { ...best.route, safety: { ...best.safety, alternatives: checked.length, ...(choice ? { choice } : {}) } };
}
