import { describe, expect, it } from 'vitest';
import type { LatLngTuple, OsmFeature, Report } from '../shared/types.ts';
import { analyzeRoute } from '../src/lib/analysis.ts';
import { clipLineToRoute, scopedMapData, selectionIsOutsideRoute, withMapSelection } from '../src/lib/mapScope.ts';

const origin: LatLngTuple = [43.716, 10.4];
const kx = Math.cos(origin[0] * Math.PI / 180) * 111_320;
const at = (x: number, y = 0): LatLngTuple => [origin[0] + y / 110_540, origin[1] + x / kx];
const xOf = ([, lng]: LatLngTuple) => (lng - origin[1]) * kx;
const yOf = ([lat]: LatLngTuple) => (lat - origin[0]) * 110_540;
const route = [at(0), at(100)];
function feature(id: string, x: number, y: number, certainty: OsmFeature['certainty'] = 'known_obstacle', scope: OsmFeature['scope'] = 'path'): OsmFeature {
  return { id, source: 'osm', kind: 'kerb', certainty, scope, label: id, geometry: { type: 'point', coords: at(x, y) }, tags: { kerb: 'raised' } };
}
function report(id: string, y: number, status: Report['status'] = 'unverified'): Report {
  const [lat, lng] = at(30, y);
  return { id, lat, lng, description: 'Test fixture', category: 'kerb', categorySource: 'user', createdAt: '', status, source: 'user_report',
    interpretation: { category: 'kerb', obstacle: null, summary: '', severity: 'unknown', missing_info: [], engine: 'fallback' } };
}
const features = [feature('known', 30, 1), feature('possible', 50, 3, 'possible_issue'), feature('unknown', 70, 0, 'info'),
  feature('positive', 80, 1, 'positive_info'), feature('far', 70, 40), feature('shop', 60, 1, 'known_obstacle', 'place')];
const reports = [report('near', 10), report('far', 30), report('resolved', 0, 'resolved')];

describe('map data scope', () => {
  it('starts with no overlays until a current route exists, without discarding source data', () => {
    expect(scopedMapData(features, reports, null, 'route')).toEqual({ features: [], reports: [] });
    const all = scopedMapData(features, reports, null, 'all');
    expect(all.features).toBe(features);
    expect(all.reports).toBe(reports);
  });
  it('uses exactly the main route analysis and unresolved nearby reports; unrelated places stay out', () => {
    const analysis = analyzeRoute(route, features, reports);
    const data = scopedMapData(features, reports, analysis, 'route');
    expect(data.features.map((f) => f.id)).toEqual(['known', 'possible', 'unknown', 'positive']);
    expect(data.reports.map((r) => r.id)).toEqual(['near']);
    expect(scopedMapData(features, reports, null, 'route')).toEqual({ features: [], reports: [] });
    expect(features).toHaveLength(6);
    expect(reports).toHaveLength(3);
  });
  it('allows one explicitly selected off-route element without pulling in all comparison obstacles', () => {
    const analysis = analyzeRoute(route, features, reports);
    const data = scopedMapData(features, reports, analysis, 'route');
    const selection = { type: 'feature' as const, feature: features[4] };
    const shown = withMapSelection(data, selection);
    expect(shown.features.map((f) => f.id)).toEqual(['known', 'possible', 'unknown', 'positive', 'far']);
    expect(selectionIsOutsideRoute(selection, analysis)).toBe(true);
    expect(withMapSelection(data, null)).toBe(data);
    expect(withMapSelection(shown, selection)).toBe(shown);
    expect(selectionIsOutsideRoute({ type: 'feature', feature: features[0] }, analysis)).toBe(false);
  });
  it('can show a just-created or resolved report alone when explicitly opening its detail', () => {
    const data = scopedMapData(features, reports, null, 'route');
    expect(withMapSelection(data, { type: 'report', report: reports[2] }).reports.map((r) => r.id)).toEqual(['resolved']);
    expect(selectionIsOutsideRoute({ type: 'report', report: reports[2] }, analyzeRoute(route, features, reports))).toBe(true);
  });
});

describe('line clipping inside the main route corridor', () => {
  it('clips a long overlapping OSM way to the route and 4m round endpoint buffers', () => {
    const line = [at(-500), at(500)];
    const original = structuredClone(line);
    const clipped = clipLineToRoute(line, route);
    expect(clipped).toHaveLength(1);
    expect(xOf(clipped[0][0])).toBeCloseTo(-4, 5);
    expect(xOf(clipped[0].at(-1)!)).toBeCloseTo(104, 5);
    expect(line).toEqual(original);
  });
  it('cuts a partially parallel line at the circular corridor boundary', () => {
    const clipped = clipLineToRoute([at(-100, 3), at(200, 3)], route);
    expect(xOf(clipped[0][0])).toBeCloseTo(-Math.sqrt(7), 5);
    expect(xOf(clipped[0].at(-1)!)).toBeCloseTo(100 + Math.sqrt(7), 5);
    expect(yOf(clipped[0][0])).toBeCloseTo(3, 5);
    expect(clipLineToRoute([at(0, 5), at(100, 5)], route)).toEqual([]);
  });
  it('does not connect portions that leave and later re-enter the corridor', () => {
    const clipped = clipLineToRoute([at(10), at(20, 30), at(70, 30), at(80)], route);
    expect(clipped).toHaveLength(2);
    expect(yOf(clipped[0].at(-1)!)).toBeCloseTo(4, 5);
    expect(yOf(clipped[1][0])).toBeCloseTo(4, 5);
    expect(xOf(clipped[0].at(-1)!)).toBeLessThan(20);
    expect(xOf(clipped[1][0])).toBeGreaterThan(70);
  });
  it('merges adjacent pieces through route bends and duplicate route vertices', () => {
    const bent = [at(0), at(50), at(50), at(50, 50)];
    const line = [at(-10), at(50), at(50, 80)];
    const clipped = clipLineToRoute(line, bent);
    expect(clipped).toHaveLength(1);
    expect(xOf(clipped[0][0])).toBeCloseTo(-4, 5);
    expect(yOf(clipped[0].at(-1)!)).toBeCloseTo(54, 5);
  });
  it('handles empty and degenerate geometries without invalid coordinates', () => {
    expect(clipLineToRoute([], route)).toEqual([]);
    expect(clipLineToRoute(route, [at(0)])).toEqual([]);
    expect(clipLineToRoute([at(30), at(30)], route)).toEqual([]);
    expect(clipLineToRoute(route, route, 0)).toEqual([]);
    const pointRoute = clipLineToRoute([at(-50), at(50)], [at(0), at(0)]);
    expect(xOf(pointRoute[0][0])).toBeCloseTo(-4, 5);
    expect(xOf(pointRoute[0].at(-1)!)).toBeCloseTo(4, 5);
  });
});
