import type { Certainty, FeatureKind, LatLngTuple, OsmFeature } from '../shared/types.ts';

export function overpassQuery([s, w, n, e]: [number, number, number, number]): string {
  const b = `${s},${w},${n},${e}`;
  return `[out:json][timeout:60];
(
  way["highway"~"^(footway|pedestrian|path|steps)$"](${b});
  way["sidewalk"](${b});
  node["kerb"](${b});
  node["highway"="crossing"](${b});
  node["barrier"](${b});
  nwr["wheelchair"](${b});
);
out tags geom;`;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

const KEPT_TAGS = [
  'highway', 'kerb', 'kerb:height', 'barrier', 'surface', 'smoothness', 'incline', 'width',
  'wheelchair', 'step_count', 'ramp:wheelchair', 'handrail', 'tactile_paving', 'crossing',
  'name', 'amenity', 'shop', 'tourism',
];
const ROUGH_SURFACES = new Set([
  'sett', 'cobblestone', 'unhewn_cobblestone', 'pebblestone', 'gravel', 'dirt', 'grass',
  'sand', 'ground', 'mud', 'earth', 'woodchips', 'rock', 'stepping_stones',
]);
const BAD_SMOOTHNESS = new Set(['bad', 'very_bad', 'horrible', 'very_horrible']);
const BLOCKING_BARRIERS = new Set(['stile', 'turnstile', 'kissing_gate', 'full-height_turnstile']);
const PASSAGE_BARRIERS = new Set([
  'bollard', 'gate', 'lift_gate', 'block', 'cycle_barrier', 'chain', 'swing_gate', 'sliding_gate', 'kerb',
]);
const SURFACE_IT: Record<string, string> = {
  sett: 'lastricato a blocchi', cobblestone: 'acciottolato', unhewn_cobblestone: 'acciottolato',
  pebblestone: 'ghiaia/ciottoli', gravel: 'ghiaia', dirt: 'sterrato', grass: 'erba', sand: 'sabbia',
  ground: 'terra', mud: 'fango', earth: 'terra', woodchips: 'trucioli', rock: 'roccia',
  stepping_stones: 'pietre a passo',
};
const BARRIER_IT: Record<string, string> = {
  bollard: 'dissuasore', gate: 'cancello', lift_gate: 'sbarra', block: 'blocco', cycle_barrier: 'barriera anti-bici',
  chain: 'catena', swing_gate: 'cancello', sliding_gate: 'cancello scorrevole', stile: 'scaletta',
  turnstile: 'tornello', kissing_gate: 'cancelletto a labirinto', 'full-height_turnstile': 'tornello',
};

/** Pendenza in % se numerica ("8%", "-5%"), null se non numerica ("up", "down", "yes"). */
function inclinePercent(v: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(v.trim());
  return m ? Math.abs(Number(m[1])) : null;
}

/** Larghezza in metri se espressa in metri (es. "1.2", "1.2 m"), altrimenti null. */
function widthMeters(v: string): number | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*m?$/.exec(v.trim());
  return m ? Number(m[1].replace(',', '.')) : null;
}

type Classified = { kind: FeatureKind; certainty: Certainty; label: string };

/** Regole in ordine di gravità: vince la prima che corrisponde. Restituisce null se non c'è nulla di rilevante. */
export function classifyPath(t: Record<string, string>): Classified | null {
  if (t.highway === 'steps') {
    const ramp = t['ramp:wheelchair'] === 'yes';
    const n = t.step_count ? ` (${t.step_count} gradini)` : '';
    return ramp
      ? { kind: 'steps', certainty: 'possible_issue', label: `Scale con rampa per sedia a rotelle mappata${n}` }
      : { kind: 'steps', certainty: 'known_obstacle', label: `Scale${n}` };
  }
  if (t.wheelchair === 'no') return { kind: 'wheelchair', certainty: 'known_obstacle', label: 'Indicato come non percorribile in sedia a rotelle' };
  if (t.smoothness === 'impassable') return { kind: 'smoothness', certainty: 'known_obstacle', label: 'Superficie indicata come impraticabile' };
  if (t.barrier && BLOCKING_BARRIERS.has(t.barrier)) return { kind: 'barrier', certainty: 'known_obstacle', label: `Barriera: ${BARRIER_IT[t.barrier]}` };

  const kerbHeight = t['kerb:height'] ? Number.parseFloat(t['kerb:height']) : NaN;
  if (t.kerb === 'raised' || kerbHeight > 0.03) return { kind: 'kerb', certainty: 'known_obstacle', label: 'Cordolo rialzato' };

  const width = t.width ? widthMeters(t.width) : null;
  if (width !== null && width < 0.9) return { kind: 'width', certainty: 'known_obstacle', label: `Passaggio stretto (${width} m)` };

  if (t.kerb === 'rolled') return { kind: 'kerb', certainty: 'possible_issue', label: 'Cordolo smussato' };
  if (t.barrier && PASSAGE_BARRIERS.has(t.barrier) && !t.kerb) {
    return t.barrier === 'kerb'
      ? { kind: 'kerb', certainty: 'possible_issue', label: 'Cordolo (altezza non mappata)' }
      : { kind: 'barrier', certainty: 'possible_issue', label: `Barriera: ${BARRIER_IT[t.barrier]}` };
  }
  if (t.incline) {
    const p = inclinePercent(t.incline);
    if (p === null && t.incline !== '0') return { kind: 'incline', certainty: 'possible_issue', label: 'Pendenza (valore non mappato)' };
    if (p !== null && p > 6) return { kind: 'incline', certainty: 'possible_issue', label: `Pendenza ${p}%` };
  }
  if (t.smoothness && BAD_SMOOTHNESS.has(t.smoothness)) return { kind: 'smoothness', certainty: 'possible_issue', label: 'Superficie irregolare' };
  if (t.surface && ROUGH_SURFACES.has(t.surface)) return { kind: 'surface', certainty: 'possible_issue', label: `Superficie: ${SURFACE_IT[t.surface]}` };
  if (width !== null && width < 1.2) return { kind: 'width', certainty: 'possible_issue', label: `Passaggio stretto (${width} m)` };
  if (t.wheelchair === 'limited') return { kind: 'wheelchair', certainty: 'possible_issue', label: 'Accessibilità parziale in sedia a rotelle' };

  if (t.kerb === 'lowered' || t.kerb === 'flush' || t.kerb === 'no') return { kind: 'kerb', certainty: 'positive_info', label: 'Cordolo ribassato o a raso' };
  if (t.wheelchair === 'yes' || t.wheelchair === 'designated') return { kind: 'wheelchair', certainty: 'positive_info', label: 'Indicato come percorribile in sedia a rotelle' };

  if (t.highway === 'crossing') return { kind: 'crossing', certainty: 'info', label: 'Attraversamento (cordolo non mappato)' };
  if (t.surface || t.smoothness || t.incline || t.width) return { kind: 'surface', certainty: 'info', label: 'Dati sulla superficie disponibili' };
  return null;
}

function classifyPlace(t: Record<string, string>): Classified | null {
  if (t.wheelchair === 'no') return { kind: 'wheelchair', certainty: 'known_obstacle', label: 'Luogo indicato come non accessibile' };
  if (t.wheelchair === 'limited') return { kind: 'wheelchair', certainty: 'possible_issue', label: 'Luogo parzialmente accessibile' };
  if (t.wheelchair === 'yes' || t.wheelchair === 'designated') return { kind: 'wheelchair', certainty: 'positive_info', label: 'Luogo indicato come accessibile' };
  return null;
}

export function normalizeOverpass(elements: OverpassElement[]): OsmFeature[] {
  const out: OsmFeature[] = [];
  for (const el of elements) {
    const t = el.tags;
    if (!t || el.type === 'relation') continue;
    const isPath = Boolean(t.highway || t.kerb || t.barrier || t['kerb:height']);
    const c = isPath ? classifyPath(t) : classifyPlace(t);
    if (!c) continue;

    let geometry: OsmFeature['geometry'];
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      geometry = { type: 'point', coords: [el.lat, el.lon] };
    } else if (el.type === 'way' && el.geometry && el.geometry.length > 0) {
      const pts = el.geometry.map((g): LatLngTuple => [g.lat, g.lon]);
      // Un luogo (edificio, area) è mostrato come punto al centro della sua geometria.
      geometry = isPath
        ? { type: 'line', coords: pts }
        : { type: 'point', coords: [avg(pts.map((p) => p[0])), avg(pts.map((p) => p[1]))] };
    } else continue;

    const tags = Object.fromEntries(KEPT_TAGS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));
    out.push({
      id: `${el.type}/${el.id}`, source: 'osm', scope: isPath ? 'path' : 'place',
      ...c, ...(t.name ? { name: t.name } : {}), geometry, tags,
    });
  }
  return out;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
