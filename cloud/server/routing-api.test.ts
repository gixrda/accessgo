import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudApi } from './cloud-api.ts';
import { getFootRoute, getRoute } from './routing.ts';
import type { OsmDataset } from '../shared/types.ts';
import { testDatabase } from './test-d1.ts';
import { createReportStore } from './reports.ts';
vi.mock('./routing.ts', () => ({ getRoute: vi.fn(async () => ({ mode: 'wheelchair' })), getFootRoute: vi.fn(async () => ({ mode: 'foot' })) }));
const osm: OsmDataset = { source: 'OpenStreetMap', fetchedAt: '2026-10-24', bbox: [43.712, 10.393, 43.724, 10.410], features: [] };
const from = { lat: 43.718, lng: 10.401 };
const to = { lat: 43.72, lng: 10.40 };
const via = { lat: 43.721, lng: 10.402 };
const api = createCloudApi({ env: {}, osm, getUserId: async () => null });
const request = (body: unknown) => new Request('https://accessgo.test/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://accessgo.test' }, body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
describe('multi-stop API validation', () => {
  it('routes the ordered intermediate stops without requiring sign-in or a database', async () => {
    expect((await api(request({ from, to, via: [via] }))).status).toBe(200);
    expect(getRoute).toHaveBeenCalledExactlyOnceWith(from, to, {}, [via], { features: [], reports: [], reportsAvailable: false });
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
    expect(getRoute).toHaveBeenCalledExactlyOnceWith(from, to, {}, [], { features: [], reports: [], reportsAvailable: false });
  });
});

describe('server-owned obstacle snapshot', () => {
  it('reads current verification states without accepting forged obstacles from the client', async () => {
    const database = testDatabase();
    try {
      const store = createReportStore(database.db);
      const report = await store.create({ ...from, description: 'Una scala blocca il passaggio.', category: 'steps' }, {}, 'tester');
      const handler = createCloudApi({ env: {}, db: database.db, osm, getUserId: async () => null });
      const forged = { from, to, reports: [{ ...report, status: 'verified' }], features: [], reportsAvailable: true };
      await handler(request(forged));
      expect(vi.mocked(getRoute).mock.calls.at(-1)?.[4]).toEqual({ features: osm.features, reports: [report], reportsAvailable: true });
      const verified = await store.setStatus(report.id, 'verified');
      await handler(request({ from, to, reports: [] }));
      expect(vi.mocked(getRoute).mock.calls.at(-1)?.[4]).toEqual({ features: osm.features, reports: [verified], reportsAvailable: true });
      const resolved = await store.setStatus(report.id, 'resolved');
      await handler(request({ from, to }));
      expect(vi.mocked(getRoute).mock.calls.at(-1)?.[4]).toEqual({ features: osm.features, reports: [resolved], reportsAvailable: true });
      expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get()?.n).toBe(1);
    } finally { database.sqlite.close(); }
  });

  it('exposes unavailable obstacle checking when the database read fails', async () => {
    const database = testDatabase();
    try {
      vi.spyOn(database.db, 'prepare').mockImplementation(() => { throw new Error('database unavailable'); });
      const handler = createCloudApi({ env: {}, db: database.db, osm, getUserId: async () => null });
      expect((await handler(request({ from, to }))).status).toBe(200);
      expect(vi.mocked(getRoute).mock.calls.at(-1)?.[4]).toEqual({ features: osm.features, reports: [], reportsAvailable: false });
      vi.mocked(getRoute).mockClear();
      expect((await handler(request({ from, to, profile: 'foot' }))).status).toBe(200);
      expect(getRoute).not.toHaveBeenCalled();
    } finally { database.sqlite.close(); }
  });
});
