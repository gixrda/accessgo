import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../server/api.ts';
import type { Env } from '../server/errors.ts';

const realFetch = globalThis.fetch;
let server: Server;
let base: string;
let dir: string;

async function start(env: Env) {
  dir = await mkdtemp(join(tmpdir(), 'accessgo-'));
  await writeFile(join(dir, 'osm.json'), JSON.stringify({ source: 'test', fetchedAt: '', bbox: [0, 0, 0, 0], features: [] }));
  const api = createApi({ env, reportsFile: join(dir, 'reports.json'), osmFile: join(dir, 'osm.json') });
  server = createServer((req, res) => { api(req, res).then((h) => { if (!h) { res.statusCode = 404; res.end(); } }); });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Simula i servizi esterni; le chiamate al server di test passano al fetch reale. */
function mockExternal(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => url.startsWith(base) ? realFetch(url, init) : handler(url, init));
}

const call = (path: string, init?: RequestInit) => realFetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) });
const PISA = { lat: 43.7175, lng: 10.4005 };
const OSRM_OK = { code: 'Ok', routes: [{ distance: 680, duration: 543, geometry: { coordinates: [[10.4, 43.716], [10.404, 43.719]] } }] };

afterEach(async () => {
  vi.unstubAllGlobals();
  await new Promise((r) => server.close(r));
});

describe('API senza credenziali', () => {
  beforeEach(() => start({}));

  it('dichiara i fallback attivi', async () => {
    expect(await (await call('/api/status')).json()).toEqual({ routing: 'valhalla', ai: 'fallback', admin: false });
  });

  it('serve il dataset OSM', async () => {
    expect((await (await call('/api/osm')).json()).source).toBe('test');
  });

  it('crea una segnalazione non verificata con tutti i campi richiesti e la persiste', async () => {
    const res = await post('/api/reports', { ...PISA, description: "C'è un gradino alto all'ingresso" });
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r).toMatchObject({ ...PISA, category: 'steps', categorySource: 'interpretation', status: 'unverified', source: 'user_report' });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(r.createdAt)).not.toBeNaN();
    expect(r.interpretation.engine).toBe('fallback');
    expect(await (await call('/api/reports')).json()).toHaveLength(1);
    expect(JSON.parse(await readFile(join(dir, 'reports.json'), 'utf8'))).toHaveLength(1);
  });

  it('rispetta la categoria scelta dall\'utente', async () => {
    const r = await (await post('/api/reports', { ...PISA, description: 'Qualcosa blocca il passaggio qui', category: 'kerb' })).json();
    expect(r).toMatchObject({ category: 'kerb', categorySource: 'user' });
  });

  it.each([
    [{ lat: 45.4, lng: 9.19, description: 'gradino troppo alto' }, 400], // Milano
    [{ lat: 'x', lng: 10.4, description: 'gradino troppo alto' }, 400],
    [{ ...PISA, description: 'corto' }, 400],
    [{ ...PISA, description: 'x'.repeat(1001) }, 400],
    [{ ...PISA, description: 'gradino troppo alto', category: 'lava' }, 400],
  ])('rifiuta input non valido %#', async (body, status) => {
    const res = await post('/api/reports', body);
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBeTypeOf('string');
  });

  it('blocca il doppio invio accidentale', async () => {
    const body = { ...PISA, description: 'Gradino alto davanti al bar' };
    expect((await post('/api/reports', body)).status).toBe(201);
    expect((await post('/api/reports', body)).status).toBe(409);
  });

  it('senza ADMIN_TOKEN non permette di cambiare stato', async () => {
    const r = await (await post('/api/reports', { ...PISA, description: 'Gradino alto davanti al bar' })).json();
    expect((await call(`/api/reports/${r.id}`, { method: 'PATCH', body: '{"status":"verified"}' })).status).toBe(403);
  });

  it('senza chiavi usa il profilo sedia a rotelle di Valhalla (gratuito)', async () => {
    mockExternal((url, init) => {
      expect(url).toBe('https://valhalla1.openstreetmap.de/route');
      const body = JSON.parse(init?.body as string);
      expect(body).toMatchObject({ costing: 'pedestrian', costing_options: { pedestrian: { type: 'wheelchair', step_penalty: 43200 } }, format: 'osrm' });
      return Response.json(OSRM_OK);
    });
    const r = await (await post('/api/route', { from: PISA, to: { lat: 43.719, lng: 10.404 } })).json();
    expect(r).toMatchObject({ mode: 'wheelchair', provider: 'valhalla', distanceM: 680, durationS: 543 });
    expect(r.notice).toBeUndefined();
    expect(r.coords[0]).toEqual([43.716, 10.4]);
  });

  it('se Valhalla non risponde ripiega sul pedonale, senza durata, e lo dichiara', async () => {
    mockExternal((url) => url.includes('valhalla') ? new Response('boom', { status: 500 }) : Response.json(OSRM_OK));
    const r = await (await post('/api/route', { from: PISA, to: PISA })).json();
    expect(r).toMatchObject({ mode: 'foot_fallback', provider: 'osrm-fossgis', durationS: null });
    expect(r.notice).toMatch(/sedia a rotelle ha restituito un errore.*pedonale standard/);
  });

  it('valida le coordinate del percorso', async () => {
    expect((await post('/api/route', { from: PISA, to: { lat: 0, lng: 0 } })).status).toBe(400);
    expect((await post('/api/route', {})).status).toBe(400);
  });

  it('gestisce assenza di percorso e servizi irraggiungibili', async () => {
    const urls: string[] = [];
    mockExternal((url) => { urls.push(url); return Response.json({ code: 'NoRoute', message: 'Impossible route' }, { status: 400 }); });
    const none = await post('/api/route', { from: PISA, to: PISA });
    expect(none.status).toBe(404);
    expect((await none.json()).error).toMatch(/sedia a rotelle/);
    expect(urls).toHaveLength(1); // nessun percorso per sedia a rotelle non viene sostituito da uno pedonale
    mockExternal(() => { throw new TypeError('fetch failed'); });
    const res = await post('/api/route', { from: PISA, to: PISA });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/non raggiungibile/);
  });

  it('gestisce JSON malformato', async () => {
    expect((await call('/api/reports', { method: 'POST', body: '{' })).status).toBe(400);
  });
});

describe('API con credenziali', () => {
  beforeEach(() => start({ ORS_API_KEY: 'ors', ADMIN_TOKEN: 'segreto' }));

  it('usa il profilo wheelchair di OpenRouteService', async () => {
    mockExternal((url, init) => {
      expect(url).toBe('https://api.openrouteservice.org/v2/directions/wheelchair/geojson');
      expect((init?.headers as Record<string, string>).Authorization).toBe('ors');
      return Response.json({ features: [{ geometry: { coordinates: [[10.4, 43.716], [10.404, 43.719]] }, properties: { summary: { distance: 700, duration: 600 } } }] });
    });
    expect(await (await post('/api/route', { from: PISA, to: PISA })).json())
      .toMatchObject({ mode: 'wheelchair', provider: 'openrouteservice', distanceM: 700, durationS: 600 });
  });

  it('con chiave ORS non valida usa Valhalla e lo dichiara', async () => {
    mockExternal((url) => url.includes('openrouteservice') ? new Response('', { status: 401 }) : Response.json(OSRM_OK));
    const r = await (await post('/api/route', { from: PISA, to: PISA })).json();
    expect(r).toMatchObject({ mode: 'wheelchair', provider: 'valhalla' });
    expect(r.notice).toMatch(/Chiave OpenRouteService non valida/);
    expect(JSON.stringify(r)).not.toContain('ors"');
  });

  it('se né ORS né Valhalla rispondono, ripiega sul pedonale', async () => {
    mockExternal((url) => {
      if (url.includes('openrouteservice')) return new Response('', { status: 429 });
      if (url.includes('valhalla')) throw new TypeError('fetch failed');
      return Response.json(OSRM_OK);
    });
    const r = await (await post('/api/route', { from: PISA, to: PISA })).json();
    expect(r.mode).toBe('foot_fallback');
    expect(r.notice).toMatch(/non raggiungibile.*pedonale standard/);
  });

  it('se ORS non trova un percorso per sedia a rotelle non lo sostituisce con uno pedonale', async () => {
    mockExternal(() => new Response('{"error":{"code":2009}}', { status: 404 }));
    const res = await post('/api/route', { from: PISA, to: PISA });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/sedia a rotelle/);
  });

  it('cambia lo stato solo con il codice moderatore corretto', async () => {
    const r = await (await post('/api/reports', { ...PISA, description: 'Gradino alto davanti al bar' })).json();
    const patch = (status: string, token?: string) => call(`/api/reports/${r.id}`, {
      method: 'PATCH', body: JSON.stringify({ status }), headers: token ? { 'x-admin-token': token } : {},
    });
    expect((await patch('verified')).status).toBe(401);
    expect((await patch('verified', 'sbagliato')).status).toBe(401);
    expect((await patch('confermatissima', 'segreto')).status).toBe(400);
    const ok = await patch('verified', 'segreto');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: 'verified', statusUpdatedAt: expect.any(String) });
    expect((await call('/api/reports/inesistente', { method: 'PATCH', body: '{"status":"resolved"}', headers: { 'x-admin-token': 'segreto' } })).status).toBe(404);
  });
});
