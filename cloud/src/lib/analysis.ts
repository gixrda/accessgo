import type { LatLngTuple, OsmFeature, Report } from '../../shared/types.ts';

export interface RouteAnalysis {
  known: OsmFeature[];
  possible: OsmFeature[];
  positive: OsmFeature[];
  /** Elementi sul percorso senza dati sufficienti (es. attraversamenti con cordolo non mappato) */
  unknown: OsmFeature[];
  reports: Report[];
  /** Quota (0..1) del percorso vicina a tratti OSM con dati su superficie, pendenza, larghezza o accessibilità */
  coverage: number;
}

type XY = [number, number];

const POINT_M = 5; // distanza massima di un nodo (cordolo, barriera…) dal percorso
const LINE_M = 4; // distanza massima tra percorso e una via mappata per considerarla "percorsa"
const REPORT_M = 15; // le posizioni scelte dagli utenti sono meno precise
const STEP_M = 5; // passo di campionamento del percorso

/** Proiezione equirettangolare locale in metri: sufficiente per un'area di pochi km. */
function projector(lat0: number) {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320;
  return ([lat, lng]: LatLngTuple): XY => [lng * kx, lat * 110_540];
}

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function distToLine(p: XY, line: XY[]): number {
  if (line.length === 1) return Math.hypot(p[0] - line[0][0], p[1] - line[0][1]);
  let min = Infinity;
  for (let i = 1; i < line.length; i++) min = Math.min(min, distToSegment(p, line[i - 1], line[i]));
  return min;
}

function lineLength(line: XY[]): number {
  let len = 0;
  for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return len;
}

function sample(line: XY[], step: number): XY[] {
  const out: XY[] = line.length ? [line[0]] : [];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/**
 * Confronta un percorso con i dati OSM e le segnalazioni.
 * Una via mappata conta come "percorsa" solo se il percorso le resta vicino per almeno 15 m
 * (o metà della sua lunghezza, se più corta): così un sentiero che si limita a incrociare il percorso non viene contato.
 */
export function analyzeRoute(route: LatLngTuple[], features: OsmFeature[], reports: Report[]): RouteAnalysis {
  const empty: RouteAnalysis = { known: [], possible: [], positive: [], unknown: [], reports: [], coverage: 0 };
  if (route.length < 2) return empty;
  const xy = projector(route[0][0]);
  const routeXY = route.map(xy);
  const samples = sample(routeXY, STEP_M);
  const covered = new Array<boolean>(samples.length).fill(false);

  const xs = routeXY.map((p) => p[0]), ys = routeXY.map((p) => p[1]);
  const pad = REPORT_M + 1;
  const [minX, maxX, minY, maxY] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const outside = (pts: XY[]) => pts.every((p) => p[0] < minX || p[0] > maxX || p[1] < minY || p[1] > maxY);

  const result = { ...empty, known: [] as OsmFeature[], possible: [] as OsmFeature[], positive: [] as OsmFeature[], unknown: [] as OsmFeature[] };
  for (const f of features) {
    if (f.scope !== 'path') continue; // l'accessibilità di un negozio non è un ostacolo sul percorso
    let onRoute: boolean;
    if (f.geometry.type === 'point') {
      const p = xy(f.geometry.coords);
      if (outside([p])) continue;
      onRoute = distToLine(p, routeXY) <= POINT_M;
    } else {
      const line = f.geometry.coords.map(xy);
      const lx = line.map((p) => p[0]), ly = line.map((p) => p[1]);
      if (Math.max(...lx) < minX || Math.min(...lx) > maxX || Math.max(...ly) < minY || Math.min(...ly) > maxY) continue;
      const near: number[] = [];
      samples.forEach((s, i) => { if (distToLine(s, line) <= LINE_M) near.push(i); });
      // Un incrocio perpendicolare copre al massimo ~2 campioni (10 m): serve una sovrapposizione maggiore.
      onRoute = near.length * STEP_M >= Math.min(15, lineLength(line) / 2);
      if (onRoute) for (const i of near) covered[i] = true;
    }
    if (!onRoute) continue;
    if (f.certainty === 'known_obstacle') result.known.push(f);
    else if (f.certainty === 'possible_issue') result.possible.push(f);
    else if (f.certainty === 'positive_info') result.positive.push(f);
    else if (f.geometry.type === 'point') result.unknown.push(f);
  }
  result.reports = reports.filter((r) => r.status !== 'resolved' && distToLine(xy([r.lat, r.lng]), routeXY) <= REPORT_M);
  result.coverage = covered.filter(Boolean).length / samples.length;
  return result;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
