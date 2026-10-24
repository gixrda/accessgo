import type { LatLngTuple, OsmFeature, Report } from '../../shared/types.ts';
import type { RouteAnalysis } from './analysis.ts';

export type MapScope = 'route' | 'all';
export type MapSelection = { type: 'feature'; feature: OsmFeature } | { type: 'report'; report: Report } | null;

/** Keep analysis inputs untouched; only this presentation subset changes. */
export function scopedMapData(features: OsmFeature[], reports: Report[], analysis: RouteAnalysis | null, scope: MapScope) {
  if (scope === 'all') return { features, reports };
  if (!analysis) return { features: [], reports: [] };
  return {
    features: [...analysis.known, ...analysis.possible, ...analysis.unknown, ...analysis.positive],
    reports: analysis.reports,
  };
}

/** A deliberately selected comparison item may be shown alone outside the main route. */
export function withMapSelection(data: { features: OsmFeature[]; reports: Report[] }, selection: MapSelection) {
  if (selection?.type === 'feature' && !data.features.some((feature) => feature.id === selection.feature.id)) {
    return { ...data, features: [...data.features, selection.feature] };
  }
  if (selection?.type === 'report' && !data.reports.some((report) => report.id === selection.report.id)) {
    return { ...data, reports: [...data.reports, selection.report] };
  }
  return data;
}

export function selectionIsOutsideRoute(selection: MapSelection, analysis: RouteAnalysis | null): boolean {
  if (!selection || !analysis) return false;
  const data = scopedMapData([], [], analysis, 'route');
  return selection.type === 'feature'
    ? !data.features.some((feature) => feature.id === selection.feature.id)
    : !data.reports.some((report) => report.id === selection.report.id);
}

type XY = [number, number];
type Interval = [number, number];
const EPSILON = 1e-9;

function intersectRange(interval: Interval, start: number, delta: number, min: number, max: number): Interval | null {
  if (Math.abs(delta) < EPSILON) return start >= min - EPSILON && start <= max + EPSILON ? interval : null;
  const a = (min - start) / delta, b = (max - start) / delta;
  const lo = Math.max(interval[0], Math.min(a, b)), hi = Math.min(interval[1], Math.max(a, b));
  return hi - lo > EPSILON ? [lo, hi] : null;
}

function circleInterval(a: XY, d: XY, center: XY, radius: number): Interval | null {
  const x = a[0] - center[0], y = a[1] - center[1];
  const aa = d[0] * d[0] + d[1] * d[1];
  if (aa < EPSILON) return null;
  const bb = 2 * (x * d[0] + y * d[1]);
  const cc = x * x + y * y - radius * radius;
  const discriminant = bb * bb - 4 * aa * cc;
  if (discriminant <= 0) return null; // a tangent alone has no visible length
  const root = Math.sqrt(discriminant);
  const lo = Math.max(0, (-bb - root) / (2 * aa));
  const hi = Math.min(1, (-bb + root) / (2 * aa));
  return hi - lo > EPSILON ? [lo, hi] : null;
}

/**
 * Clip an OSM line to the union of route-segment capsules in a local metre projection.
 * The 4 m radius matches analyzeRoute's LINE_M; membership still comes from analyzeRoute,
 * so an incidental crossing does not become an obstacle merely because it can be clipped.
 * Separate re-entries remain separate paths, never joined by a line across a distant area.
 * OSM source coordinates and the detail panel's original feature are not modified.
 */
export function clipLineToRoute(line: LatLngTuple[], route: LatLngTuple[], radiusM = 4): LatLngTuple[][] {
  if (line.length < 2 || route.length < 2 || radiusM <= 0) return [];
  const origin = route[0];
  const kx = Math.cos(origin[0] * Math.PI / 180) * 111_320;
  const project = ([lat, lng]: LatLngTuple): XY => [(lng - origin[1]) * kx, (lat - origin[0]) * 110_540];
  const routeXY = route.map(project);
  const pieces: LatLngTuple[][] = [];
  for (let i = 1; i < line.length; i++) {
    const a = project(line[i - 1]), b = project(line[i]);
    const d: XY = [b[0] - a[0], b[1] - a[1]];
    if (Math.hypot(...d) < EPSILON) continue;
    const intervals: Interval[] = [];
    for (let j = 1; j < routeXY.length; j++) {
      const p = routeXY[j - 1], q = routeXY[j];
      const dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy);
      for (const center of [p, q]) {
        const circle = circleInterval(a, d, center, radiusM);
        if (circle) intervals.push(circle);
      }
      if (length < EPSILON) continue;
      const ux = dx / length, uy = dy / length;
      const x = a[0] - p[0], y = a[1] - p[1];
      const longitudinal = intersectRange([0, 1], x * ux + y * uy, d[0] * ux + d[1] * uy, 0, length);
      const rectangle = longitudinal && intersectRange(longitudinal, -x * uy + y * ux, -d[0] * uy + d[1] * ux, -radiusM, radiusM);
      if (rectangle) intervals.push(rectangle);
    }
    intervals.sort((left, right) => left[0] - right[0]);
    const merged: Interval[] = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1] + EPSILON) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    const at = (t: number): LatLngTuple => [
      line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t,
      line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t,
    ];
    for (const [lo, hi] of merged) {
      const start = at(lo), end = at(hi);
      const previous = pieces.at(-1), tail = previous?.at(-1);
      if (previous && tail && Math.abs(start[0] - tail[0]) < 1e-10 && Math.abs(start[1] - tail[1]) < 1e-10) previous.push(end);
      else pieces.push([start, end]);
    }
  }
  return pieces;
}
