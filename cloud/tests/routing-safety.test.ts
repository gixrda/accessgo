import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRoute } from '../server/routing.ts';
import { trustedBlockers, intersectingBlockers, type RoutingSafetyContext } from '../server/route-safety.ts';
import type { LatLngTuple, OsmFeature, Report } from '../shared/types.ts';

const from = { lat: 43.72, lng: 10.4 }, to = { lat: 43.72, lng: 10.402 };
const straight: LatLngTuple[] = [[from.lat, from.lng], [to.lat, to.lng]];
const detour: LatLngTuple[] = [straight[0], [43.721, 10.4], [43.721, 10.402], straight[1]];
const obstacle = (id = 'node/1', point: LatLngTuple = [43.72, 10.401], tags: Record<string, string> = { highway: 'steps' }): OsmFeature => ({
  id, source: 'osm', scope: 'path', certainty: 'known_obstacle', kind: 'steps', label: 'Gradini', tags,
  geometry: { type: 'point', coords: point },
});
const report = (overrides: Partial<Report> = {}): Report => ({ id: 'report-1', lat: 43.72, lng: 10.401,
  description: 'Passaggio chiuso', category: 'obstructed_sidewalk', categorySource: 'user', createdAt: '2026-10-24',
  source: 'user_report', status: 'verified', interpretation: { category: 'obstructed_sidewalk', obstacle: 'passaggio',
    severity: 'high', summary: 'Passaggio chiuso', missing_info: [], engine: 'fallback' }, ...overrides });
const context = (features = [obstacle()], reports: Report[] = []): RoutingSafetyContext => ({ features, reports, reportsAvailable: true });
function response(coords: LatLngTuple[], legs = 1) {
  return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 300, duration: 250,
    geometry: { coordinates: coords.map(([lat, lng]) => [lng, lat]) }, legs: Array.from({ length: legs }, () => ({ steps: [] })) }] }));
}
afterEach(() => vi.unstubAllGlobals());

describe('trusted blocking evidence', () => {
  it('uses explicit path prohibitions and respects ramp/accessibility exceptions', () => {
    const features = [obstacle(), obstacle('ramp', [43.72, 10.401], { highway: 'steps', 'ramp:wheelchair': 'yes' }),
      obstacle('accessible', [43.72, 10.401], { highway: 'steps', wheelchair: 'yes' }),
      { ...obstacle('place'), scope: 'place' as const }, obstacle('surface', [43.72, 10.401], { surface: 'cobblestone' }),
      obstacle('prohibited', [43.72, 10.401], { wheelchair: 'no', 'ramp:wheelchair': 'yes' })];
    expect(trustedBlockers(context(features)).map(x => x.obstacle.id)).toEqual(['node/1', 'prohibited']);
  });
  it('never promotes AI severity, unverified or resolved reports into routing prohibitions', () => {
    const reports = [report(), report({ id: 'unverified', status: 'unverified' }), report({ id: 'resolved', status: 'resolved' }),
      report({ id: 'ai-category', categorySource: 'interpretation' }), report({ id: 'surface', category: 'uneven_surface' })];
    expect(trustedBlockers(context([], reports)).map(x => x.obstacle.id)).toEqual(['report-1']);
  });
  it('detects crossings in the middle of long route and obstacle segments', () => {
    const line = { ...obstacle(), geometry: { type: 'line' as const, coords: [[43.719, 10.401], [43.721, 10.401]] as LatLngTuple[] } };
    expect(intersectingBlockers(straight, trustedBlockers(context([line])))).toHaveLength(1);
    expect(intersectingBlockers([[43.722, 10.4], [43.722, 10.402]], trustedBlockers(context([line])))).toHaveLength(0);
  });
});

describe('actual provider exclusions and independent route check', () => {
  it('sends longitude/latitude polygons and accepts only a geometry that avoids the blocker', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(straight)).mockResolvedValueOnce(response(detour));
    vi.stubGlobal('fetch', fetcher);
    const result = await getRoute(from, to, {}, [], context());
    expect(result.safety?.status).toBe('rerouted');
    expect(result.safety?.avoided).toHaveLength(1);
    expect(result.coords).toEqual(detour);
    const payload = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(payload.exclude_polygons).toHaveLength(1);
    expect(payload.exclude_polygons[0][0][0]).toBeCloseTo(10.401, 3);
    expect(payload.exclude_polygons[0][0][1]).toBeCloseTo(43.72, 3);
    expect(payload.locations.map((x: {lat: number; lon: number}) => [x.lat, x.lon])).toEqual(straight);
  });
  it('sends ORS a valid avoid_polygons MultiPolygon and independently checks its result', async () => {
    const orsResponse = (coords: LatLngTuple[]) => new Response(JSON.stringify({ features: [{
      geometry: { coordinates: coords.map(([lat, lng]) => [lng, lat]) },
      properties: { summary: { distance: 300, duration: 250 }, segments: [{ steps: [] }] },
    }] }));
    const fetcher = vi.fn().mockResolvedValueOnce(orsResponse(straight)).mockResolvedValueOnce(orsResponse(detour));
    vi.stubGlobal('fetch', fetcher);
    const result = await getRoute(from, to, { ORS_API_KEY: 'test-key' }, [], context());
    expect(result.safety?.status).toBe('rerouted');
    const polygon = JSON.parse(fetcher.mock.calls[1][1].body).options.avoid_polygons;
    expect(polygon.type).toBe('MultiPolygon');
    expect(polygon.coordinates).toHaveLength(1);
    expect(polygon.coordinates[0][0]).toHaveLength(5);
    expect(polygon.coordinates[0][0][0]).toEqual(polygon.coordinates[0][0][4]);
    expect(fetcher.mock.calls.every(([url]) => String(url).includes('/wheelchair/'))).toBe(true);
  });
  it('blocks ignored exclusions and bounds provider attempts without walking fallback', async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(straight));
    vi.stubGlobal('fetch', fetcher);
    const result = await getRoute(from, to, {}, [], context());
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.safety?.status).toBe('blocked');
    expect(result.safety?.blockedBy).toHaveLength(1);
    expect(result.maneuvers).toEqual([]);
    expect(fetcher.mock.calls.every(([url]) => String(url).includes('valhalla'))).toBe(true);
  });
  it('keeps original geometry inspection-only when exclusion yields no route', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(straight))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'NoRoute' })));
    vi.stubGlobal('fetch', fetcher);
    const result = await getRoute(from, to, {}, [], context());
    expect(result.safety?.status).toBe('blocked');
    expect(result.coords).toEqual(straight);
    expect(result.maneuvers).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rechecks a new blocker encountered only on the detour and adds it to exclusions', async () => {
    const secondDetour: LatLngTuple[] = [straight[0], [43.722, 10.4], [43.722, 10.402], straight[1]];
    const fetcher = vi.fn().mockResolvedValueOnce(response(straight)).mockResolvedValueOnce(response(detour))
      .mockResolvedValueOnce(response(secondDetour));
    vi.stubGlobal('fetch', fetcher);
    const result = await getRoute(from, to, {}, [], context([obstacle(), obstacle('new', [43.721, 10.401])]));
    expect(result.safety?.status).toBe('rerouted');
    expect(result.safety?.avoided).toHaveLength(2);
    expect(JSON.parse(fetcher.mock.calls[2][1].body).exclude_polygons).toHaveLength(2);
  });
  it('does not omit a requested stop inside a blocker or attempt to snap past it', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(straight, 2));
    vi.stubGlobal('fetch', fetcher);
    const result = await getRoute(from, to, {}, [{ lat: 43.72, lng: 10.401 }], context());
    expect(result.safety?.status).toBe('blocked');
    expect(result.waypoints).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('blocks a requested endpoint at an obstacle even when provider geometry snaps away from it', async () => {
    const shifted: LatLngTuple[] = [[43.721, 10.4], [43.721, 10.402]];
    const fetcher = vi.fn().mockResolvedValueOnce(response(shifted));
    vi.stubGlobal('fetch', fetcher);
    const result = await getRoute(from, to, {}, [], context([obstacle('origin-blocker', straight[0])]));
    expect(result.safety?.status).toBe('blocked');
    expect(result.safety?.blockedBy.map(b => b.id)).toContain('origin-blocker');
    expect(result.maneuvers).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves every ordered A B C stop during rerouting', async () => {
    const via = { lat: 43.721, lng: 10.402 };
    const fetcher = vi.fn().mockResolvedValueOnce(response(straight, 2)).mockResolvedValueOnce(response(detour, 2));
    vi.stubGlobal('fetch', fetcher);
    const result = await getRoute(from, to, {}, [via], context());
    expect(result.safety?.status).toBe('rerouted');
    expect(JSON.parse(fetcher.mock.calls[1][1].body).locations.map((p: {lat:number;lon:number}) => [p.lat,p.lon]))
      .toEqual([[from.lat,from.lng],[via.lat,via.lng],[to.lat,to.lng]]);
  });
  it('reports unavailable report data honestly and suppresses guidance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(detour)));
    const result = await getRoute(from, to, {}, [], { ...context(), reportsAvailable: false });
    expect(result.safety?.status).toBe('unavailable');
    expect(result.safety?.reportsChecked).toBe(false);
    expect(result.maneuvers).toEqual([]);
  });
  it('does not fall back to standard walking when safety context is supplied', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    await expect(getRoute(from, to, {}, [], context())).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
