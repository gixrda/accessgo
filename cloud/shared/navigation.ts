import type { LatLngTuple } from './types.ts';

/** Actual provider instruction, positioned on the complete ordered route. */
export interface RouteManeuver {
  instruction: string;
  coordinate: LatLngTuple;
  /** Cumulative meters along the returned polyline, not straight-line distance. */
  routeDistanceM: number;
  /** Index in RouteResult.coords, including preceding legs. */
  shapeIndex: number;
  /** Provider distance from this maneuver to the following maneuver. */
  distanceM: number;
  /** Zero-based leg, so an intermediate arrival is not the final destination. */
  legIndex: number;
  type?: string;
}

export function distanceMeters(a: LatLngTuple, b: LatLngTuple): number {
  const radians = Math.PI / 180;
  const dLat = (b[0] - a[0]) * radians;
  const dLng = (b[1] - a[1]) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function routeDistances(coords: LatLngTuple[]): number[] {
  const distances: number[] = [];
  for (let i = 0; i < coords.length; i++) {
    distances.push(i === 0 ? 0 : distances[i - 1] + distanceMeters(coords[i - 1], coords[i]));
  }
  return distances;
}
