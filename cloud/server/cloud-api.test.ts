import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudApi, readJsonBody } from './cloud-api.ts';
import { testDatabase } from './test-d1.ts';
import type { OsmDataset } from '../shared/types.ts';

vi.mock('./routing.ts', () => ({
  getRoute: vi.fn(async () => ({ mode: 'wheelchair', provider: 'valhalla', coords: [], distanceM: 12, durationS: 10 })),
  getFootRoute: vi.fn(async () => ({ mode: 'foot', provider: 'valhalla', coords: [], distanceM: 10, durationS: 10 })),
}));

const osm: OsmDataset = { source: 'OpenStreetMap', fetchedAt: '2026-10-24', bbox: [43.712, 10.393, 43.724, 10.410], features: [] };
const input = { lat: 43.718, lng: 10.401, description: 'Un gradino alto blocca il passaggio.' };
let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); });
afterEach(() => database.sqlite.close());
const request = (path: string, data: unknown, extra: HeadersInit = {}, method = 'POST') => new Request(`https://accessgo.test${path}`, {
  method, headers: { 'Content-Type': 'application/json', Origin: 'https://accessgo.test', ...extra }, body: JSON.stringify(data),
});
function api(userId: string | null = null, env = {}) {
  return createCloudApi({ env, db: database.db, osm, getUserId: async () => userId });
}

describe('cloud API', () => {
  it('serves maps publicly and reveals capabilities without keys or identity', async () => {
    const handler = api('private-person', { ADMIN_TOKEN: 'private-secret', ORS_API_KEY: 'private-route-key' });
    const status = await handler(new Request('https://accessgo.test/api/status'));
    const text = await status.text();
    expect(status.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toMatchObject({ reportRequiresSignIn: true, reportSignedIn: true, admin: true });
    expect(text).not.toContain('private-');
    expect(await (await handler(new Request('https://accessgo.test/api/osm'))).json()).toEqual(osm);
  });

  it('rejects anonymous reporting including a forged client identity header', async () => {
    const response = await api()(request('/api/reports', input, { 'oai-authenticated-user-id': 'spoof' }));
    expect(response.status).toBe(401);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get()?.n).toBe(0);
  });

  it('enforces same-origin for authenticated writes, then persists a valid request', async () => {
    expect((await api('a')(request('/api/reports', input, { Origin: 'https://evil.test' }))).status).toBe(403);
    const missingOrigin = request('/api/reports', input);
    missingOrigin.headers.delete('origin');
    expect((await api('a')(missingOrigin)).status).toBe(403);
    const response = await api('a')(request('/api/reports', input));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: 'unverified' });
  });

  it('accepts public route requests and rejects coordinates outside Pisa', async () => {
    const good = request('/api/route', { from: { lat: 43.718, lng: 10.401 }, to: { lat: 43.72, lng: 10.40 } });
    expect((await api()(good)).status).toBe(200);
    expect((await api()(request('/api/route', { from: { lat: 0, lng: 0 }, to: { lat: 43.72, lng: 10.40 } }))).status).toBe(400);
  });

  it('keeps OSM available when the database is unavailable', async () => {
    const handler = createCloudApi({ env: {}, osm, getUserId: async () => null });
    expect((await handler(new Request('https://accessgo.test/api/osm'))).status).toBe(200);
    expect((await handler(new Request('https://accessgo.test/api/reports'))).status).toBe(503);
  });

  it('protects moderation with the configured secret and origin', async () => {
    const handler = api('a', { ADMIN_TOKEN: 'test-secret' });
    const saved = await (await handler(request('/api/reports', input))).json() as { id: string };
    expect((await handler(request(`/api/reports/${saved.id}`, { status: 'verified' }, {}, 'PATCH'))).status).toBe(401);
    expect((await handler(request(`/api/reports/${saved.id}`, { status: 'verified' }, { 'x-admin-token': 'test-secret' }, 'PATCH'))).status).toBe(200);
  });
});

describe('bounded JSON input', () => {
  it('rejects oversized streamed bodies without trusting Content-Length', async () => {
    const oversized = request('/api/reports', { description: 'x'.repeat(17_000) });
    await expect(readJsonBody(oversized)).rejects.toMatchObject({ status: 413 });
  });
  it('rejects non-JSON content and malformed JSON', async () => {
    await expect(readJsonBody(new Request('https://accessgo.test', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 415 });
    await expect(readJsonBody(new Request('https://accessgo.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).rejects.toMatchObject({ status: 400 });
  });
});
