import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFootRoute, getRoute } from '../server/routing.ts';
import { routeDistances } from '../shared/navigation.ts';
import fixture from './fixtures/valhalla-pisa-three-points.json';

const from = { lat: 43.7228, lng: 10.3971 };
const via = { lat: 43.7197, lng: 10.3975 };
const to = { lat: 43.7163, lng: 10.4012 };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => vi.unstubAllGlobals());

describe('ordered routing and actual provider directions', () => {
  it('preserves all three stops and Italian instructions from a real Pisa Valhalla fixture', async () => {
    // Captured from the public FOSSGIS API on 2026-10-24, using public Pisa landmarks.
    const fetcher = vi.fn(async () => response(fixture));
    vi.stubGlobal('fetch', fetcher);
    const route = await getRoute(from, to, {}, [via]);
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.locations).toEqual([from, via, to].map(({ lat, lng }) => ({ lat, lon: lng, type: 'break' })));
    expect(request).toMatchObject({ language: 'it-IT', format: 'osrm', costing: 'pedestrian' });
    expect(route).toMatchObject({ mode: 'wheelchair', provider: 'valhalla', distanceM: 1210.528 });
    expect(route.waypoints).toEqual([[from.lat, from.lng], [via.lat, via.lng], [to.lat, to.lng]]);
    expect(route.maneuvers).toHaveLength(17);
    expect(route.maneuvers[0].instruction).toBe('Cammina verso ovest su Piazza del Duomo.');
    expect(route.maneuvers.some((step) => step.instruction.startsWith('Svolta a destra'))).toBe(true);
    const arrival = route.maneuvers.find((step) => step.legIndex === 0 && step.type === 'arrive')!;
    const departure = route.maneuvers.find((step) => step.legIndex === 1 && step.type === 'depart')!;
    expect(departure.shapeIndex).toBeGreaterThan(0);
    expect(departure.shapeIndex).toBe(arrival.shapeIndex);
    expect(departure.routeDistanceM).toBe(arrival.routeDistanceM);
    const distances = routeDistances(route.coords);
    route.maneuvers.forEach((step, i) => {
      expect(step.coordinate).toEqual(route.coords[step.shapeIndex]);
      expect(step.routeDistanceM).toBe(distances[step.shapeIndex]);
      if (i > 0) expect(step.routeDistanceM).toBeGreaterThanOrEqual(route.maneuvers[i - 1].routeDistanceM);
    });
  });

  it('does not manufacture voice instructions when any provider step is missing text', async () => {
    const data = structuredClone(fixture);
    delete (data.routes[0].legs[1].steps[1].maneuver as { instruction?: string }).instruction;
    vi.stubGlobal('fetch', vi.fn(async () => response(data)));
    const route = await getRoute(from, to, {}, [via]);
    expect(route.coords.length).toBeGreaterThan(10);
    expect(route.maneuvers).toEqual([]);
  });

  it('omits voice guidance when a provider maneuver cannot be placed on the polyline', async () => {
    const data = structuredClone(fixture);
    data.routes[0].legs[1].steps[1].maneuver.location = [10.46, 43.75];
    vi.stubGlobal('fetch', vi.fn(async () => response(data)));
    expect((await getRoute(from, to, {}, [via])).maneuvers).toEqual([]);
  });

  it('rejects incomplete multi-stop responses from all providers instead of returning A to B', async () => {
    const incomplete = structuredClone(fixture);
    incomplete.routes[0].legs.pop();
    vi.stubGlobal('fetch', vi.fn(async () => response(incomplete)));
    await expect(getRoute(from, to, {}, [via])).rejects.toMatchObject({ status: 502, message: expect.stringContaining('tutte le tappe') });
  });

  it('does not substitute a walking route when any wheelchair leg is unreachable', async () => {
    const fetcher = vi.fn(async () => response({ code: 'NoRoute' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getRoute(from, to, {}, [via])).rejects.toMatchObject({ status: 404 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps every stop in walking fallback and omits wheelchair duration and voice', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(fixture));
    vi.stubGlobal('fetch', fetcher);
    const route = await getRoute(from, to, {}, [via]);
    expect(fetcher.mock.calls[1][0]).toContain(`${from.lng},${from.lat};${via.lng},${via.lat};${to.lng},${to.lat}?`);
    expect(route).toMatchObject({ mode: 'foot_fallback', provider: 'osrm-fossgis', durationS: null, maneuvers: [] });
  });

  it('uses the same stops for the walking comparison and refuses more than five points', async () => {
    const fetcher = vi.fn(async () => response(fixture));
    vi.stubGlobal('fetch', fetcher);
    expect((await getFootRoute(from, to, [via])).mode).toBe('foot');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).locations).toHaveLength(3);
    await expect(getRoute(from, to, {}, [via, via, via, via])).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('supports legacy two-point calls with no intermediate argument', async () => {
    const data = structuredClone(fixture);
    data.routes[0].legs = [data.routes[0].legs[0]];
    vi.stubGlobal('fetch', vi.fn(async () => response(data)));
    expect((await getRoute(from, via, {})).waypoints).toHaveLength(2);
    expect((await getFootRoute(from, via)).waypoints).toHaveLength(2);
  });

  it('uses explicit provider indexes for a loop and retains arrival/departure at the same vertex', async () => {
    const point = [10.4, 43.72];
    const another = [10.401, 43.721];
    const end = [10.402, 43.722];
    const step = (instruction: string, index: number, location: number[], distance: number, type: string) => ({
      distance, maneuver: { instruction, location, type }, intersections: [{ geometry_index: index }],
    });
    const data = { code: 'Ok', routes: [{ distance: 400, duration: 300, geometry: { coordinates: [point, another, point, end] }, legs: [
      { steps: [step('Parti.', 0, point, 250, 'depart'), step('Arrivo alla tappa.', 2, point, 0, 'arrive')] },
      { steps: [step('Riparti.', 0, point, 150, 'depart'), step('Arrivo.', 1, end, 0, 'arrive')] },
    ] }] };
    vi.stubGlobal('fetch', vi.fn(async () => response(data)));
    const route = await getRoute(from, to, {}, [via]);
    expect(route.maneuvers.map((step) => step.shapeIndex)).toEqual([0, 2, 2, 3]);
    expect(route.maneuvers[1].routeDistanceM).toBeGreaterThan(200);
    expect(route.maneuvers[1].routeDistanceM).toBe(route.maneuvers[2].routeDistanceM);
  });

  it('withholds spoken instructions for a discontinuity between snapped legs', async () => {
    const data = structuredClone(fixture);
    // A leg claiming to depart at a different vertex must not silently bridge a gap.
    data.routes[0].legs[1].steps[0].intersections[0].geometry_index = 1;
    data.routes[0].legs[1].steps[0].maneuver.location = data.routes[0].geometry.coordinates[34];
    vi.stubGlobal('fetch', vi.fn(async () => response(data)));
    const route = await getRoute(from, to, {}, [via]);
    expect(route.coords).toHaveLength(76);
    expect(route.maneuvers).toEqual([]);
  });

  it('passes all stops to ORS and uses global shape indexes across its segments', async () => {
    const fetcher = vi.fn(async () => response({ features: [{ geometry: { coordinates: [[10.4, 43.72], [10.401, 43.721], [10.402, 43.722]] },
      properties: { summary: { distance: 300, duration: 280 }, segments: [
        { steps: [{ instruction: 'Parti verso nord.', distance: 150, type: 11, way_points: [0, 1] }, { instruction: 'Arrivo alla tappa.', distance: 0, type: 10, way_points: [1, 1] }] },
        { steps: [{ instruction: 'Svolta a destra.', distance: 150, type: 1, way_points: [1, 2] }, { instruction: 'Arrivo.', distance: 0, type: 10, way_points: [2, 2] }] },
      ] } }] }));
    vi.stubGlobal('fetch', fetcher);
    const route = await getRoute(from, to, { ORS_API_KEY: 'test-only' }, [via]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ coordinates: [[from.lng, from.lat], [via.lng, via.lat], [to.lng, to.lat]], language: 'it', instructions: true });
    expect(route.provider).toBe('openrouteservice');
    expect(route.maneuvers.map((step) => [step.shapeIndex, step.legIndex, step.type])).toEqual([[0, 0, 'depart'], [1, 0, 'arrive'], [1, 1, 'turn'], [2, 1, 'arrive']]);
    expect(route.maneuvers[2].routeDistanceM).toBe(routeDistances(route.coords)[1]);
  });
});
