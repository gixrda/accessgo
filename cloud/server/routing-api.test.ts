import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudApi } from './cloud-api.ts';
import { getFootRoute, getRoute } from './routing.ts';
import type { OsmDataset } from '../shared/types.ts';
vi.mock('./routing.ts', () => ({ getRoute: vi.fn(async () => ({ mode: 'wheelchair' })), getFootRoute: vi.fn(async () => ({ mode: 'foot' })) }));
const osm: OsmDataset = { source: 'OpenStreetMap', fetchedAt: '2026-10-24', bbox: [43.712, 10.393, 43.724, 10.410], features: [] };
const from = { lat: 43.718, lng: 10.401 };
const to = { lat: 43.72, lng: 10.40 };
const via = { lat: 43.721, lng: 10.402 };
const api = createCloudApi({ env: {}, osm, getUserId: async () => null });
const request = (body: unknown) => new Request('https://accessgo.test/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://accessgo.test' }, body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());
describe('multi-stop API validation', () => {
  it('routes the ordered intermediate stops without requiring sign-in or a database', async () => {
    expect((await api(request({ from, to, via: [via] }))).status).toBe(200);
    expect(getRoute).toHaveBeenCalledExactlyOnceWith(from, to, {}, [via]);
    expect((await api(request({ from, to, via: [via], profile: 'foot' }))).status).toBe(200);
    expect(getFootRoute).toHaveBeenCalledExactlyOnceWith(from, to, [via]);
  });
  it.each([null, false, 'Pisa', {}, [null], [{}], [{ lat: 43.72 }], [{ lat: '43.72', lng: 10.4 }], [{ lat: 0, lng: 0 }], [via, via, via, via]])('rejects malformed or excessive stops before routing: %j', async (stops) => {
    expect((await api(request({ from, to, via: stops }))).status).toBe(400);
    expect(getRoute).not.toHaveBeenCalled();
    expect(getFootRoute).not.toHaveBeenCalled();
  });
  it('keeps requests without via backwards-compatible', async () => {
    expect((await api(request({ from, to }))).status).toBe(200);
    expect(getRoute).toHaveBeenCalledExactlyOnceWith(from, to, {}, []);
  });
});
