import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudApi, readJsonBody } from './cloud-api.ts';
import { testDatabase } from './test-d1.ts';
import type { Interpretation, OsmDataset } from '../shared/types.ts';
import * as ai from './ai.ts';

vi.mock('./routing.ts', () => ({
  getRoute: vi.fn(async () => ({ mode: 'wheelchair', provider: 'valhalla', coords: [], distanceM: 12, durationS: 10 })),
  getFootRoute: vi.fn(async () => ({ mode: 'foot', provider: 'valhalla', coords: [], distanceM: 10, durationS: 10 })),
}));

const osm: OsmDataset = { source: 'OpenStreetMap', fetchedAt: '2026-10-24', bbox: [43.712, 10.393, 43.724, 10.410], features: [] };
const input = { lat: 43.718, lng: 10.401, description: 'Un gradino alto blocca il passaggio.' };
let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); });
afterEach(() => { database.sqlite.close(); vi.restoreAllMocks(); vi.useRealTimers(); });
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

describe('anonymous analysis without publication', () => {
  const description = 'Testo di prova: un gradino alto blocca la ruota.';
  const interpretation: Interpretation = {
    category: 'steps', obstacle: 'gradino', summary: 'Un gradino blocca il passaggio.', severity: 'unknown',
    missing_info: ['Altezza del gradino'], engine: 'gemma', model: 'gemma-4-26b-a4b-it',
  };
  const limitRows = () => database.sqlite.prepare('SELECT * FROM provider_limits ORDER BY key').all();

  it('analyzes anonymously without checking identity, preserving existing reports and caches', async () => {
    // Keep an existing real-shaped report to detect destructive replacement as well as new inserts.
    await api('existing-author')(request('/api/reports', input));
    database.sqlite.prepare('INSERT INTO geocode_cache (key, payload, expires) VALUES (?, ?, ?)').run('existing', '[]', 99_000);
    const beforeReports = database.sqlite.prepare('SELECT * FROM reports').all();
    const beforeCache = database.sqlite.prepare('SELECT * FROM geocode_cache').all();
    const getUserId = vi.fn(async () => { throw new Error('Preview must not request an identity'); });
    const model = vi.spyOn(ai, 'interpret').mockResolvedValue(interpretation);
    const handler = createCloudApi({ env: { GEMINI_API_KEY: 'private-key' }, db: database.db, osm, getUserId });
    const response = await handler(request('/api/analyze', { description: `  ${description}  `, lat: 0, lng: 0, category: 'other', userId: 'spoof' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ interpretation, published: false });
    expect(model).toHaveBeenCalledExactlyOnceWith(description, { GEMINI_API_KEY: 'private-key' });
    expect(getUserId).not.toHaveBeenCalled();
    expect(database.sqlite.prepare('SELECT * FROM reports').all()).toEqual(beforeReports);
    expect(database.sqlite.prepare('SELECT * FROM geocode_cache').all()).toEqual(beforeCache);
    expect(limitRows()).toEqual([{ key: 'gemma-analysis-preview', next_at: expect.any(Number) }]);
    // All application tables are checked: preview input, result and identity are never stored.
    const stored = JSON.stringify([...database.sqlite.prepare('SELECT * FROM reports').all(), ...database.sqlite.prepare('SELECT * FROM geocode_cache').all(), ...limitRows()]);
    expect(stored).not.toContain(description);
    expect(stored).not.toContain(interpretation.summary);
    expect(stored).not.toContain('spoof');
    expect(stored).not.toContain('private-key');
  });

  it('honestly returns keyword fallback when AI is not configured, without publishing a report', async () => {
    const response = await api()(request('/api/analyze', { description }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ published: false, interpretation: { engine: 'fallback', category: 'steps', note: expect.any(String) } });
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get()?.n).toBe(0);
  });

  it.each([null, [], {}, { description: 1 }, { description: 'corto' }, { description: 'a'.repeat(1001) }])('rejects invalid descriptions before inference or quota acquisition: %j', async (body) => {
    const model = vi.spyOn(ai, 'interpret');
    const response = await api()(request('/api/analyze', body));
    expect(response.status).toBe(400);
    expect(model).not.toHaveBeenCalled();
    expect(limitRows()).toHaveLength(0);
  });

  it('rejects malformed or oversized requests before inference', async () => {
    const model = vi.spyOn(ai, 'interpret');
    const malformed = new Request('https://accessgo.test/api/analyze', { method: 'POST', headers: { Origin: 'https://accessgo.test', 'Content-Type': 'application/json' }, body: '{' });
    expect((await api()(malformed)).status).toBe(400);
    expect((await api()(request('/api/analyze', { description: 'x'.repeat(17_000) }))).status).toBe(413);
    expect(model).not.toHaveBeenCalled();
    expect(limitRows()).toHaveLength(0);
  });

  it('requires a same-origin request even when the visitor is anonymous', async () => {
    const model = vi.spyOn(ai, 'interpret');
    const missingOrigin = request('/api/analyze', { description });
    missingOrigin.headers.delete('origin');
    for (const req of [missingOrigin, request('/api/analyze', { description }, { Origin: 'https://evil.test' }), request('/api/analyze', { description }, { 'Sec-Fetch-Site': 'cross-site' })]) {
      expect((await api()(req)).status).toBe(403);
    }
    expect(model).not.toHaveBeenCalled();
    expect(limitRows()).toHaveLength(0);
  });

  it('limits concurrent requests from independent API instances before model calls', async () => {
    const model = vi.spyOn(ai, 'interpret').mockResolvedValue(interpretation);
    const responses = await Promise.all(Array.from({ length: 6 }, () => api()(request('/api/analyze', { description }))));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 429, 429, 429, 429, 429]);
    expect(model).toHaveBeenCalledTimes(1);
    const busy = responses.find((response) => response.status === 429)!;
    expect(await busy.json()).toEqual({ error: 'Analisi momentaneamente occupata. Attendi 5 secondi e riprova.' });
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get()?.n).toBe(0);
  });

  it('fails closed if the shared database is unavailable before calling AI', async () => {
    const model = vi.spyOn(ai, 'interpret');
    const handler = createCloudApi({ env: { GEMINI_API_KEY: 'private-key' }, osm, getUserId: async () => null });
    const response = await handler(request('/api/analyze', { description }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Analisi temporaneamente non disponibile. Riprova più tardi.' });
    expect(model).not.toHaveBeenCalled();
  });

  it('does not grant publication permission after a successful preview', async () => {
    const handler = api();
    expect((await handler(request('/api/analyze', { description }))).status).toBe(200);
    expect((await handler(request('/api/reports', { ...input, description }))).status).toBe(401);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get()?.n).toBe(0);
  });
});
