import type { LatLngTuple, OsmFeature, Report, RouteObstacle } from '../shared/types.ts';

export interface RoutingSafetyContext {
  features: OsmFeature[];
  reports: Report[];
  reportsAvailable: boolean;
}
export interface TrustedBlocker {
  obstacle: RouteObstacle;
  coords: LatLngTuple[];
  radiusM: number;
}
export type ExclusionRing = [number, number][];
const EARTH = 111_320;
const coordinate = (p: LatLngTuple) => p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

/** Explicit path prohibitions only. Positive accessibility/ramp tags prevent steps/kerb exclusions.
 * Verified reports must also have a user-selected blocking category: AI severity is never authority.
 */
export function trustedBlockers(context: RoutingSafetyContext): TrustedBlocker[] {
  const seen = new Set<string>();
  const blockers: TrustedBlocker[] = [];
  for (const f of context.features) {
    const t = f.tags;
    const accessible = ['yes', 'designated'].includes(t.wheelchair) || ['yes', 'designated'].includes(t['ramp:wheelchair']);
    const blocking = t.wheelchair === 'no' || (!accessible && (t.highway === 'steps' || t.kerb === 'raised'));
    if (f.scope !== 'path' || !blocking || seen.has(f.id)) continue;
    const coords = f.geometry.type === 'point' ? [f.geometry.coords] : f.geometry.coords;
    if (!coords.length || !coords.every(coordinate)) continue;
    seen.add(f.id);
    blockers.push({ obstacle: { id: f.id, source: 'osm', label: f.name ? `${f.label} · ${f.name}` : f.label,
      coordinate: coords[0] }, coords, radiusM: 7 });
  }
  if (context.reportsAvailable) for (const report of context.reports) {
    if (report.status !== 'verified' || report.categorySource !== 'user'
      || !['steps', 'obstructed_sidewalk'].includes(report.category)) continue;
    const point: LatLngTuple = [report.lat, report.lng];
    if (!coordinate(point)) continue;
    blockers.push({ obstacle: { id: report.id, source: 'verified_report',
      label: report.category === 'steps' ? 'Gradini segnalati e verificati' : 'Passaggio ostruito segnalato e verificato',
      coordinate: point }, coords: [point], radiusM: 10 });
  }
  return blockers;
}

type XY = [number, number];
function project(p: LatLngTuple, origin: LatLngTuple): XY {
  return [(p[1] - origin[1]) * EARTH * Math.cos(origin[0] * Math.PI / 180), (p[0] - origin[0]) * EARTH];
}
function pointSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const squared = dx * dx + dy * dy;
  const t = squared ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / squared)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function cross(a: XY, b: XY, c: XY) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function segmentDistance(a: XY, b: XY, c: XY, d: XY): number {
  const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
  // Strict crossing; touching and collinear overlap are covered by endpoint distances below.
  if (ac * ad < 0 && ca * cb < 0) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}
function pairs(coords: LatLngTuple[]): [LatLngTuple, LatLngTuple][] {
  return coords.length === 1 ? [[coords[0], coords[0]]] : coords.slice(1).map((p, i) => [coords[i], p]);
}
export function intersectingBlockers(route: LatLngTuple[], blockers: TrustedBlocker[]): TrustedBlocker[] {
  if (!route.length) return [];
  return blockers.filter(blocker => {
    const origin = blocker.coords[0];
    const edges = pairs(blocker.coords).map(([a, b]) => [project(a, origin), project(b, origin)] as [XY, XY]);
    return pairs(route).some(([a, b]) => edges.some(([c, d]) => segmentDistance(project(a, origin), project(b, origin), c, d) <= blocker.radiusM));
  });
}

/** Rectangular segment buffers in metres, with end padding. No guessed detour coordinates.
 * Rings use provider order [longitude, latitude]; the route is rechecked after every response.
 */
export function exclusionRings(blockers: TrustedBlocker[]): ExclusionRing[] {
  return blockers.flatMap(blocker => pairs(blocker.coords).map(([a, b]) => {
    const [dx, dy] = project(b, a), length = Math.hypot(dx, dy);
    const ux = length ? dx / length : 1, uy = length ? dy / length : 0;
    const r = blocker.radiusM + 2;
    const raw: XY[] = [
      [-ux * r - uy * r, -uy * r + ux * r], [dx + ux * r - uy * r, dy + uy * r + ux * r],
      [dx + ux * r + uy * r, dy + uy * r - ux * r], [-ux * r + uy * r, -uy * r - ux * r],
    ];
    const ring: ExclusionRing = raw.map(([x, y]) => [a[1] + x / (EARTH * Math.cos(a[0] * Math.PI / 180)), a[0] + y / EARTH]);
    ring.push(ring[0]);
    return ring;
  }));
}
