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
  dir = await mkdtemp(join(tmpdir(), 'openway-'));
  await writeFile(join(dir, 'osm.json'), JSON.stringify({ source: 'test', fetchedAt: '', bbox: [0, 0, 0, 0], features: [] }));
  const api = createApi({ env, reportsFile: join(dir, 'reports.json'), osmFile: join(dir, 'osm.json') });
  server = createServer((req, res) => { api(req, res).then((h) => { if (!h) { res.statusCode = 404; res.end(); } }); });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Nessuna chiamata di rete reale nei test: i servizi esterni rispondono "non disponibile" salvo mock specifici.
  mockExternal(() => new Response('', { status: 503 }));
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

  it('voce: senza chiave lo dichiara e rifiuta la sintesi', async () => {
    expect(await (await call('/api/voice/status')).json()).toMatchObject({ provider: 'elevenlabs', configured: false });
    const res = await post('/api/voice/speak', { text: 'Ciao' });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/non è configurato/);
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

  it('assistente: bozza analizzata, risposta alla domanda e foto salvate con la segnalazione', async () => {
    const photo = `data:image/jpeg;base64,${Buffer.from('jpeg-finto').toString('base64')}`;
    const draftRes = await post('/api/reports/draft', { description: "C'è un gradino alto davanti al bar", photo });
    expect(draftRes.status).toBe(200);
    const draft = await draftRes.json();
    expect(draft.draftId).toMatch(/^[0-9a-f-]{36}$/);
    expect(draft.interpretation.question.options).toContain('Più di 10 cm');

    expect((await post('/api/reports', { ...PISA, description: "C'è un gradino alto davanti al bar", draftId: draft.draftId, answer: 'Inventata' })).status).toBe(400);
    const res = await post('/api/reports', { ...PISA, description: "C'è un gradino alto davanti al bar", draftId: draft.draftId, answer: 'Più di 10 cm' });
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r).toMatchObject({ hasPhoto: true, status: 'unverified', followUp: { question: draft.interpretation.question.text, answer: 'Più di 10 cm' } });
    const img = await call(`/api/reports/${r.id}/photo`);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await img.arrayBuffer()).toString()).toBe('jpeg-finto');
  });

  it('una bozza non vale per un testo diverso da quello analizzato', async () => {
    const photo = `data:image/jpeg;base64,${Buffer.from('x').toString('base64')}`;
    const draft = await (await post('/api/reports/draft', { description: 'Gradino alto davanti al bar', photo })).json();
    const r = await (await post('/api/reports', { ...PISA, description: 'Testo cambiato dopo l\'analisi', draftId: draft.draftId })).json();
    expect(r.hasPhoto).toBe(false);
    expect((await call(`/api/reports/${r.id}/photo`)).status).toBe(404);
  });

  it('accetta solo foto JPEG di dimensioni ragionevoli', async () => {
    expect((await post('/api/reports/draft', { description: 'Gradino alto davanti al bar', photo: 'data:image/png;base64,AAAA' })).status).toBe(400);
    expect((await post('/api/reports/draft', { description: 'Gradino alto davanti al bar', photo: '../../etc/passwd' })).status).toBe(400);
    const big = `data:image/jpeg;base64,${'A'.repeat(2_100_000)}`;
    expect((await post('/api/reports/draft', { description: 'Gradino alto davanti al bar', photo: big })).status).toBe(413);
  });

  it('le segnalazioni bloccanti vengono evitate nel calcolo del percorso', async () => {
    const blocked = await (await post('/api/reports', { ...PISA, description: 'Cantiere sul marciapiede: non riesco a passare' })).json();
    expect(blocked).toMatchObject({ blocking: true, blockingSource: 'interpretation' });
    // chi segnala può correggere la proposta dell'analisi
    const minor = await (await post('/api/reports', { lat: PISA.lat + 0.001, lng: PISA.lng, description: 'Buca piccola, si passa con attenzione', blocking: false })).json();
    expect(minor).toMatchObject({ blocking: false, blockingSource: 'user' });
    // chi segnala può anche dichiararla bloccante quando l'analisi non lo capisce
    const declared = await (await post('/api/reports', { lat: PISA.lat - 0.001, lng: PISA.lng, description: 'Transenne davanti al portone', blocking: true })).json();
    expect(declared).toMatchObject({ blocking: true, blockingSource: 'user' });

    const routeBodies: Record<string, unknown>[] = [];
    mockExternal((url, init) => {
      if (url.includes('valhalla') && url.endsWith('/route')) routeBodies.push(JSON.parse(init!.body as string));
      return Response.json(OSRM_OK);
    });
    const r = await (await post('/api/route', { from: PISA, to: { lat: 43.719, lng: 10.404 } })).json();
    expect(routeBodies[0].exclude_polygons).toHaveLength(2); // le due bloccanti, non quella superabile
    expect(r.avoidedBlocking).toBe(2);
    // il percorso a piedi di confronto non esclude nulla
    await post('/api/route', { from: PISA, to: PISA, profile: 'foot' });
    expect(routeBodies[1].exclude_polygons).toBeUndefined();
  });

  it('aggancia la segnalazione alla rete e decide l\'effetto sul percorso', async () => {
    mockExternal((url) => url.endsWith('/locate')
      ? Response.json([{ edges: [{ correlated_lat: 43.71755, correlated_lon: 10.40052, distance: 4.2 }, { correlated_lat: 43.7, correlated_lon: 10.4, distance: 9 }] }])
      : new Response('', { status: 503 }));
    const r = await (await post('/api/reports', { ...PISA, description: 'Scale all\'ingresso del palazzo' })).json();
    expect(r).toMatchObject({ category: 'steps', impact: 'avoid', snap: { lat: 43.71755, lng: 10.40052, distanceM: 4.2 } });

    mockExternal((url) => url.endsWith('/locate')
      ? Response.json([{ edges: [{ correlated_lat: 43.7177, correlated_lon: 10.4009, distance: 31 }] }])
      : new Response('', { status: 503 }));
    const far = await (await post('/api/reports', { ...PISA, lat: PISA.lat + 0.0003, description: 'Transenne: non riesco a passare' })).json();
    expect(far).toMatchObject({ impact: 'unlocated' });

    const minor = await (await post('/api/reports', { ...PISA, lng: PISA.lng + 0.0004, description: 'Buca nel marciapiede, si passa' })).json();
    expect(minor.impact).toBe('caution');
  });

  it('3. il routing esclude l\'area attorno al punto agganciato, non al punto toccato', async () => {
    mockExternal((url) => url.endsWith('/locate')
      ? Response.json([{ edges: [{ correlated_lat: 43.71760, correlated_lon: 10.40060, distance: 6 }] }])
      : new Response('', { status: 503 }));
    await post('/api/reports', { ...PISA, description: 'Cantiere: non riesco a passare' });
    const bodies: Record<string, unknown>[] = [];
    mockExternal((url, init) => {
      if (url.endsWith('/route')) bodies.push(JSON.parse(init!.body as string));
      return Response.json(OSRM_OK);
    });
    await post('/api/route', { from: PISA, to: { lat: 43.719, lng: 10.404 } });
    const ring = (bodies[0].exclude_polygons as [number, number][][])[0];
    const center = [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2];
    expect(center[0]).toBeCloseTo(10.4006, 5);
    expect(center[1]).toBeCloseTo(43.7176, 5);
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
    expect(r.notice).toMatch(/sedia a rotelle ha avuto un problema.*normale percorso a piedi/);
  });

  it('calcola il percorso a piedi per il confronto con lo stesso motore, OSRM come riserva', async () => {
    mockExternal((url, init) => {
      expect(url).toContain('valhalla');
      expect(JSON.parse(init?.body as string).costing_options).toEqual({ pedestrian: { type: 'foot' } });
      return Response.json(OSRM_OK);
    });
    expect(await (await post('/api/route', { from: PISA, to: PISA, profile: 'foot' })).json()).toMatchObject({ mode: 'foot', provider: 'valhalla' });
    mockExternal((url) => url.includes('valhalla') ? new Response('', { status: 502 }) : Response.json(OSRM_OK));
    expect(await (await post('/api/route', { from: PISA, to: PISA, profile: 'foot' })).json()).toMatchObject({ mode: 'foot', provider: 'osrm-fossgis' });
    expect((await post('/api/route', { from: PISA, to: PISA, profile: 'auto' })).status).toBe(400);
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
    expect((await res.json()).error).toMatch(/Controlla la connessione/);
  });

  it('gestisce JSON malformato', async () => {
    expect((await call('/api/reports', { method: 'POST', body: '{' })).status).toBe(400);
  });
});

describe('API con credenziali', () => {
  beforeEach(() => start({ ORS_API_KEY: 'ors', ADMIN_TOKEN: 'segreto' }));

  it('usa il profilo wheelchair di OpenRouteService', async () => {
    const orsCalls: RequestInit[] = [];
    mockExternal((url, init) => {
      if (url.includes('trace_attributes')) return new Response('', { status: 503 }); // verifica tratti non disponibile
      expect(url).toBe('https://api.openrouteservice.org/v2/directions/wheelchair/geojson');
      orsCalls.push(init!);
      return Response.json({ features: [{ geometry: { coordinates: [[10.4, 43.716], [10.404, 43.719]] }, properties: { summary: { distance: 700, duration: 600 } } }] });
    });
    expect(await (await post('/api/route', { from: PISA, to: PISA })).json())
      .toMatchObject({ mode: 'wheelchair', provider: 'openrouteservice', distanceM: 700, durationS: 600, safety: { checked: false } });
    expect((orsCalls[0].headers as Record<string, string>).Authorization).toBe('ors');
  });

  it('con chiave ORS non valida usa Valhalla e lo dichiara', async () => {
    mockExternal((url) => url.includes('openrouteservice') ? new Response('', { status: 401 }) : Response.json(OSRM_OK));
    const r = await (await post('/api/route', { from: PISA, to: PISA })).json();
    expect(r).toMatchObject({ mode: 'wheelchair', provider: 'valhalla' });
    expect(r.notice).toMatch(/OpenRouteService non è configurato correttamente/);
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
    expect(r.notice).toMatch(/non risponde.*normale percorso a piedi/);
  });

  it('se ORS non trova un percorso per sedia a rotelle non lo sostituisce con uno pedonale', async () => {
    mockExternal(() => new Response('{"error":{"code":2009}}', { status: 404 }));
    const res = await post('/api/route', { from: PISA, to: PISA });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/sedia a rotelle/);
  });

  it('una segnalazione bloccante risolta non viene più evitata', async () => {
    const r = await (await post('/api/reports', { ...PISA, description: 'Cantiere sul marciapiede: non riesco a passare' })).json();
    await call(`/api/reports/${r.id}`, { method: 'PATCH', body: '{"status":"resolved"}', headers: { 'x-admin-token': 'segreto' } });
    const bodies: Record<string, unknown>[] = [];
    mockExternal((url, init) => {
      if (url.includes('valhalla') && url.endsWith('/route')) bodies.push(JSON.parse(init!.body as string));
      return url.includes('openrouteservice') ? new Response('', { status: 503 }) : Response.json(OSRM_OK);
    });
    await post('/api/route', { from: PISA, to: PISA });
    expect(bodies[0].exclude_polygons).toBeUndefined();
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
