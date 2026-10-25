// Geometria della "Living Line": punti lungo un percorso e diramazioni prese da strade OSM reali.
// Le diramazioni sono solo animazione: strade che partono dal percorso, non itinerari calcolati.
import { distToLine, projector, type XY } from '../../shared/geo.ts';
import type { LatLngTuple, OsmFeature } from '../../shared/types.ts';

/** Distanze cumulate in metri lungo una linea. */
export function cumulative(coords: LatLngTuple[]): number[] {
  if (!coords.length) return [];
  const xy = projector(coords[0][0]);
  const pts = coords.map(xy);
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
}

/** Punto a frazione t (0..1) della lunghezza, interpolato sulla geometria e non in linea retta. */
export function pointAt(coords: LatLngTuple[], cum: number[], t: number): LatLngTuple {
  if (coords.length < 2) return coords[0];
  const target = Math.max(0, Math.min(1, t)) * cum[cum.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const span = cum[i] - cum[i - 1] || 1;
  const k = (target - cum[i - 1]) / span;
  const [a, b] = [coords[i - 1], coords[i]];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/** Taglia una linea (in metri, coordinate proiettate) alla lunghezza massima. */
function cut(line: XY[], maxM: number): XY[] {
  const out: XY[] = [line[0]];
  let done = 0;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (done + len >= maxM) {
      const k = (maxM - done) / (len || 1);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
      return out;
    }
    out.push(b);
    done += len;
  }
  return out;
}

export interface BranchOptions {
  /** Frazione del percorso da cui partono le diramazioni */
  at?: number;
  /** Distanza massima (m) tra il punto e la strada candidata */
  nearM?: number;
  /** Lunghezza massima di ogni diramazione (m) */
  maxM?: number;
  /** Quanto deve allontanarsi dal percorso la fine della diramazione (m) */
  awayM?: number;
  max?: number;
}

/**
 * Fino a `max` tratti di strade OSM che partono vicino al punto `at` del percorso e se ne allontanano,
 * in direzioni diverse tra loro. Restituisce [] se nei dati non ci sono strade adatte.
 */
export function branchesFrom(route: LatLngTuple[], features: OsmFeature[], o: BranchOptions = {}): LatLngTuple[][] {
  const { at = 0.45, nearM = 18, maxM = 90, awayM = 20, max = 3 } = o;
  if (route.length < 2) return [];
  const lat0 = route[0][0];
  const xy = projector(lat0);
  const toLatLng = ([x, y]: XY): LatLngTuple => [y / 110_540, x / (Math.cos((lat0 * Math.PI) / 180) * 111_320)];
  const routeXY = route.map(xy);
  const origin = xy(pointAt(route, cumulative(route), at));

  const candidates: { line: XY[]; away: number; bearing: number }[] = [];
  for (const f of features) {
    if (f.geometry.type !== 'line') continue;
    const pts = f.geometry.coords.map(xy);
    let k = -1, best = nearM;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - origin[0], p[1] - origin[1]); if (d <= best) { best = d; k = i; } });
    if (k < 0) continue;
    for (const side of [pts.slice(k), pts.slice(0, k + 1).reverse()]) {
      if (side.length < 2) continue;
      const line = cut([origin, ...side], maxM);
      const end = line[line.length - 1];
      const away = distToLine(end, routeXY);
      if (away < awayM) continue; // corre lungo il percorso: non è una possibilità diversa
      candidates.push({ line, away, bearing: Math.atan2(end[1] - origin[1], end[0] - origin[0]) });
    }
  }
  candidates.sort((a, b) => b.away - a.away);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    const distinct = chosen.every((d) => {
      const diff = Math.abs(((c.bearing - d.bearing + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      return diff >= (40 * Math.PI) / 180;
    });
    if (distinct) chosen.push(c);
    if (chosen.length === max) break;
  }
  return chosen.map((c) => c.line.map(toLatLng));
}

/** Il punto del percorso (tra il 35% e il 70%) da cui partono più strade reali: lì la linea "esita". */
export function bestFork(route: LatLngTuple[], features: OsmFeature[]): { at: number; branches: LatLngTuple[][] } {
  let best = { at: 0.45, branches: [] as LatLngTuple[][] };
  for (let at = 0.35; at <= 0.701; at += 0.05) {
    const branches = branchesFrom(route, features, { at, nearM: 22, awayM: 15, maxM: 110 });
    if (branches.length > best.branches.length) best = { at, branches };
  }
  return best;
}
