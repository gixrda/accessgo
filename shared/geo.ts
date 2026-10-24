import type { LatLngTuple } from './types.ts';

export type XY = [number, number];

/** Proiezione equirettangolare locale in metri: sufficiente per un'area di pochi km. */
export function projector(lat0: number) {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320;
  return ([lat, lng]: LatLngTuple): XY => [lng * kx, lat * 110_540];
}

export function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function distToLine(p: XY, line: XY[]): number {
  if (line.length === 1) return Math.hypot(p[0] - line[0][0], p[1] - line[0][1]);
  let min = Infinity;
  for (let i = 1; i < line.length; i++) min = Math.min(min, distToSegment(p, line[i - 1], line[i]));
  return min;
}

/** Distanza in metri tra un punto e la linea di un percorso (non confronta stringhe di coordinate). */
export function distanceToRoute(route: LatLngTuple[], p: LatLngTuple): number {
  if (!route.length) return Infinity;
  const xy = projector(route[0][0]);
  return distToLine(xy(p), route.map(xy));
}
