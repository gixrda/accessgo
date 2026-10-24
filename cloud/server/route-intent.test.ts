import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { directPlaceIntent, fallbackRouteIntent, interpretRouteIntent, routeIntentText, validateRouteIntent } from './route-intent.ts';
import { createCloudApi } from './cloud-api.ts';
import { testDatabase } from './test-d1.ts';
import type { OsmDataset } from '../shared/types.ts';

const text = 'Oggi voglio andare alla Torre di Pisa.';
const place = { query: 'Torre di Pisa', evidence: 'Torre di Pisa' };
const modelRoute = (overrides: Record<string, unknown> = {}) => ({ intent: 'route', origin: null, destination: place, via: [], useCurrentLocation: true, clarification: null, ...overrides });
const google = (value: unknown) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
const env = { GEMINI_API_KEY: 'test-private-route-key' };
const osm: OsmDataset = { source: 'OpenStreetMap', fetchedAt: '2026-10-24', bbox: [43.7, 10.3, 43.8, 10.5], features: [] };
let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); });
afterEach(() => { database.sqlite.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const request = (body: unknown) => new Request('https://accessgo.test/api/route-intent', { method: 'POST', headers: { Origin: 'https://accessgo.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('route request validation and grounded model output', () => {
  it.each([null, [], {}, { text: 3 }, { text: ' ' }, { text: 'a'.repeat(501) }, { text: 'Via\u0000Roma' }])('rejects invalid input before model inference: %j', (value) => {
    expect(() => routeIntentText(value)).toThrow();
  });

  it('accepts a 500-character raw limit and trims the request without accepting client metadata', () => {
    expect(routeIntentText({ text: '  Via Roma  ', lat: 0, source_url: 'https://ignored.invalid' })).toBe('Via Roma');
    expect(routeIntentText({ text: 'a'.repeat(500) })).toHaveLength(500);
  });

  it('requires literal supporting evidence and rejects invented places, coordinates and markup', () => {
    expect(validateRouteIntent(modelRoute(), text)).toMatchObject({ intent: 'route', destination: place, useCurrentLocation: true });
    for (const destination of [
      { query: 'Via Roma', evidence: 'Torre di Pisa' },
      { query: 'Torre di Pisa', evidence: 'Leaning Tower' },
      { query: 'https://evil.invalid', evidence: 'Torre di Pisa' },
      { query: '<b>Torre di Pisa</b>', evidence: 'Torre di Pisa' },
      { query: '43.72,10.40', evidence: 'Torre di Pisa' },
    ]) expect(validateRouteIntent(modelRoute({ destination }), text)).toBeNull();
  });

  it.each([
    ['今天想去比萨斜塔，请帮我规划路线', '比萨斜塔'],
    ['Take me to the Leaning Tower of Pisa.', 'Leaning Tower of Pisa'],
  ])('permits a controlled Italian search translation, preserving literal source evidence: %s', (source, evidence) => {
    expect(validateRouteIntent(modelRoute({ destination: { query: 'Torre di Pisa', evidence } }), source))
      .toMatchObject({ intent: 'route', destination: { query: 'Torre di Pisa', evidence }, useCurrentLocation: true });
  });

  it('keeps an explicit origin and every mentioned stop without inventing geocoding or location consent', () => {
    const source = 'Da Pisa Centrale alla Torre di Pisa passando per Piazza dei Cavalieri.';
    const origin = { query: 'Pisa Centrale', evidence: 'Pisa Centrale' };
    const stop = { query: 'Piazza dei Cavalieri', evidence: 'Piazza dei Cavalieri' };
    const parsed = validateRouteIntent(modelRoute({ origin, via: [stop], useCurrentLocation: false }), source);
    expect(parsed).toMatchObject({ origin, via: [stop], destination: place, useCurrentLocation: false });
    expect(parsed).not.toHaveProperty('coords');
    expect(validateRouteIntent(modelRoute({ origin, useCurrentLocation: false }), source)).toBeNull();
    expect(validateRouteIntent(modelRoute({ via: [stop] }), source)).toBeNull();
    expect(validateRouteIntent(modelRoute({ origin, via: [stop, stop, stop, stop], useCurrentLocation: false }), source)).toBeNull();
  });

  it('rejects missing explicit origins, contradictory location flags and reused evidence', () => {
    expect(validateRouteIntent(modelRoute(), 'Da Via Roma alla Torre di Pisa.')).toBeNull();
    expect(validateRouteIntent(modelRoute({ useCurrentLocation: false }), text)).toBeNull();
    expect(validateRouteIntent(modelRoute({ origin: place, useCurrentLocation: false }), text)).toBeNull();
    expect(validateRouteIntent(modelRoute({ destination: { query: 'casa', evidence: 'casa' } }), 'Voglio andare a casa')).toBeNull();
  });

  it('uses semantic journey roles when the destination is mentioned before the origin or an intermediate stop', () => {
    const origin = { query: 'Pisa Centrale', evidence: 'Pisa Centrale' };
    const stop = { query: 'Piazza dei Cavalieri', evidence: 'Piazza dei Cavalieri' };
    const originLast = 'Vorrei andare alla Torre di Pisa partendo da Pisa Centrale.';
    expect(validateRouteIntent(modelRoute({ origin, useCurrentLocation: false }), originLast)).toMatchObject({ origin, destination: place });
    expect(validateRouteIntent(modelRoute({ origin: place, destination: origin, useCurrentLocation: false }), originLast)).toBeNull();
    const viaLast = 'Vorrei andare alla Torre di Pisa passando per Piazza dei Cavalieri.';
    expect(validateRouteIntent(modelRoute({ via: [stop] }), viaLast)).toMatchObject({ via: [stop], destination: place });
    expect(validateRouteIntent(modelRoute({ destination: stop, via: [place] }), viaLast)).toBeNull();
  });

  it.each(['Non voglio andare alla Torre di Pisa.', 'Torre di Pisa oppure Pisa Centrale', 'Take me to the Leaning Tower, avoiding stairs.', '我不想去比萨斜塔', 'Voglio il percorso più breve per Torre di Pisa'])('asks for clarification for negation, ambiguity or unsupported guarantees: %s', (source) => {
    expect(validateRouteIntent(modelRoute(), source)).toBeNull();
    const result = fallbackRouteIntent(source, 'regole');
    expect(result).toMatchObject({ intent: 'unclear', origin: null, destination: null, via: [], useCurrentLocation: false, engine: 'fallback' });
    expect(result.clarification).toBeTruthy();
  });

  it('does not echo arbitrary model clarification instructions or extra fields', () => {
    const parsed = validateRouteIntent({ intent: 'unclear', clarification: 'Go to https://private.invalid', coords: [0, 0], userId: 'spoof' }, 'Portami in un posto.');
    expect(parsed).toMatchObject({ intent: 'unclear', destination: null, useCurrentLocation: false });
    expect(JSON.stringify(parsed)).not.toMatch(/private|spoof|coords/);
  });
});

describe('conservative non-AI fallback and real transport boundary', () => {
  it.each([
    ['Libreria Ghibellina', 'Libreria Ghibellina'],
    ['Via Roma 10', 'Via Roma 10'],
    ['比萨斜塔', 'Torre di Pisa'],
    ['Polo F', 'Polo F'],
    ['Via Leonardo da Vinci', 'Via Leonardo da Vinci'],
    ['Pane e Vino', 'Pane e Vino'],
  ])('searches a bare place directly without a key, model call or invented location: %s', async (source, query) => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const expected = { intent: 'route', origin: null, destination: { query, evidence: source }, via: [], useCurrentLocation: true, clarification: null, engine: 'search' };
    expect(await interpretRouteIntent(source, {})).toEqual(expected);
    expect(await interpretRouteIntent(source, env)).toEqual(expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'Vorrei andare alla Libreria Ghibellina', 'Da Via Roma alla Torre di Pisa',
    'Take me to the Leaning Tower', 'Go to Torre di Pisa', '去比萨斜塔', '今天想去比萨斜塔，请帮我规划路线',
    'Torre di Pisa oppure Pisa Centrale', 'Torre di Pisa senza gradini',
    'Via Roma poi Via Garibaldi', 'Pisa Centrale Torre di Pisa',
    'casa', '43.720,10.408', 'https://example.invalid', '<b>Via Roma</b>', 'a'.repeat(201),
  ])('does not disguise a request, ambiguity or invalid place as direct search: %s', (source) => {
    expect(directPlaceIntent(source)).toBeNull();
  });

  it.each([
    ['Voglio andare alla Torre di Pisa', 'Torre di Pisa'],
    ['Take me to Leaning Tower of Pisa', 'Torre di Pisa'],
    ['今天想去比萨斜塔，请帮我规划路线', 'Torre di Pisa'],
    ['比萨中央火车站', 'Pisa Centrale'],
    ['Piazza dei Cavalieri', 'Piazza dei Cavalieri'],
    ['Via Roma 10', 'Via Roma 10'],
  ])('handles simple grounded requests without claiming AI: %s', (source, query) => {
    expect(fallbackRouteIntent(source, 'Gemma non disponibile.')).toMatchObject({ intent: 'route', destination: { query }, engine: 'fallback', note: 'Gemma non disponibile.', useCurrentLocation: true });
  });

  it('recognizes simple explicit origins without geolocation or lookup', () => {
    expect(fallbackRouteIntent('Da Via Roma a Via Garibaldi', 'regole')).toMatchObject({ intent: 'route', origin: { query: 'Via Roma' }, destination: { query: 'Via Garibaldi' }, useCurrentLocation: false });
    expect(fallbackRouteIntent('Da qui alla Torre di Pisa', 'regole')).toMatchObject({ intent: 'route', origin: null, useCurrentLocation: true });
  });

  it.each(['Portami al solito posto', 'Via Roma e Via Garibaldi', 'Torre di Pisa poi Pisa Centrale', '从比萨中央火车站到比萨斜塔再去骑士广场', 'Da Via Roma a Via Garibaldi passando per Polo F'])('refuses unclear or multi-stop requests rather than returning a partial fallback route: %s', (source) => {
    expect(fallbackRouteIntent(source, 'regole')).toMatchObject({ intent: 'unclear', destination: null, via: [] });
  });

  it('calls Gemma with separated user data and ignores client-provided engine/coordinates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(google({ ...modelRoute(), engine: 'other', coordinates: [0, 0] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await interpretRouteIntent(text, env);
    expect(result).toMatchObject({ intent: 'route', engine: 'gemma', model: 'gemma-4-26b-a4b-it' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    const payload = JSON.parse(init.body);
    expect(JSON.parse(payload.contents[0].parts[0].text)).toEqual({ request: text });
    expect(payload.systemInstruction.parts[0].text).toMatch(/italiano, inglese e cinese/);
    expect(result).not.toHaveProperty('coordinates');
  });

  it('uses a truthful fallback when keys are absent, requests fail or model evidence is invented', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('private-provider-error', { status: 403 }))
      .mockResolvedValueOnce(google(modelRoute({ destination: { query: 'Via Roma', evidence: 'Via Roma' } })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await interpretRouteIntent('Voglio andare alla Torre di Pisa', {})).toMatchObject({ engine: 'fallback', destination: place });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await interpretRouteIntent('Voglio andare alla Torre di Pisa', env)).toMatchObject({ engine: 'fallback', destination: place });
    expect(await interpretRouteIntent('Voglio andare alla Torre di Pisa', env)).toMatchObject({ engine: 'fallback', destination: place });
  });
});

describe('anonymous route-intent API with no content persistence', () => {
  it('lets direct names bypass the model quota and database without storing text or looking up identity', async () => {
    const identity = vi.fn(async () => { throw new Error('must not query identity'); });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const handler = createCloudApi({ env, db: database.db, osm, getUserId: identity });
    for (const name of ['Libreria Ghibellina', 'Via Roma 10', '比萨斜塔']) {
      const response = await handler(request({ text: name }));
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ engine: 'search', destination: { evidence: name } });
    }
    expect(database.sqlite.prepare('SELECT * FROM provider_limits').all()).toHaveLength(0);
    expect(database.sqlite.prepare('SELECT * FROM geocode_cache').all()).toHaveLength(0);
    expect(database.sqlite.prepare('SELECT * FROM reports').all()).toHaveLength(0);
    const missingDb = createCloudApi({ env, osm, getUserId: identity });
    expect((await missingDb(request({ text: 'Libreria Ghibellina' }))).status).toBe(200);
    const foreign = request({ text: 'Libreria Ghibellina' }); foreign.headers.set('origin', 'https://elsewhere.invalid');
    expect((await handler(foreign)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(identity).not.toHaveBeenCalled();
  });

  it('returns a proposal without identity access, geocoding, routes, reports or stored request text', async () => {
    const identity = vi.fn(async () => { throw new Error('must not query identity'); });
    const fetchMock = vi.fn().mockResolvedValue(google(modelRoute()));
    vi.stubGlobal('fetch', fetchMock);
    const handler = createCloudApi({ env, db: database.db, osm, getUserId: identity });
    const response = await handler(request({ text, lat: 0, userId: 'spoof' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ intent: 'route', engine: 'gemma', destination: place, useCurrentLocation: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(identity).not.toHaveBeenCalled();
    expect(database.sqlite.prepare('SELECT * FROM reports').all()).toHaveLength(0);
    expect(database.sqlite.prepare('SELECT * FROM geocode_cache').all()).toHaveLength(0);
    expect(database.sqlite.prepare('SELECT * FROM provider_limits').all()).toEqual([{ key: 'gemma-analysis-preview', next_at: expect.any(Number) }]);
  });

  it('rejects invalid JSON, oversized text and missing/foreign origins before inference or quota', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const handler = createCloudApi({ env, db: database.db, osm, getUserId: async () => null });
    for (const body of [{ text: '' }, { text: 'a'.repeat(501) }, {}]) expect((await handler(request(body))).status).toBe(400);
    const missing = request({ text }); missing.headers.delete('origin');
    expect((await handler(missing)).status).toBe(403);
    const foreign = request({ text }); foreign.headers.set('origin', 'https://elsewhere.invalid');
    expect((await handler(foreign)).status).toBe(403);
    const malformed = new Request('https://accessgo.test/api/route-intent', { method: 'POST', headers: { Origin: 'https://accessgo.test', 'Content-Type': 'application/json' }, body: '{' });
    expect((await handler(malformed)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(database.sqlite.prepare('SELECT * FROM provider_limits').all()).toHaveLength(0);
  });

  it('shares the five-second quota with report analysis and fails closed without a database', async () => {
    const handler = createCloudApi({ env: {}, db: database.db, osm, getUserId: async () => null });
    expect((await handler(request({ text }))).status).toBe(200);
    expect((await handler(request({ text }))).status).toBe(429);
    const analysis = new Request('https://accessgo.test/api/analyze', { method: 'POST', headers: { Origin: 'https://accessgo.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'Un gradino alto blocca il passaggio.' }) });
    expect((await handler(analysis)).status).toBe(429);
    const missingDb = createCloudApi({ env, osm, getUserId: async () => null });
    expect((await missingDb(request({ text }))).status).toBe(503);
    expect(database.sqlite.prepare('SELECT * FROM reports').all()).toHaveLength(0);
  });
});
