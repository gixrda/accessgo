import type { LatLngTuple, RouteResult } from '../../shared/types.ts';
import { distanceMeters, routeDistances, type RouteManeuver } from '../../shared/navigation.ts';

export type NavigationRoute = Pick<RouteResult, 'coords' | 'distanceM' | 'mode' | 'safety'> & { maneuvers?: RouteManeuver[] };
export interface NavigationGeometry { coords: LatLngTuple[]; cumulative: number[]; totalM: number }
export interface PositionFix { coordinate: LatLngTuple; accuracyM: number; timestamp: number }
export interface NavigationProgress { distanceM: number; segmentIndex: number; timestamp: number }
export type ProjectionResult =
  | { status: 'ready'; progress: NavigationProgress; offRouteM: number }
  | { status: 'stale' | 'imprecise' | 'off-route' | 'start' | 'jump'; message: string };

export function navigationGeometry(coords: LatLngTuple[]): NavigationGeometry | null {
  if (coords.length < 2 || coords.some(([lat, lng]) => !Number.isFinite(lat) || !Number.isFinite(lng))) return null;
  const cumulative = routeDistances(coords);
  const totalM = cumulative.at(-1) ?? 0;
  return totalM > 1 ? { coords, cumulative, totalM } : null;
}

export function navigationBlocked(route: Pick<RouteResult, 'safety'>): boolean {
  return route.safety?.status === 'blocked' || route.safety?.status === 'unavailable';
}

export function usableManeuvers(route: NavigationRoute): RouteManeuver[] {
  if (navigationBlocked(route)) return [];
  if (route.mode !== 'wheelchair') return [];
  const geometry = navigationGeometry(route.coords);
  if (!geometry || !route.maneuvers?.length) return [];
  let previous = -1;
  for (const item of route.maneuvers) {
    if (!item.instruction?.trim() || !Number.isFinite(item.routeDistanceM)
      || item.routeDistanceM < 0 || item.routeDistanceM < previous || item.routeDistanceM > geometry.totalM + 5
      || !Number.isInteger(item.shapeIndex) || item.shapeIndex < 0 || item.shapeIndex >= route.coords.length
      || !item.coordinate?.every(Number.isFinite) || !Number.isInteger(item.legIndex) || item.legIndex < 0
      || Math.abs(item.routeDistanceM - geometry.cumulative[item.shapeIndex]) > 5
      || distanceMeters(item.coordinate, route.coords[item.shapeIndex]) > 10) return [];
    previous = item.routeDistanceM;
  }
  return route.maneuvers;
}

/** Pisa-scale projection in metres. Progress is bounded to nearby route segments to avoid loop jumps. */
export function projectNavigationPosition(
  geometry: NavigationGeometry, fix: PositionFix, previous: NavigationProgress | null, now = Date.now(),
): ProjectionResult {
  if (!Number.isFinite(fix.timestamp) || now - fix.timestamp > 15_000 || fix.timestamp > now + 5_000
    || (previous && fix.timestamp <= previous.timestamp)) {
    return { status: 'stale', message: 'Posizione GPS non aggiornata. Indicazioni in attesa.' };
  }
  if (!Number.isFinite(fix.accuracyM) || fix.accuracyM < 0 || fix.accuracyM > 35
    || fix.coordinate.some((value) => !Number.isFinite(value))) {
    return { status: 'imprecise', message: 'GPS poco preciso. Attendo una posizione migliore prima di dare indicazioni.' };
  }
  if (!previous && distanceMeters(fix.coordinate, geometry.coords[0]) > 45) {
    return { status: 'start', message: 'Raggiungi la partenza per avviare le indicazioni, oppure ricalcola dalla tua posizione.' };
  }
  const elapsedS = previous ? Math.min(30, (fix.timestamp - previous.timestamp) / 1000) : 0;
  const lowerM = previous ? Math.max(0, previous.distanceM - 25) : 0;
  const upperM = previous
    ? previous.distanceM + Math.max(40, elapsedS * 3 + fix.accuracyM)
    : Math.min(75, geometry.totalM);
  const [lat, lng] = fix.coordinate;
  const metersLat = Math.PI * 6_371_000 / 180;
  const metersLng = metersLat * Math.cos(lat * Math.PI / 180);
  let best: { distanceM: number; segmentIndex: number; offRouteM: number } | null = null;
  // Scan only a bounded distance window; crossing the same street twice cannot jump to a remote leg.
  for (let index = Math.max(0, (previous?.segmentIndex ?? 0) - 12); index < geometry.coords.length - 1; index++) {
    if (geometry.cumulative[index + 1] < lowerM) continue;
    if (geometry.cumulative[index] > upperM) break;
    const [aLat, aLng] = geometry.coords[index];
    const [bLat, bLng] = geometry.coords[index + 1];
    const ax = (aLng - lng) * metersLng, ay = (aLat - lat) * metersLat;
    const dx = (bLng - aLng) * metersLng, dy = (bLat - aLat) * metersLat;
    const denom = dx * dx + dy * dy;
    const t = denom ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom)) : 0;
    const distanceM = geometry.cumulative[index] + t * (geometry.cumulative[index + 1] - geometry.cumulative[index]);
    if (distanceM < lowerM || distanceM > upperM) continue;
    const offRouteM = Math.hypot(ax + t * dx, ay + t * dy);
    if (!best || offRouteM < best.offRouteM - 3
      || (Math.abs(offRouteM - best.offRouteM) <= 3 && distanceM < best.distanceM)) {
      best = { distanceM, segmentIndex: index, offRouteM };
    }
  }
  if (!best || best.offRouteM > Math.max(25, Math.min(45, fix.accuracyM * 1.5))) {
    return { status: 'off-route', message: 'Sei fuori percorso o il GPS è instabile. Fermati e ricalcola il percorso quando necessario.' };
  }
  if (previous && best.distanceM < previous.distanceM - 20) {
    return { status: 'jump', message: 'La posizione non segue il percorso. Controlla la mappa o ricalcola dalla tua posizione.' };
  }
  return {
    status: 'ready', offRouteM: best.offRouteM,
    progress: {
      distanceM: Math.max(previous?.distanceM ?? 0, best.distanceM),
      segmentIndex: Math.max(previous?.segmentIndex ?? 0, best.segmentIndex), timestamp: fix.timestamp,
    },
  };
}

export function nextManeuver(maneuvers: RouteManeuver[], progressM: number, completed: Set<number>) {
  const index = maneuvers.findIndex((step, index) => !completed.has(index) && step.routeDistanceM >= progressM - 15);
  return index < 0 ? null : { index, maneuver: maneuvers[index], distanceM: Math.max(0, maneuvers[index].routeDistanceM - progressM) };
}

export function distanceInstruction(instruction: string, distanceM: number): string {
  return distanceM > 25 ? `Tra circa ${Math.max(10, Math.round(distanceM / 10) * 10)} metri: ${instruction}` : instruction;
}

export function maneuverInstruction(maneuvers: RouteManeuver[], index: number): string {
  const step = maneuvers[index];
  if (step.type === 'arrive' && index < maneuvers.length - 1) {
    return `Tappa ${String.fromCharCode(66 + step.legIndex)}: ${step.instruction} Il percorso continua con la tappa successiva.`;
  }
  return step.instruction;
}
